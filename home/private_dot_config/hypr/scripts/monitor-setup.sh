#!/bin/bash
# Monitor setup script for HOME configuration
# Called by Hyprland when monitors connect

# Get all connected Acer monitors (they have identical serials, so we just get port names)
ACER_MONITORS=($(hyprctl monitors -j | jq -r '.[] | select(.make == "Acer Technologies") | .name'))

# Count how many Acers are connected
ACER_COUNT=${#ACER_MONITORS[@]}

if [ "$ACER_COUNT" -eq 2 ]; then
    # HOME setup: 2 Acer monitors
    # Assign arbitrarily - use Super+F12 to swap if wrong
    RIGHT="${ACER_MONITORS[0]}"
    CENTER="${ACER_MONITORS[1]}"

    # Apply all monitors atomically to prevent overlap warnings
    hyprctl --batch "\
        keyword monitor desc:BOE 0x0B12,2560x1600@240,0x0,1.6; \
        keyword monitor $CENTER,1920x1080@165,1600x0,1; \
        keyword monitor $RIGHT,1920x1080@165,3520x0,1"

    # Re-apply wallpaper to all monitors after setup
    sleep 0.2
    $HOME/.config/hypr/scripts/swww_apply.sh

    notify-send "Monitor Setup" "HOME: Press Super+F12 to swap Acers if wrong"

elif [ "$ACER_COUNT" -eq 1 ]; then
    # Single Acer monitor - place it to the right of laptop
    hyprctl --batch "\
        keyword monitor desc:BOE 0x0B12,2560x1600@240,0x0,1.6; \
        keyword monitor ${ACER_MONITORS[0]},1920x1080@165,1600x0,1"

    # Re-apply wallpaper to all monitors after setup
    sleep 0.2
    $HOME/.config/hypr/scripts/swww_apply.sh

    notify-send "Monitor Setup" "Single Acer: ${ACER_MONITORS[0]} (right of laptop)"

else
    # No Acer monitors - just laptop (no notification for single screen)
    hyprctl keyword monitor "desc:BOE 0x0B12,2560x1600@240,0x0,1.6"
fi
