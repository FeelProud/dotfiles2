#!/bin/bash
# Swap the two Acer monitors (center <-> right)

ACER_MONITORS=($(hyprctl monitors -j | jq -r '.[] | select(.make == "Acer Technologies") | .name'))

if [ ${#ACER_MONITORS[@]} -ne 2 ]; then
    notify-send "Swap Monitors" "Need exactly 2 Acer monitors connected"
    exit 1
fi

hyprctl dispatch swapactiveworkspaces "${ACER_MONITORS[0]}" "${ACER_MONITORS[1]}"

notify-send "Swap Monitors" "Swapped Acer monitors"
