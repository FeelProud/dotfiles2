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

export function Battery() {
  const battery = AstalBattery.get_default()

  const percentage = new Accessor(
    () => `${Math.round(battery.percentage * 100)}%`,
    (callback) => {
      const id = battery.connect("notify::percentage", callback)
      return () => battery.disconnect(id)
    }
  )

  const batteryIcon = new Accessor(
    () => battery.batteryIconName,
    (callback) => {
      const id = battery.connect("notify::battery-icon-name", callback)
      return () => battery.disconnect(id)
    }
  )

  return (
    <PopupButton popupName={POPUP_NAME} cssClasses={["battery-widget"]}>
      <box spacing={4}>
        <Gtk.Image iconName={batteryIcon.as(i => i || "battery-missing-symbolic")} />
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
    powerProfiles.activeProfile = profile
  }

  const profileToIndex = (profile: PowerProfile): number => PROFILES.indexOf(profile)
  const indexToProfile = (index: number): PowerProfile => PROFILES[Math.round(index)] || "balanced"

  const onSliderChange = (scale: Gtk.Scale) => {
    const value = scale.get_value()
    const profile = indexToProfile(value)
    setProfile(profile)
  }

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

        {/* Power Profile Slider Section */}
        <box orientation={Gtk.Orientation.VERTICAL} spacing={8} cssClasses={["profile-section"]}>
          <box cssClasses={["profile-header"]} spacing={8}>
            <Gtk.Image iconName={currentProfile.as(p => PROFILE_ICONS[p])} pixelSize={20} />
            <label
              cssClasses={["profile-label"]}
              label={currentProfile.as(p => PROFILE_LABELS[p])}
            />
          </box>
          <box cssClasses={["slider-container"]}>
            <Gtk.Scale
              cssClasses={["profile-slider"]}
              orientation={Gtk.Orientation.HORIZONTAL}
              hexpand={true}
              drawValue={false}
              round_digits={0}
              adjustment={
                new Gtk.Adjustment({
                  lower: 0,
                  upper: 2,
                  step_increment: 1,
                  page_increment: 1,
                  value: profileToIndex(powerProfiles.activeProfile as PowerProfile),
                })
              }
              onValueChanged={onSliderChange}
            />
          </box>
          <box cssClasses={["slider-labels"]} homogeneous={true}>
            {PROFILES.map((profile) => (
              <label
                label={PROFILE_LABELS[profile]}
                cssClasses={currentProfile.as(p => p === profile ? ["active"] : [])}
                halign={
                  profile === "power-saver" ? Gtk.Align.START :
                  profile === "performance" ? Gtk.Align.END : Gtk.Align.CENTER
                }
              />
            ))}
          </box>
        </box>
      </box>
    </PopupWindow>
  )
}
