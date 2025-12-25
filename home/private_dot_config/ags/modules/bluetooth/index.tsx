import { Gtk } from "ags/gtk4"
import { Accessor } from "ags"
import AstalBluetooth from "gi://AstalBluetooth?version=0.1"

export function Bluetooth() {
  const bluetooth = AstalBluetooth.get_default()

  // Bluetooth Enabled
  const enabled = new Accessor(
    () => bluetooth.isPowered,
    (callback) => {
      const id = bluetooth.connect("notify::is-powered", callback)
      return () => bluetooth.disconnect(id)
    }
  )

  // Bluetooth Icon
  const bluetoothIcon = new Accessor(
    () => bluetooth.isPowered ? "bluetooth-active-symbolic" : "bluetooth-disabled-symbolic",
    (callback) => {
      const id = bluetooth.connect("notify::is-powered", callback)
      return () => bluetooth.disconnect(id)
    }
  )

  // Connected Devices
  const connectedDevices = new Accessor(
    () => bluetooth.devices.filter(d => d.connected),
    (callback) => {
      const id = bluetooth.connect("notify::devices", callback)
      return () => bluetooth.disconnect(id)
    }
  )

  const toggleBluetooth = () => {
    bluetooth.isPowered = !bluetooth.isPowered
  }

  return (
    <menubutton cssClasses={["bluetooth-widget"]}>
      <box spacing={4}>
        <Gtk.Image iconName={bluetoothIcon.as(i => i)} />
      </box>
      <popover>
        <box orientation={Gtk.Orientation.VERTICAL} spacing={8} cssClasses={["bluetooth-menu"]}>
          <box orientation={Gtk.Orientation.VERTICAL} spacing={4}>
            <label label={enabled.as(e => e ? "Bluetooth: Enabled" : "Bluetooth: Disabled")} />
            <label label={connectedDevices.as(devices =>
              devices.length > 0
                ? `Connected: ${devices.map(d => d.name).join(", ")}`
                : "No devices connected"
            )} />
          </box>

          <button onClicked={toggleBluetooth}>
            <box spacing={8}>
              <label label={enabled.as(e => e ? "Disable Bluetooth" : "Enable Bluetooth")} />
            </box>
          </button>
        </box>
      </popover>
    </menubutton>
  )
}
