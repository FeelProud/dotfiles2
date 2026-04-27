#!/bin/bash

# Configuration
WALL_DIR="/home/marc/.config/hypr/wallpapers"
GLOBAL_CONFIGS="/home/marc/.config/hypr/global_configs"
CURRENT=$(cat "$GLOBAL_CONFIGS/wallpaper" 2>/dev/null || echo "dark")
WALL_PATH="$WALL_DIR/${CURRENT}.png"

# Get all connected monitors
MONITORS=$(hyprctl monitors -j | jq -r '.[].name' | tr '\n' ',' | sed 's/,$//')

# Apply the wallpaper to ALL monitors explicitly
swww img "$WALL_PATH" --transition-type simple --transition-step 255 --outputs "$MONITORS"

exit 0
