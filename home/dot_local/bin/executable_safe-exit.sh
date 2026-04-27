#!/usr/bin/env bash
# Hyprland session exit with DisplayLink awareness.
#
# On machines with DisplayLink, stops the service first so evdi cards release
# cleanly — avoids DRM races that freeze the next session.
# On machines without it, just exits Hyprland directly (no overhead).

set -u

if systemctl is-active --quiet displaylink.service 2>/dev/null; then
  # --no-block: SIGTERM is dispatched immediately and we don't wait for DL to
  # fully stop (~2s). It finishes dying while the TTY1 autologin cycle runs,
  # so by the time the new Hyprland session boots, evdi is already released.
  sudo -n systemctl stop --no-block displaylink.service 2>/dev/null || true
fi

hyprctl dispatch exit 0
