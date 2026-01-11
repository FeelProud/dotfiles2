#!/usr/bin/env bash

# Fast screenshot wrapper using grim with low compression
# Uses compression level 1 instead of default 6 for much faster captures

set -e

MODE="${1:-region}"
OUTPUT_DIR="${HOME}/Pictures/Screenshots"
mkdir -p "$OUTPUT_DIR"

case "$MODE" in
    region)
        GEOMETRY=$(slurp -d)
        ;;
    output)
        GEOMETRY=$(slurp -or)
        ;;
    window)
        CLIENTS=$(hyprctl -j clients | jq -r '.[] | "\(.at[0]),\(.at[1]) \(.size[0])x\(.size[1])"')
        GEOMETRY=$(slurp -r <<< "$CLIENTS")
        ;;
    *)
        echo "Usage: $0 [region|output|window] [--raw]"
        exit 1
        ;;
esac

if [[ "$2" == "--raw" ]]; then
    grim -l 1 -g "$GEOMETRY" -
else
    FILENAME="$(date +'%Y-%m-%d-%H%M%S_screenshot.png')"
    grim -l 1 -g "$GEOMETRY" "$OUTPUT_DIR/$FILENAME"
    wl-copy < "$OUTPUT_DIR/$FILENAME"
    notify-send "Screenshot saved" "Saved to $OUTPUT_DIR/$FILENAME" -i "$OUTPUT_DIR/$FILENAME" -a Screenshot
fi
