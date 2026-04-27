#!/bin/bash

# 1. Configuration
WALL_DIR="/home/marc/.config/hypr/wallpapers"
GLOBAL_CONFIGS="/home/marc/.config/hypr/global_configs"
CURRENT=$(cat "$GLOBAL_CONFIGS/wallpaper" 2>/dev/null || echo "dark")
WALL_PATH="$WALL_DIR/${CURRENT}.png"

# 2. Start the daemon if not running
if ! pgrep -x "swww-daemon" > /dev/null; then
    swww-daemon --format xrgb &
    # Wait for the socket (swww is very fast, 0.1s is usually enough)
    sleep 0.1
fi

# 3. Wait for monitors to be fully initialized
sleep 0.5

# 4. Get all connected monitors
MONITORS=$(hyprctl monitors -j | jq -r '.[].name' | tr '\n' ',' | sed 's/,$//')

# 5. Apply the image to ALL monitors explicitly
# --transition-type: simple, fade, left, right, top, bottom, wipe, wave, grow, center, any
swww img "$WALL_PATH" --transition-type simple --transition-step 255 --outputs "$MONITORS"

exit 0