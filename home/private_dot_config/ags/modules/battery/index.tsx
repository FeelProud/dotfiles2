import { Gtk } from "ags/gtk4"
import { Accessor } from "ags"
import AstalBattery from "gi://AstalBattery?version=0.1"
import PowerProfiles from "gi://AstalPowerProfiles"
import { PopupWindow, PopupButton } from "../popup"

type PowerProfile = "performance" | "balanced" | "power-saver"

const PROFILES: PowerProfile[] = ["power-saver", "balanced", "performance"]

const PROFILE_ICONS: Record<PowerProfile, string> = {
  "performance": "power-profile-performance-symbolic",
  "balanced": "power-profile-balanced-symbolic",
  "power-saver": "power-profile-power-saver-symbolic"
}

const PROFILE_LABELS: Record<PowerProfile, string> = {
  "performance": "Performance",
  "balanced": "Balanced",
  "power-saver": "Power Saver"
}

const POPUP_NAME = "battery-popup"

// Helper to check if performance mode should be blocked
const shouldBlockPerformance = (battery: AstalBattery.Device): boolean => {
  return !battery.charging && battery.percentage < 1.0
}

export function Battery() {
  const battery = AstalBattery.get_default()

  const percentage = new Accessor(
    () => `${Math.round(battery.percentage * 100)}%`,
    (callback) => {
      const id = battery.connect("notify::percentage", callback)
      return () => battery.disconnect(id)
    }
  )

  // Battery Icon - use Material Symbols based on charge level and charging state
  const batteryIcon = new Accessor(
    () => {
      const pct = Math.round(battery.percentage * 100)
      const charging = battery.charging

      if (charging) {
        if (pct >= 90) return "battery_charging_full"
        if (pct >= 80) return "battery_charging_90"
        if (pct >= 60) return "battery_charging_80"
        if (pct >= 50) return "battery_charging_60"
        if (pct >= 30) return "battery_charging_50"
        if (pct >= 20) return "battery_charging_30"
        return "battery_charging_20"
      }

      if (pct >= 95) return "battery_full"
      if (pct >= 85) return "battery_6_bar"
      if (pct >= 70) return "battery_5_bar"
      if (pct >= 55) return "battery_4_bar"
      if (pct >= 40) return "battery_3_bar"
      if (pct >= 25) return "battery_2_bar"
      if (pct >= 10) return "battery_1_bar"
      return "battery_alert"
    },
    (callback) => {
      const ids = [
        battery.connect("notify::percentage", callback),
        battery.connect("notify::charging", callback)
      ]
      return () => ids.forEach(id => battery.disconnect(id))
    }
  )

  return (
    <PopupButton popupName={POPUP_NAME} cssClasses={["battery-widget"]}>
      <box spacing={4}>
        <label label={batteryIcon.as(i => i)} cssClasses={["bar-icon"]} />
        <label label={percentage.as(p => p)} />
      </box>
    </PopupButton>
  )
}

export function BatteryPopup() {
  const battery = AstalBattery.get_default()
  const powerProfiles = PowerProfiles.get_default()

  const currentProfile = new Accessor(
    () => powerProfiles.activeProfile as PowerProfile,
    (callback) => {
      const id = powerProfiles.connect("notify::active-profile", callback)
      return () => powerProfiles.disconnect(id)
    }
  )

  const formatTime = (seconds: number): { hours: number; minutes: number } | null => {
    if (!isFinite(seconds) || isNaN(seconds) || seconds <= 0) return null
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return { hours, minutes }
  }

  const estimateTimeToFull = (): number => {
    const rate = Math.abs(battery.energyRate)
    if (rate <= 0) return 0
    const energyFull = battery.energyFull || battery.energy / battery.percentage
    const energyNeeded = energyFull - battery.energy
    if (energyNeeded <= 0) return 0
    return (energyNeeded / rate) * 3600
  }

  type TimeInfo = {
    status: "full" | "charging" | "discharging" | "calculating"
    hours?: number
    minutes?: number
  }

  const timeRemaining = new Accessor<TimeInfo>(
    () => {
      if (battery.percentage >= 0.98 && battery.charging) {
        return { status: "full" }
      }
      if (battery.charging) {
        let time = battery.timeToFull
        if (!time || time <= 0) time = estimateTimeToFull()
        const formatted = formatTime(time)
        if (formatted) {
          return { status: "charging", hours: formatted.hours, minutes: formatted.minutes }
        }
        return { status: "calculating" }
      }
      const formatted = formatTime(battery.timeToEmpty)
      if (formatted) {
        return { status: "discharging", hours: formatted.hours, minutes: formatted.minutes }
      }
      return { status: "calculating" }
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
    // Block performance mode when on battery
    if (profile === "performance" && shouldBlockPerformance(battery)) {
      return
    }

    powerProfiles.activeProfile = profile

    // Verify the change was applied
    setTimeout(() => {
      if (powerProfiles.activeProfile !== profile) {
        console.warn(`Failed to set power profile to ${profile}, current: ${powerProfiles.activeProfile}`)
      }
    }, 100)
  }

  // Track whether performance mode is blocked
  const performanceBlocked = new Accessor(
    () => shouldBlockPerformance(battery),
    (callback) => {
      const ids = [
        battery.connect("notify::charging", callback),
        battery.connect("notify::percentage", callback),
      ]
      return () => ids.forEach(id => battery.disconnect(id))
    }
  )

  // Auto-switch from performance to balanced when unplugging
  battery.connect("notify::charging", () => {
    if (!battery.charging && powerProfiles.activeProfile === "performance") {
      powerProfiles.activeProfile = "balanced"
    }
  })

  return (
    <PopupWindow name={POPUP_NAME} position="top-right">
      <box orientation={Gtk.Orientation.VERTICAL} spacing={8} cssClasses={["battery-menu"]}>
        {/* Time Remaining Section */}
        <box orientation={Gtk.Orientation.VERTICAL} spacing={4} cssClasses={["time-section"]}>
          <label
            cssClasses={["time-label"]}
            label={timeRemaining.as(t => {
              if (t.status === "full") return "Fully Charged"
              if (t.status === "calculating") return "Calculating..."
              return t.status === "charging" ? "Until full" : "Remaining"
            })}
          />
          <box cssClasses={["time-display"]} halign={Gtk.Align.CENTER} spacing={12}>
            <box orientation={Gtk.Orientation.VERTICAL} cssClasses={["time-unit"]}>
              <label
                cssClasses={["time-value"]}
                label={timeRemaining.as(t => {
                  if (t.status === "full" || t.status === "calculating") return "--"
                  return String(t.hours ?? 0)
                })}
              />
              <label cssClasses={["time-unit-label"]} label="hours" />
            </box>
            <label cssClasses={["time-separator"]} label=":" />
            <box orientation={Gtk.Orientation.VERTICAL} cssClasses={["time-unit"]}>
              <label
                cssClasses={["time-value"]}
                label={timeRemaining.as(t => {
                  if (t.status === "full" || t.status === "calculating") return "--"
                  return String(t.minutes ?? 0).padStart(2, "0")
                })}
              />
              <label cssClasses={["time-unit-label"]} label="min" />
            </box>
          </box>
        </box>

        <box cssClasses={["separator"]} />

        {/* Power Profile Section */}
        <box orientation={Gtk.Orientation.VERTICAL} spacing={4} cssClasses={["profile-section"]}>
          <label cssClasses={["profile-title"]} label="Power Profile" halign={Gtk.Align.START} />
          <box cssClasses={["profile-buttons"]} homogeneous={true}>
            {PROFILES.map((profile) => {
              if (profile === "performance") {
                // Performance button with blocking logic
                const perfClasses = new Accessor(
                  () => {
                    const isActive = powerProfiles.activeProfile === profile
                    const isBlocked = shouldBlockPerformance(battery)
                    const classes = ["profile-btn", `profile-${profile}`]
                    if (isActive) classes.push("active")
                    if (isBlocked) classes.push("disabled")
                    return classes
                  },
                  (callback) => {
                    const ids = [
                      powerProfiles.connect("notify::active-profile", callback),
                      battery.connect("notify::charging", callback),
                      battery.connect("notify::percentage", callback),
                    ]
                    return () => {
                      powerProfiles.disconnect(ids[0])
                      battery.disconnect(ids[1])
                      battery.disconnect(ids[2])
                    }
                  }
                )
                return (
                  <button
                    cssClasses={perfClasses.as(c => c)}
                    onClicked={() => setProfile(profile)}
                    tooltipText={performanceBlocked.as(blocked =>
                      blocked ? "Performance mode unavailable on battery" : PROFILE_LABELS[profile]
                    )}
                    sensitive={performanceBlocked.as(b => !b)}
                  >
                    <Gtk.Image iconName={PROFILE_ICONS[profile]} pixelSize={16} />
                  </button>
                )
              }
              return (
                <button
                  cssClasses={currentProfile.as(p =>
                    p === profile ? ["profile-btn", `profile-${profile}`, "active"] : ["profile-btn", `profile-${profile}`]
                  )}
                  onClicked={() => setProfile(profile)}
                  tooltipText={PROFILE_LABELS[profile]}
                >
                  <Gtk.Image iconName={PROFILE_ICONS[profile]} pixelSize={16} />
                </button>
              )
            })}
          </box>
        </box>
      </box>
    </PopupWindow>
  )
}
