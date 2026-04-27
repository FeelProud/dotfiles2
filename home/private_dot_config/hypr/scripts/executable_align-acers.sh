#!/bin/bash
# Align the two Acer monitors to their correct physical positions using EDID serial.
#
# First invocation (no state file): saves current layout as the "correct" baseline.
# Later invocations: re-applies the baseline so physical-middle always ends up at x=1280.

STATE_FILE="$HOME/.local/state/acer-middle-serial"

# Read EDID bytes 12-15 as little-endian u32 (unique per physical monitor)
get_edid_serial() {
    local port=$1
    local edid
    edid=$(ls /sys/class/drm/card*-"$port"/edid 2>/dev/null | head -1)
    [ -z "$edid" ] && return 1
    dd if="$edid" bs=1 skip=12 count=4 2>/dev/null | od -An -tu1 | \
        awk '{print $1 + $2*256 + $3*65536 + $4*16777216}'
}

mapfile -t ACERS < <(hyprctl monitors -j | jq -r '.[] | select(.make=="Acer Technologies") | .name')
if [ ${#ACERS[@]} -ne 2 ]; then
    notify-send "Align Acers" "Need exactly 2 Acer monitors connected"
    exit 0
fi

PORT1="${ACERS[0]}"
PORT2="${ACERS[1]}"
SER1=$(get_edid_serial "$PORT1")
SER2=$(get_edid_serial "$PORT2")

if [ -f "$STATE_FILE" ]; then
    MIDDLE_SER=$(cat "$STATE_FILE")
    if [ "$SER1" = "$MIDDLE_SER" ]; then
        MIDDLE="$PORT1"; RIGHT="$PORT2"
    elif [ "$SER2" = "$MIDDLE_SER" ]; then
        MIDDLE="$PORT2"; RIGHT="$PORT1"
    else
        notify-send "Align Acers" "Saved serial not found — rerun to resave"
        exit 1
    fi
    hyprctl --batch "keyword monitor ${MIDDLE},1920x1080@60.0,1280x0,1 ; keyword monitor ${RIGHT},1920x1080@60.0,3200x0,1"
    hyprctl dispatch moveworkspacetomonitor 2 "$MIDDLE"
    hyprctl dispatch moveworkspacetomonitor 3 "$RIGHT"
    notify-send "Align Acers" "Positions applied ($MIDDLE=middle)"
else
    # Bootstrap: whichever Acer is currently at the lower x is "middle"
    CURR_MIDDLE=$(hyprctl monitors -j | jq -r '[.[] | select(.make=="Acer Technologies")] | sort_by(.x)[0].name')
    SER=$(get_edid_serial "$CURR_MIDDLE")
    mkdir -p "$(dirname "$STATE_FILE")"
    echo "$SER" > "$STATE_FILE"
    notify-send "Align Acers" "Baseline saved: $CURR_MIDDLE is middle (serial $SER)"
fi
