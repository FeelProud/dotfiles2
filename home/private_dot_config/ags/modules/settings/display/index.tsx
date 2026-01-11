import app from "ags/gtk4/app"
import { Gtk, Gdk } from "ags/gtk4"
import { Accessor, createState } from "ags"
import { execAsync, subprocess } from "ags/process"
import { writeFileAsync } from "ags/file"
import GLib from "gi://GLib"
import { PopupWindow, PopupButton } from "../../popup"
import { createModuleLogger } from "../../utils/logger"

const logger = createModuleLogger("Display")

const DISPLAY_POPUP_NAME = "display-popup"

const GLOBAL_CONFIGS_DIR = "/home/marc/.config/hypr/global_configs"
const SYNC_COLORS_SCRIPT = "/home/marc/.config/hypr/scripts/sync-colors.sh"

let currentAccentColor = "#0166FF"
const accentColorSubscribers: Set<() => void> = new Set()
const [pendingColor, setPendingColor] = createState(currentAccentColor)

const PRESET_COLORS = [
  "#0166FF", "#ED1B24", "#00C853", "#FF9100",
  "#AA00FF", "#00BCD4", "#FF4081", "#FFD600"
]

let accentProvider: Gtk.CssProvider | null = null

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function updateAccentColorCSS(color: string) {
  const display = Gdk.Display.get_default()
  if (!display) return

  if (accentProvider) {
    Gtk.StyleContext.remove_provider_for_display(display, accentProvider)
  }

  const rgba15 = hexToRgba(color, 0.15)
  const rgba20 = hexToRgba(color, 0.2)
  const rgba30 = hexToRgba(color, 0.3)
  const rgba40 = hexToRgba(color, 0.4)
  const rgba50 = hexToRgba(color, 0.5)

  accentProvider = new Gtk.CssProvider()
  accentProvider.load_from_string(`
    .cpu-bar, .ram-bar, .disk-bar, .gpu-bar {
      background-color: ${color};
    }

    .settings-slider trough highlight,
    .speaker-slider trough highlight,
    .mic-slider trough highlight,
    .night-mode-slider trough highlight { background-color: ${color}; }
    .profile-btn.profile-balanced.active { background-color: ${color}; }
    .osd-bar trough block.filled { background-color: ${color}; }
    .osd-icon { color: ${color}; }
    switch:checked { background-color: ${color}; }
    .bt-device.connected { background-color: ${rgba15}; }
    .bt-device.connected image { color: ${color}; }
    .bt-menu .scan-icon-btn.scanning image { color: ${color}; }
    .bt-menu .scan-icon-btn spinner { color: ${color}; }
    .net-item.connected { background-color: ${rgba15}; }
    .net-item.connected image { color: ${color}; }
    .net-status.connected { background-color: ${rgba15}; }
    .net-status.connected image { color: ${color}; }
    .net-menu .scan-icon-btn.scanning image { color: ${color}; }
    .net-menu .scan-icon-btn spinner { color: ${color}; }
    .wifi-password-inline entry:focus { border-color: ${color}; }
    .wifi-password-btn.suggested { background-color: ${rgba30}; }
    .wifi-password-btn.suggested:hover { background-color: ${rgba40}; }
    .wifi-password-btn.suggested:active { background-color: ${rgba50}; }
    .wifi-enterprise-badge { color: ${color}; background-color: ${rgba20}; }
    .wifi-enterprise-badge-small { color: ${color}; background-color: ${rgba15}; }
    .selector-item:hover { background-color: ${rgba15}; }
    .selector-item:active { background-color: ${rgba30}; }
    .selector-item.selected { background-color: ${rgba15}; }
    .selector-item.selected image { color: ${color}; }
    .color-mode-btn.active, .theme-btn.active { background-color: ${rgba20}; border-color: ${color}; }
    .color-mode-btn.active image, .theme-btn.active image { color: ${color}; }
    .progress-slider trough highlight { background-color: ${color}; }
    .progress-bar trough progress { background-color: ${color}; }
    .agenda-calendar:selected { background-color: ${color}; }
    .quick-tool-button:hover { background-color: ${rgba15}; }
    .quick-tool-button:active { background-color: ${rgba30}; }
    .apply-color-btn { background-color: ${rgba20}; border-color: ${rgba30}; }
    .apply-color-btn:hover { background-color: ${rgba30}; }
    .apply-color-btn:active { background-color: ${rgba40}; }
  `)
  Gtk.StyleContext.add_provider_for_display(
    display,
    accentProvider,
    Gtk.STYLE_PROVIDER_PRIORITY_USER + 1
  )
}

const applyColorToSystem = (color: string) => {
  if (!/^#[0-9A-Fa-f]{6}$/.test(color)) return

  currentAccentColor = color.toUpperCase()
  accentColorSubscribers.forEach((cb) => cb())
  updateAccentColorCSS(currentAccentColor)

  writeFileAsync(`${GLOBAL_CONFIGS_DIR}/color`, currentAccentColor)
    .then(() => execAsync(["bash", SYNC_COLORS_SCRIPT]))
    .catch((err) => console.error("[AGS] System color commit failed:", err))
}

execAsync(["cat", `${GLOBAL_CONFIGS_DIR}/color`]).then((output) => {
  const color = output.trim().toUpperCase()
  if (/^#[0-9A-F]{6}$/.test(color)) {
    currentAccentColor = color
    setPendingColor(color)
    accentColorSubscribers.forEach((cb) => cb())
    updateAccentColorCSS(color)
  }
}).catch((err) => {
  logger.warn(`Could not read accent color config: ${err}`)
})

const MIN_TEMP = 2500
const MAX_TEMP = 6500
let currentColorTemp = MAX_TEMP
const colorTempSubscribers: Set<() => void> = new Set()

const colorTempValue = new Accessor(
  () => currentColorTemp,
  (callback) => {
    colorTempSubscribers.add(callback)
    return () => colorTempSubscribers.delete(callback)
  }
)

let colorTempTimeout: ReturnType<typeof setTimeout> | null = null
let hyprsunsetProcess: ReturnType<typeof subprocess> | null = null

const setColorTemp = (temp: number) => {
  currentColorTemp = Math.round(temp)
  colorTempSubscribers.forEach((cb) => cb())

  if (colorTempTimeout) clearTimeout(colorTempTimeout)
  colorTempTimeout = setTimeout(() => {
    if (hyprsunsetProcess) {
      hyprsunsetProcess.kill()
      hyprsunsetProcess = null
    }
    execAsync(["pkill", "-x", "hyprsunset"]).catch((err) => {
      logger.warn(`Could not kill hyprsunset: ${err}`)
    }).finally(() => {
      if (currentColorTemp < MAX_TEMP) {
        hyprsunsetProcess = subprocess(["hyprsunset", "-t", String(currentColorTemp)], () => {})
      }
    })
  }, 300)
}

execAsync(["bash", "-c", "ps aux | grep '[h]yprsunset' | grep -oP '(?<=-t )\\d+'"]).then((output) => {
  const temp = parseInt(output.trim())
  if (!isNaN(temp)) {
    currentColorTemp = temp
    colorTempSubscribers.forEach((cb) => cb())
  }
}).catch(() => {
  currentColorTemp = MAX_TEMP
})

export type ThemeMode = "dark" | "light"
let currentTheme: ThemeMode = "dark"
const themeSubscribers: Set<() => void> = new Set()

const themeValue = new Accessor(
  () => currentTheme,
  (callback) => {
    themeSubscribers.add(callback)
    return () => themeSubscribers.delete(callback)
  }
)

export const getCurrentTheme = () => currentTheme

export const subscribeToTheme = (callback: () => void) => {
  themeSubscribers.add(callback)
  return () => themeSubscribers.delete(callback)
}

const setTheme = (mode: ThemeMode) => {
  currentTheme = mode
  themeSubscribers.forEach((cb) => cb())

  const themeName = mode === "dark" ? "Fluent-Dark" : "Fluent"
  const iconTheme = mode === "dark" ? "Papirus-Dark" : "Papirus"
  const colorScheme = mode === "dark" ? "prefer-dark" : "prefer-light"
  const preferDark = mode === "dark" ? "1" : "0"

  execAsync(["gsettings", "set", "org.gnome.desktop.interface", "color-scheme", colorScheme]).catch((err) => {
    logger.warn(`Could not set color-scheme: ${err}`)
  })
  execAsync(["gsettings", "set", "org.gnome.desktop.interface", "gtk-theme", themeName]).catch((err) => {
    logger.warn(`Could not set gtk-theme: ${err}`)
  })
  execAsync(["gsettings", "set", "org.gnome.desktop.interface", "icon-theme", iconTheme]).catch((err) => {
    logger.warn(`Could not set icon-theme: ${err}`)
  })

  const gtk3Config = `[Settings]
gtk-theme-name=${themeName}
gtk-icon-theme-name=${iconTheme}
gtk-font-name=Ubuntu Nerd Font 11
gtk-cursor-theme-name=Adwaita
gtk-cursor-theme-size=24
gtk-application-prefer-dark-theme=${preferDark}
gtk-xft-antialias=1
gtk-xft-hinting=1
gtk-xft-hintstyle=hintslight
gtk-xft-rgba=rgb
`
  const homeDir = GLib.get_home_dir()
  writeFileAsync(`${homeDir}/.config/gtk-3.0/settings.ini`, gtk3Config).catch((err) => {
    logger.warn(`Could not write GTK-3.0 config: ${err}`)
  })

  const rofiTheme = mode === "dark" ? "forest-launcher" : "forest-launcher-light"
  const rofiConfig = `configuration {
    modi: "drun";
    show-icons: true;
    icon-theme: "${iconTheme}";
    display-drun: "";
    drun-display-format: "{name}";
}

@theme "${rofiTheme}"
`
  writeFileAsync(`${homeDir}/.config/rofi/config.rasi`, rofiConfig).catch((err) => {
    logger.warn(`Could not write Rofi config: ${err}`)
  })

  const windows = app.get_windows()
  for (const win of windows) {
    if (mode === "light") {
      win.add_css_class("light-mode")
    } else {
      win.remove_css_class("light-mode")
    }
  }

  const wallDir = "/home/marc/.config/hypr/wallpapers"
  const globalConfigs = "/home/marc/.config/hypr/global_configs"
  writeFileAsync(`${globalConfigs}/wallpaper`, mode).catch((err) => {
    logger.warn(`Could not write wallpaper mode: ${err}`)
  })
  execAsync(["swww", "img", `${wallDir}/${mode}.png`, "--transition-type", "fade", "--transition-duration", "0.5"]).catch((err) => {
    logger.error("Failed to set wallpaper with swww", err)
  })
}

const applyInitialTheme = () => {
  const windows = app.get_windows()
  for (const win of windows) {
    if (currentTheme === "light") {
      win.add_css_class("light-mode")
    } else {
      win.remove_css_class("light-mode")
    }
  }
}

execAsync(["gsettings", "get", "org.gnome.desktop.interface", "color-scheme"]).then((output) => {
  const scheme = output.trim().replace(/'/g, "")
  currentTheme = scheme === "prefer-light" ? "light" : "dark"
  themeSubscribers.forEach((cb) => cb())
  setTimeout(applyInitialTheme, 100)
}).catch((err) => {
  logger.warn(`Could not read current theme from gsettings: ${err}`)
})

const getBrightness = async (): Promise<number> => {
  try {
    const result = await execAsync("brightnessctl get")
    const max = await execAsync("brightnessctl max")
    return Math.round((parseInt(result.trim()) / parseInt(max.trim())) * 100)
  } catch {
    return 50
  }
}

let currentBrightness = 50
const brightnessSubscribers: Set<() => void> = new Set()
let debounceTimeout: ReturnType<typeof setTimeout> | null = null
let isSettingBrightness = false

const updateBrightness = () => {
  if (isSettingBrightness) return
  getBrightness().then((v) => {
    if (currentBrightness !== v) {
      currentBrightness = v
      brightnessSubscribers.forEach((cb) => cb())
    }
  })
}

updateBrightness()

subprocess(
  ["bash", "-c", "udevadm monitor --subsystem-match=backlight"],
  () => {
    if (debounceTimeout) clearTimeout(debounceTimeout)
    debounceTimeout = setTimeout(updateBrightness, 100)
  }
)

const brightnessValue = new Accessor(
  () => currentBrightness,
  (callback) => {
    brightnessSubscribers.add(callback)
    return () => brightnessSubscribers.delete(callback)
  }
)

const setBrightness = async (percent: number) => {
  isSettingBrightness = true
  currentBrightness = percent
  brightnessSubscribers.forEach((cb) => cb())
  await execAsync(`brightnessctl set ${percent}%`)
  setTimeout(() => { isSettingBrightness = false }, 200)
}

export function Display() {
  return (
    <PopupButton popupName={DISPLAY_POPUP_NAME} cssClasses={["display-widget"]}>
      <box spacing={4}>
        <label label="brightness_5" cssClasses={["bar-icon"]} />
      </box>
    </PopupButton>
  )
}

export function DisplayPopup() {
  const onBrightnessChange = (scale: Gtk.Scale) => {
    const value = Math.round(scale.get_value())
    setBrightness(value)
  }

  return (
    <PopupWindow name={DISPLAY_POPUP_NAME} position="top-right">
      <box orientation={Gtk.Orientation.VERTICAL} spacing={6} cssClasses={["settings-menu"]}>
        <box orientation={Gtk.Orientation.VERTICAL} spacing={4} cssClasses={["settings-section"]}>
          <box cssClasses={["settings-header"]} spacing={6}>
            <label label="light_mode" cssClasses={["material-icon"]} />
            <label cssClasses={["settings-label"]} label="Brightness" hexpand halign={Gtk.Align.START} />
            <label cssClasses={["settings-value"]} label={brightnessValue.as((v) => `${v}%`)} />
          </box>
          <box cssClasses={["slider-container"]}>
            <Gtk.Scale
              cssClasses={["settings-slider"]}
              orientation={Gtk.Orientation.HORIZONTAL}
              hexpand={true}
              drawValue={false}
              adjustment={
                new Gtk.Adjustment({
                  lower: 5,
                  upper: 100,
                  step_increment: 5,
                  page_increment: 10,
                  value: brightnessValue.peek(),
                })
              }
              onValueChanged={onBrightnessChange}
              $={(scale: Gtk.Scale) => {
                brightnessValue.subscribe(() => {
                  const v = brightnessValue.peek()
                  if (Math.abs(scale.get_value() - v) > 1) {
                    scale.set_value(v)
                  }
                })
              }}
            />
          </box>
        </box>

        <box cssClasses={["separator"]} />

        <box orientation={Gtk.Orientation.VERTICAL} spacing={4} cssClasses={["settings-section"]}>
          <box cssClasses={["settings-header"]} spacing={6}>
            <Gtk.Image iconName="night-light-symbolic" pixelSize={16} />
            <label cssClasses={["settings-label"]} label="Night Light" hexpand halign={Gtk.Align.START} />
            <label cssClasses={["settings-value"]} label={colorTempValue.as((v) => `${Math.round(((MAX_TEMP - v) / (MAX_TEMP - MIN_TEMP)) * 100)}%`)} />
          </box>
          <box cssClasses={["slider-container"]}>
            <Gtk.Scale
              cssClasses={["settings-slider", "night-mode-slider"]}
              orientation={Gtk.Orientation.HORIZONTAL}
              hexpand={true}
              drawValue={false}
              adjustment={
                new Gtk.Adjustment({
                  lower: MIN_TEMP,
                  upper: MAX_TEMP,
                  step_increment: 100,
                  page_increment: 500,
                  value: MAX_TEMP - colorTempValue.peek() + MIN_TEMP,
                })
              }
              onValueChanged={(scale: Gtk.Scale) => {
                const sliderVal = scale.get_value()
                const temp = MAX_TEMP - sliderVal + MIN_TEMP
                setColorTemp(temp)
              }}
              $={(scale: Gtk.Scale) => {
                colorTempValue.subscribe(() => {
                  const temp = colorTempValue.peek()
                  const sliderVal = MAX_TEMP - temp + MIN_TEMP
                  if (Math.abs(scale.get_value() - sliderVal) > 50) {
                    scale.set_value(sliderVal)
                  }
                })
              }}
            />
          </box>
        </box>

        <box cssClasses={["separator"]} />

        <box orientation={Gtk.Orientation.VERTICAL} spacing={4} cssClasses={["settings-section"]}>
          <box cssClasses={["section-title"]} spacing={6}>
            <label
              label="contrast"
              cssClasses={["material-icon-small"]}
            />
            <label cssClasses={["section-title-label"]} label="Dark Mode" hexpand halign={Gtk.Align.START} />
            <Gtk.Switch
              active={themeValue.as((t) => t === "dark")}
              onStateSet={(sw: Gtk.Switch) => {
                setTheme(sw.get_active() ? "dark" : "light")
                return false
              }}
            />
          </box>
        </box>

        <box cssClasses={["separator"]} />

        <box orientation={Gtk.Orientation.VERTICAL} spacing={6} cssClasses={["accent-color-section"]}>
          <box spacing={6}>
            <Gtk.Image iconName="preferences-color-symbolic" pixelSize={14} />
            <label cssClasses={["section-title-label"]} label="Main Color" hexpand halign={Gtk.Align.START} />
            <box
              cssClasses={["color-preview"]}
              $={(box: Gtk.Box) => {
                const id = "color-preview-box"
                box.set_name(id)
                let provider: Gtk.CssProvider | null = null
                const display = Gdk.Display.get_default()!

                const update = () => {
                  const color = pendingColor.peek()
                  if (provider) {
                    Gtk.StyleContext.remove_provider_for_display(display, provider)
                  }
                  provider = new Gtk.CssProvider()
                  provider.load_from_string(`#${id} { background-color: ${color}; }`)
                  Gtk.StyleContext.add_provider_for_display(display, provider, Gtk.STYLE_PROVIDER_PRIORITY_USER)
                }
                update()
                pendingColor.subscribe(update)
              }}
            />
          </box>

          <box cssClasses={["color-presets"]} spacing={6} halign={Gtk.Align.CENTER}>
            {PRESET_COLORS.map((color, i) => (
              <button
                cssClasses={["color-preset-btn"]}
                onClicked={() => setPendingColor(color)}
                $={(btn: Gtk.Button) => {
                  const id = `preset-${i}`
                  btn.set_name(id)
                  const provider = new Gtk.CssProvider()
                  provider.load_from_string(`#${id} { background-color: ${color}; border-radius: 50%; min-width: 22px; min-height: 22px; }`)
                  Gtk.StyleContext.add_provider_for_display(Gdk.Display.get_default()!, provider, Gtk.STYLE_PROVIDER_PRIORITY_USER)
                }}
              />
            ))}
          </box>

          <box spacing={6}>
            <Gtk.Entry
              cssClasses={["color-entry"]}
              placeholderText="#RRGGBB"
              hexpand
              $={(entry: Gtk.Entry) => {
                entry.set_text(pendingColor.peek())
                pendingColor.subscribe(() => {
                  if (entry.get_text() !== pendingColor.peek()) {
                    entry.set_text(pendingColor.peek())
                  }
                })
              }}
              onActivate={(entry: Gtk.Entry) => applyColorToSystem(entry.get_text().trim().toUpperCase())}
            />
            <button
              cssClasses={["apply-color-btn"]}
              onClicked={(btn: Gtk.Button) => {
                const entry = btn.get_parent()?.get_first_child() as Gtk.Entry
                if (entry) applyColorToSystem(entry.get_text().trim().toUpperCase())
              }}
            >
              <label label="Apply" />
            </button>
          </box>
        </box>
      </box>
    </PopupWindow>
  )
}
