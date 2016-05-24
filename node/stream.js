console.log("*** node.js alsa/ogg stream server ***");

/* Settings */

const sample_rate = 16000;
const channels = 1;

const capture_cmd = 'arecord';
const capture_args = 
	'-t raw -r ' + sample_rate + ' -f S16_LE -c ' + channels + ' -';

const encode_cmd = 'oggenc';
const encode_args =  
	'-r -R ' + sample_rate + ' -C ' + channels + ' -m 32 -M 64 -';

const http_port = 8080;

const accel_enable = '/sys/devices/virtual/misc/FreescaleAccelerometer/enable'
const accel_input =  '/sys/devices/virtual/misc/FreescaleAccelerometer/data'

const mag_cmd = './mag3110'

const spawn = require('child_process').spawn;
const http = require('http');
const fs = require('fs');

var connections = 0;

/* debug: stacktrace every error and continue execution */
process.on('uncaughtException', function(err) {
	console.error('UNCAUGHT ' + err.stack);
});

/* helper: write t seconds of silence into dest stream */
function generate_silence(dest, t) {
	const silence = Buffer(sample_rate * 2).fill(0);

	while(t--) dest.write(silence);
}


function handle_audio_req(req, resp) {
	resp.writeHead(200, { 
		"Access-Control-Allow-Origin": "*",
		"Content-type": "audio/ogg"
	});

	var close = false;

	connections += 1;
	console.log(
		req.connection.remoteAddress + ':' +
		req.connection.remotePort + 
	 	' connected (now ' + connections + ')'
	);

	/* encoder task */

	const encode_proc = spawn(encode_cmd, encode_args.split(' '));

	encode_proc.stdout.on('data', function(data) {
		if(close) return;

		resp.write(data);
		process.stderr.write('.');
	});

	/* capture task */

	console.log('starting capture');
	const capture_proc = spawn(capture_cmd, capture_args.split(' '));

	capture_proc.stdout.on('data', function(data) {
		if(close) return;

		encode_proc.stdin.write(data);
	});

	resp.on('close', function() {

		/* indicate to other callbacks that the connection is closed */
		close = true;

		/* kill children */
		capture_proc.kill('SIGINT');
		encode_proc.kill('SIGINT');
		
		connections -= 1;

		console.log('Connection closed (now ' + connections + ')');
	});
};


/* Magnetometer app. must be running all the time */
var mag_cal = { off: { x: -1785, y: 1095, z: 735 }, sc: { x: 505, y: 485, z: 485 } };
var mag_data = [ 0, 0, 0 ];

const mag_proc = spawn(mag_cmd, [], {
	stdio: ['ignore', 'ipc', 'ignore']
});

mag_proc.on('message', function(msg) {
	msg.x = (msg.x - mag_cal.off.x) / mag_cal.sc.x;
	msg.y = (msg.y - mag_cal.off.y) / mag_cal.sc.y;
	msg.z = (msg.z - mag_cal.off.z) / mag_cal.sc.z;

	mag_data = [ msg.x, msg.y, msg.z ];
});

function handle_imu_req(req, resp) {
	resp.writeHead(200, { 
		"Access-Control-Allow-Origin": "*",
		"Content-type": "text/plain"
	});

	fs.readFile(accel_input, function(err,data) {

		var accel_data = [ 0, 0, 0 ];

		if(!err) {	
			accel_data = data.toString()
				.split(',')
				.map(function(x) { return Number(x)/16384; });
		};

		resp.end(JSON.stringify({
			a_x: accel_data[0],
			a_y: accel_data[1],
			a_z: accel_data[2],
			m_x: mag_data[0],
			m_y: mag_data[1],
			m_z: mag_data[2]
		}));
	});
};




function handle_mag_req(req, resp) {
	resp.writeHead(200, { 
		"Access-Control-Allow-Origin": "*",
		"Content-type": "text/plain"
	});

	resp.end(JSON.stringify(mag_data));
};


const stream_server = http.createServer(function(req, resp) {
	if(req.url == "/audio") 
		handle_audio_req(req, resp);
	else
	if(req.url == "/imu")
		handle_imu_req(req, resp);
	else {
		console.log("Error 404: " + req.url);
		resp.statusCode = 404;
		resp.statusMessage = "Not found";
		resp.end();
	};

});

fs.writeFileSync(accel_enable, '1');

stream_server.listen(http_port);

process.on('exit', function() {
	fs.writeFileSync(accel_enable, '0');
});

/* uncaught Ctrl-C does not trigger the 'exit' event by itself */
process.on('SIGINT', function() {
	console.log("Received SIGINT, exiting...");
	process.exit(1);
});

