#!/bin/bash
# Sync colors to all application configs
set -e

CONFIG_DIR="$HOME/.config"
COLOR_FILE="$CONFIG_DIR/hypr/global_configs/color"

if [ ! -f "$COLOR_FILE" ]; then
    echo "Color file not found!"
    exit 1
fi

ACCENT_PRIMARY=$(cat "$COLOR_FILE" | tr -d '[:space:]')
echo "Syncing accent color: $ACCENT_PRIMARY"

# 1. Update AGS _variables.scss (Using a more robust regex)
AGS_VARS="$CONFIG_DIR/ags/styles/_variables.scss"
if [ -f "$AGS_VARS" ]; then
    sed -i "s/\$accent-primary:[^;]*/\$accent-primary: $ACCENT_PRIMARY/" "$AGS_VARS"
    sed -i "s/\$accent-secondary:[^;]*/\$accent-secondary: $ACCENT_PRIMARY/" "$AGS_VARS"
    echo "Updated: $AGS_VARS"
fi

# 2. Update Rofi
r=$((16#${ACCENT_PRIMARY:1:2}))
g=$((16#${ACCENT_PRIMARY:3:2}))
b=$((16#${ACCENT_PRIMARY:5:2}))
ACCENT_HOVER="rgba($r, $g, $b, 0.1)"
ACCENT_ACTIVE="rgba($r, $g, $b, 0.15)"

for ROFI_FILE in "$CONFIG_DIR/rofi/forest-launcher.rasi" "$CONFIG_DIR/rofi/forest-launcher-light.rasi"; do
    if [ -f "$ROFI_FILE" ]; then
        sed -i "s/hover-bg:[^;]*/hover-bg: $ACCENT_HOVER/" "$ROFI_FILE"
        sed -i "s/active-bg:[^;]*/active-bg: $ACCENT_ACTIVE/" "$ROFI_FILE"
        echo "Updated: $ROFI_FILE"
    fi
done

# 3. Update ZSH (ANSI 256)
ZSHRC="$HOME/.zshrc"
if [ -f "$ZSHRC" ]; then
    r6=$((r * 6 / 256))
    g6=$((g * 6 / 256))
    b6=$((b * 6 / 256))
    ANSI_COLOR=$((16 + 36 * r6 + 6 * g6 + b6))
    
    sed -i "s/\(zstyle ':prompt:pure:path' color\) [0-9]\+/\1 $ANSI_COLOR/" "$ZSHRC"
    sed -i "s/\(zstyle ':prompt:pure:git:branch' color\) [0-9]\+/\1 $ANSI_COLOR/" "$ZSHRC"
    sed -i "s/\(zstyle ':prompt:pure:git:dirty' color\) [0-9]\+/\1 $ANSI_COLOR/" "$ZSHRC"
    sed -i "s/\(zstyle ':prompt:pure:prompt:success' color\) [0-9]\+/\1 $ANSI_COLOR/" "$ZSHRC"
    echo "Updated: $ZSHRC"
fi

# 4. Update dircolors
DIR_COLORS="$HOME/.dir_colors"
if [ -f "$DIR_COLORS" ]; then
    sed -i "s/^DIR .*/DIR 01;38;5;$ANSI_COLOR/" "$DIR_COLORS"
    echo "Updated: $DIR_COLORS"
fi

echo "Sync complete. Application reload should be handled by the caller."