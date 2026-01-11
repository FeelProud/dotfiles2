import { Gtk } from "ags/gtk4"
import { Accessor, For, createState } from "ags"
import { execAsync } from "ags/process"
import AstalBluetooth from "gi://AstalBluetooth"
import { PopupWindow, PopupButton } from "../popup"
import { createModuleLogger } from "../utils/logger"

const logger = createModuleLogger("Bluetooth")

const [connectingDevice, setConnectingDevice] = createState<string | null>(null)

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

function DeviceItem({ device, enabled }: { device: AstalBluetooth.Device; enabled: Accessor<boolean> }) {
  const deviceAddress = device.address

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

  const isConnecting = connectingDevice.as(addr => addr === deviceAddress)
  const isSensitive = new Accessor(
    () => enabled.peek() && connectingDevice.peek() === null,
    (callback) => {
      const unsub1 = enabled.subscribe(callback)
      const unsub2 = connectingDevice.subscribe(callback)
      return () => { unsub1(); unsub2() }
    }
  )

  const toggleConnection = async () => {
    if (connectingDevice.peek() !== null) return

    if (device.connected) {
      device.disconnect_device(() => {})
    } else {
      setConnectingDevice(deviceAddress)
      device.connect_device(() => setConnectingDevice(null))
      setTimeout(() => {
        if (connectingDevice.peek() === deviceAddress) {
          setConnectingDevice(null)
        }
      }, 15000)
    }
  }

  return (
    <button
      cssClasses={["bt-device"]}
      onClicked={toggleConnection}
      sensitive={isSensitive}
      $={(btn: Gtk.Button) => {
        const update = () => {
          if (device.connected) {
            btn.add_css_class("connected")
            if (connectingDevice.peek() === deviceAddress) setConnectingDevice(null)
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
        <label
          label="progress_activity"
          cssClasses={["bar-icon", "spinning"]}
          visible={isConnecting}
        />
        <Gtk.Image
          iconName="object-select-symbolic"
          pixelSize={12}
          $={(img: Gtk.Image) => {
            const update = () => {
              img.visible = device.connected && connectingDevice.peek() !== deviceAddress
            }
            update()
            const id = device.connect("notify::connected", update)
            const unsub = connectingDevice.subscribe(update)
            img.connect("destroy", () => {
              device.disconnect(id)
              unsub()
            })
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
    try {
      await execAsync(["bluetoothctl", "power", enable ? "on" : "off"])
    } catch (e) {
      console.error("Failed to toggle bluetooth:", e)
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
      execAsync("gnome-control-center bluetooth").catch((err) => {
        logger.error("Failed to open bluetooth settings", err)
      })
    })
  }

  return (
    <PopupWindow name={POPUP_NAME} position="top-right">
      <box orientation={Gtk.Orientation.VERTICAL} spacing={6} cssClasses={["bt-menu"]}>
        <box cssClasses={["bt-header"]} spacing={8}>
          <Gtk.Image iconName="bluetooth-symbolic" pixelSize={14} />
          <label cssClasses={["bt-title"]} label="Bluetooth" hexpand halign={Gtk.Align.START} />
          <button cssClasses={["bt-settings-btn"]} onClicked={openBluetoothSettings} tooltipText="Open Bluetooth Settings">
            <Gtk.Image iconName="emblem-system-symbolic" pixelSize={14} />
          </button>
          <button
            cssClasses={isScanning.as(s => s ? ["scan-icon-btn", "scanning"] : ["scan-icon-btn"])}
            onClicked={toggleScan}
            sensitive={enabled}
            tooltipText="Scan for devices"
          >
            <Gtk.Image iconName="view-refresh-symbolic" pixelSize={14} cssClasses={isScanning.as(s => s ? ["spinning"] : [])} />
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

        <box cssClasses={["separator"]} visible={devices.as(d => d.length > 0)} />

        <box orientation={Gtk.Orientation.VERTICAL} spacing={2} cssClasses={["bt-device-list"]} visible={devices.as(d => d.length > 0)}>
          <For each={devices}>
            {(device) => <DeviceItem device={device} enabled={enabled} />}
          </For>
        </box>
      </box>
    </PopupWindow>
  )
}
