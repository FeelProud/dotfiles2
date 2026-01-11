#!/bin/bash
# Swap the two Acer monitors (center <-> right)

ACER_MONITORS=($(hyprctl monitors -j | jq -r '.[] | select(.make == "Acer Technologies") | .name'))

if [ ${#ACER_MONITORS[@]} -ne 2 ]; then
    notify-send "Swap Monitors" "Need exactly 2 Acer monitors connected"
    exit 1
fi

MON1="${ACER_MONITORS[0]}"
MON2="${ACER_MONITORS[1]}"

# Fixed positions: center=1600, right=3520
# Find which one is currently at center (1600)
MON1_X=$(hyprctl monitors -j | jq -r ".[] | select(.name == \"$MON1\") | .x")

if [ "$MON1_X" -eq 1600 ]; then
    # MON1 is center, MON2 is right -> swap them
    hyprctl --batch "keyword monitor $MON1,1920x1080@165,3520x0,1; keyword monitor $MON2,1920x1080@165,1600x0,1"
else
    # MON1 is right, MON2 is center -> swap them
    hyprctl --batch "keyword monitor $MON1,1920x1080@165,1600x0,1; keyword monitor $MON2,1920x1080@165,3520x0,1"
fi

# Restart AGS to update bars on new monitor layout
pkill -x gjs
sleep 0.3
ags run &

notify-send "Swap Monitors" "Swapped Acer monitors"
