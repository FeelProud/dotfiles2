import { Gtk } from "ags/gtk4"
import { Accessor } from "ags"
import AstalBattery from "gi://AstalBattery?version=0.1"
import PowerProfiles from "gi://AstalPowerProfiles"

type PowerProfile = "performance" | "balanced" | "power-saver"

const PROFILE_ICONS: Record<PowerProfile, string> = {
  "performance": "⚡",
  "balanced": "⚖",
  "power-saver": "🌿"
}

const PROFILE_LABELS: Record<PowerProfile, string> = {
  "performance": "Performance",
  "balanced": "Balanced",
  "power-saver": "Power Saver"
}

export function Battery() {
  const battery = AstalBattery.get_default()
  const powerProfiles = PowerProfiles.get_default()

  // 1. Percentage
  const percentage = new Accessor(
    () => `${Math.round(battery.percentage * 100)}%`,
    (callback) => {
      const id = battery.connect("notify::percentage", callback)
      return () => battery.disconnect(id)
    }
  )

  // 2. Icon Name (Ensure this is named correctly)
  const batteryIcon = new Accessor(
    () => battery.batteryIconName,
    (callback) => {
      const id = battery.connect("notify::battery-icon-name", callback)
      return () => battery.disconnect(id)
    }
  )

  // 3. Power Profile
  const currentProfile = new Accessor(
    () => powerProfiles.activeProfile as PowerProfile,
    (callback) => {
      const id = powerProfiles.connect("notify::active-profile", callback)
      return () => powerProfiles.disconnect(id)
    }
  )

  const formatTime = (seconds: number): string => {
    if (!isFinite(seconds) || isNaN(seconds) || seconds <= 0) return null as unknown as string
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
  }

  // Calculate estimated time to full using energy rate when UPower doesn't provide it
  const estimateTimeToFull = (): number => {
    const rate = Math.abs(battery.energyRate)
    if (rate <= 0) return 0
    const energyFull = battery.energyFull || battery.energy / battery.percentage
    const energyNeeded = energyFull - battery.energy
    if (energyNeeded <= 0) return 0
    return (energyNeeded / rate) * 3600
  }

  // 4. Time Remaining (Robust logic)
  const timeRemaining = new Accessor(
    () => {
      if (battery.percentage >= 0.98 && battery.charging) return "Fully Charged"
      if (battery.charging) {
        let time = battery.timeToFull
        if (!time || time <= 0) time = estimateTimeToFull()
        const formatted = formatTime(time)
        return formatted ? `Full in: ${formatted}` : "Full in: Calculating..."
      }
      const formatted = formatTime(battery.timeToEmpty)
      return formatted ? `Remaining: ${formatted}` : "Remaining: Calculating..."
    },
    (callback) => {
      const ids = [
        battery.connect("notify::time-to-full", callback),
        battery.connect("notify::time-to-empty", callback),
        battery.connect("notify::charging", callback),
        battery.connect("notify::energy-rate", callback),
        battery.connect("notify::energy", callback),
      ]
      return () => ids.forEach(id => battery.disconnect(id))
    }
  )

  const setProfile = (profile: PowerProfile) => {
    powerProfiles.activeProfile = profile
  }

  return (
    <menubutton cssClasses={["battery-widget"]}>
      <box spacing={4}>
        {/* Changed iconName to batteryIcon to ensure no conflicts */}
        <Gtk.Image iconName={batteryIcon.as(i => i || "battery-missing-symbolic")} />
        <label label={percentage.as(p => p)} />
      </box>
      <popover>
        <box orientation={Gtk.Orientation.VERTICAL} spacing={6} cssClasses={["battery-menu"]}>
          {/* Battery Status Section */}
          <box orientation={Gtk.Orientation.VERTICAL} spacing={2} cssClasses={["battery-status"]}>
            <label label={percentage.as(p => `Battery: ${p}`)} />
            <label label={timeRemaining.as(t => t)} />
          </box>

          <box cssClasses={["separator"]} />

          {/* Current Profile Section */}
          <box orientation={Gtk.Orientation.VERTICAL} spacing={2} cssClasses={["current-profile"]}>
            <label label={currentProfile.as(p => `Mode: ${PROFILE_LABELS[p]}`)} />
          </box>

          <box cssClasses={["separator"]} />

          {/* Power Profile Buttons Section */}
          <box orientation={Gtk.Orientation.VERTICAL} spacing={4} cssClasses={["profile-buttons"]}>
            {(["performance", "balanced", "power-saver"] as PowerProfile[]).map((profile) => (
              <button
                onClicked={() => setProfile(profile)}
                cssClasses={currentProfile.as(p => p === profile ? ["active"] : [])}
              >
                <box spacing={6}>
                  <label label={PROFILE_ICONS[profile]} />
                  <label label={PROFILE_LABELS[profile]} />
                </box>
              </button>
            ))}
          </box>
        </box>
      </popover>
    </menubutton>
  )
}