#!/bin/bash
# Intelligent brightness control script for Hyprland
# Handles both laptop display and external monitors automatically

ACTION="$1"  # up or down
STEP="${2:-5}"  # default 5%

if [ "$ACTION" != "up" ] && [ "$ACTION" != "down" ]; then
    echo "Usage: $0 {up|down} [step_percent]"
    exit 1
fi

# Function to check if external monitors are connected
has_external_monitors() {
    hyprctl monitors -j | jq -r '.[].name' | grep -v "^eDP-" | grep -q .
}

# Function to adjust laptop brightness
adjust_laptop() {
    if [ "$ACTION" = "up" ]; then
        brightnessctl -e4 -n2 set "${STEP}%+"
    else
        brightnessctl -e4 -n2 set "${STEP}%-"
    fi
}

# Function to adjust external monitor brightness via DDC/CI
adjust_external() {
    # Get list of external monitor displays (excluding eDP for laptop)
    local displays=$(ddcutil detect --brief 2>/dev/null | grep -oP 'Display \K[0-9]+')

    if [ -z "$displays" ]; then
        # No DDC/CI capable monitors found, fall back to laptop
        adjust_laptop
        return
    fi

    # Adjust brightness for each external display
    for display in $displays; do
        local current=$(ddcutil getvcp 10 --display "$display" 2>/dev/null | grep -oP 'current value =\s+\K[0-9]+')

        if [ -n "$current" ]; then
            local new_value
            if [ "$ACTION" = "up" ]; then
                new_value=$((current + STEP))
                [ $new_value -gt 100 ] && new_value=100
            else
                new_value=$((current - STEP))
                [ $new_value -lt 0 ] && new_value=0
            fi

            ddcutil setvcp 10 "$new_value" --display "$display" 2>/dev/null &
        fi
    done
    wait
}

# Main logic: prioritize external monitors if connected
if has_external_monitors && command -v ddcutil &> /dev/null; then
    # External monitors connected and ddcutil available
    adjust_external
else
    # Only laptop display or ddcutil not available
    adjust_laptop
fi
