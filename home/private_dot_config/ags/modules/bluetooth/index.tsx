import { Gtk } from "ags/gtk4"
import { Accessor, For, createState } from "ags"
import { execAsync } from "ags/process"
import AstalBluetooth from "gi://AstalBluetooth?version=0.1"
import { PopupWindow, PopupButton } from "../popup"

// Track if we're currently toggling to prevent feedback loops
const [isToggling, setIsToggling] = createState(false)

const POPUP_NAME = "bluetooth-popup"
const bluetooth = AstalBluetooth.get_default()

export function Bluetooth() {
  const bluetoothIcon = new Accessor(
    () => {
      if (!bluetooth.isPowered) return "bluetooth_disabled"
      const hasConnected = bluetooth.devices.some(d => d.connected)
      return hasConnected ? "bluetooth_connected" : "bluetooth"
    },
    (callback) => {
      const ids = [
        bluetooth.connect("notify::is-powered", callback),
        bluetooth.connect("notify::devices", callback)
      ]
      return () => ids.forEach(id => bluetooth.disconnect(id))
    }
  )

  return (
    <PopupButton popupName={POPUP_NAME} cssClasses={["bluetooth-widget"]}>
      <box spacing={4}>
        <label label={bluetoothIcon.as(i => i)} cssClasses={["bar-icon"]} />
      </box>
    </PopupButton>
  )
}

function DeviceItem({ device }: { device: AstalBluetooth.Device }) {
  const getDeviceIcon = (dev: AstalBluetooth.Device): string => {
    const icon = dev.icon || "bluetooth"
    if (icon.includes("audio-headset") || icon.includes("headset")) return "audio-headphones-symbolic"
    if (icon.includes("audio-headphones") || icon.includes("headphone")) return "audio-headphones-symbolic"
    if (icon.includes("phone")) return "phone-symbolic"
    if (icon.includes("computer")) return "computer-symbolic"
    if (icon.includes("input-keyboard")) return "input-keyboard-symbolic"
    if (icon.includes("input-mouse")) return "input-mouse-symbolic"
    if (icon.includes("input-gaming")) return "input-gaming-symbolic"
    return "bluetooth-symbolic"
  }

  const toggleConnection = async () => {
    if (device.connected) {
      device.disconnect_device(() => {})
    } else {
      device.connect_device(() => {})
    }
  }

  return (
    <button
      cssClasses={["bt-device"]}
      onClicked={toggleConnection}
      $={(btn: Gtk.Button) => {
        const update = () => {
          if (device.connected) {
            btn.add_css_class("connected")
          } else {
            btn.remove_css_class("connected")
          }
        }
        update()
        const id = device.connect("notify::connected", update)
        btn.connect("destroy", () => device.disconnect(id))
      }}
    >
      <box spacing={8}>
        <Gtk.Image iconName={getDeviceIcon(device)} pixelSize={14} />
        <label
          label={device.name || "Unknown"}
          cssClasses={["bt-device-name"]}
          hexpand
          halign={Gtk.Align.START}
          ellipsize={3}
        />
        <Gtk.Image
          iconName="object-select-symbolic"
          pixelSize={12}
          $={(img: Gtk.Image) => {
            const update = () => {
              img.visible = device.connected
            }
            update()
            const id = device.connect("notify::connected", update)
            img.connect("destroy", () => device.disconnect(id))
          }}
        />
      </box>
    </button>
  )
}

export function BluetoothPopup() {
  const enabled = new Accessor(
    () => bluetooth.adapter?.powered ?? false,
    (callback) => {
      const adapter = bluetooth.adapter
      if (!adapter) return () => {}
      const id = adapter.connect("notify::powered", callback)
      return () => adapter.disconnect(id)
    }
  )

  const isScanning = new Accessor(
    () => bluetooth.adapter?.discovering ?? false,
    (callback) => {
      const adapter = bluetooth.adapter
      if (!adapter) return () => {}
      const id = adapter.connect("notify::discovering", callback)
      return () => adapter.disconnect(id)
    }
  )

  const devices = new Accessor(
    () => bluetooth.devices
      .filter(d => d.name)
      .sort((a, b) => {
        if (a.connected !== b.connected) return a.connected ? -1 : 1
        if (a.paired !== b.paired) return a.paired ? -1 : 1
        return (a.name || "").localeCompare(b.name || "")
      }),
    (callback) => {
      const id = bluetooth.connect("notify::devices", callback)
      const deviceIds: number[] = []
      bluetooth.devices.forEach(d => {
        deviceIds.push(d.connect("notify::connected", callback))
        deviceIds.push(d.connect("notify::paired", callback))
      })
      return () => {
        bluetooth.disconnect(id)
        bluetooth.devices.forEach((d, i) => {
          if (deviceIds[i * 2]) d.disconnect(deviceIds[i * 2])
          if (deviceIds[i * 2 + 1]) d.disconnect(deviceIds[i * 2 + 1])
        })
      }
    }
  )

  const toggleBluetooth = async (enable: boolean) => {
    if (isToggling.peek()) return
    setIsToggling(true)

    try {
      // Use bluetoothctl which handles rfkill automatically
      await execAsync(["bluetoothctl", "power", enable ? "on" : "off"])
    } catch (e) {
      console.error("Failed to toggle bluetooth:", e)
    } finally {
      setIsToggling(false)
    }
  }

  const toggleScan = () => {
    const adapter = bluetooth.adapter
    if (!adapter) return
    if (adapter.discovering) {
      adapter.stop_discovery()
    } else {
      adapter.start_discovery()
    }
  }

  const openBluetoothSettings = () => {
    execAsync("blueman-manager").catch(() => {
      // Try GNOME Settings as fallback
      execAsync("gnome-control-center bluetooth").catch(() => {})
    })
  }

  return (
    <PopupWindow name={POPUP_NAME} position="top-right">
      <box orientation={Gtk.Orientation.VERTICAL} spacing={6} cssClasses={["bt-menu"]}>
        {/* Header with toggle */}
        <box cssClasses={["bt-header"]} spacing={8}>
          <Gtk.Image iconName="bluetooth-symbolic" pixelSize={14} />
          <label cssClasses={["bt-title"]} label="Bluetooth" hexpand halign={Gtk.Align.START} />
          <button cssClasses={["bt-settings-btn"]} onClicked={openBluetoothSettings} tooltipText="Open Bluetooth Settings">
            <Gtk.Image iconName="emblem-system-symbolic" pixelSize={14} />
          </button>
          {/* Scan button */}
          <button
            cssClasses={isScanning.as(s => s ? ["scan-icon-btn", "scanning"] : ["scan-icon-btn"])}
            onClicked={toggleScan}
            sensitive={enabled}
            tooltipText="Scan for devices"
          >
            <box>
              <Gtk.Spinner
                spinning={isScanning}
                visible={isScanning}
              />
              <Gtk.Image
                iconName="view-refresh-symbolic"
                pixelSize={14}
                visible={isScanning.as(s => !s)}
              />
            </box>
          </button>
          <Gtk.Switch
            active={enabled}
            onNotifyActive={(sw: Gtk.Switch) => {
              const adapter = bluetooth.adapter
              const currentPowered = adapter?.powered ?? false
              if (currentPowered !== sw.active) {
                toggleBluetooth(sw.active)
              }
            }}
          />
        </box>

        {/* Separator and device list */}
        <box cssClasses={["separator"]} visible={devices.as(d => d.length > 0)} />

        <box orientation={Gtk.Orientation.VERTICAL} spacing={2} cssClasses={["bt-device-list"]} visible={devices.as(d => d.length > 0)}>
          <For each={devices}>
            {(device) => <DeviceItem device={device} />}
          </For>
        </box>
      </box>
    </PopupWindow>
  )
}
