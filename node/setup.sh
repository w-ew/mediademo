#!/bin/sh

# remove evdev debugging module to limit dmesg output
modprobe -r evbug

# set up the on-board MIC as the audio input source
amixer cset name='Right Input Mixer Boost Switch' on
amixer cset name='Right Boost Mixer RINPUT1 Switch' on
amixer cset name='Right Boost Mixer RINPUT2 Switch' on
amixer cset name='Right Boost Mixer RINPUT3 Switch' off
amixer cset name='ADC PCM Capture Volume' 192
amixer cset name='ADC Data Output Select' 2
