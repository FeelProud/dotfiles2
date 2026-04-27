#!/bin/bash
# Swap the X positions of the two Acer monitors (fixes cursor navigation
# when the dock enumerated the ports in the opposite physical order).

mapfile -t ACERS < <(hyprctl monitors -j | jq -r '.[] | select(.make == "Acer Technologies") | "\(.name)\t\(.x)"')

if [ ${#ACERS[@]} -ne 2 ]; then
    notify-send "Swap Acer positions" "Need exactly 2 Acer monitors connected"
    exit 1
fi

NAME1=$(echo "${ACERS[0]}" | cut -f1)
X1=$(echo "${ACERS[0]}" | cut -f2)
NAME2=$(echo "${ACERS[1]}" | cut -f1)
X2=$(echo "${ACERS[1]}" | cut -f2)

# Atomic swap to avoid transient overlap warning
hyprctl --batch "keyword monitor ${NAME1},1920x1080@60.0,${X2}x0,1 ; keyword monitor ${NAME2},1920x1080@60.0,${X1}x0,1"

notify-send "Swap Acer positions" "Cursor navigation swapped"
