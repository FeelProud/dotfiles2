import { Gtk } from "ags/gtk4"
import { Astal } from "ags/gtk4"
import { Accessor } from "ags"
import AstalBluetooth from "gi://AstalBluetooth?version=0.1"
import { PopupWindow, PopupButton } from "../popup"

const POPUP_NAME = "bluetooth-popup"

export function Bluetooth() {
  const bluetooth = AstalBluetooth.get_default()

  // Bluetooth Icon
  const bluetoothIcon = new Accessor(
    () => bluetooth.isPowered ? "bluetooth-active-symbolic" : "bluetooth-disabled-symbolic",
    (callback) => {
      const id = bluetooth.connect("notify::is-powered", callback)
      return () => bluetooth.disconnect(id)
    }
  )

  return (
    <PopupButton popupName={POPUP_NAME} cssClasses={["bluetooth-widget"]}>
      <box spacing={4}>
        <Gtk.Image iconName={bluetoothIcon.as(i => i)} />
      </box>
    </PopupButton>
  )
}

export function BluetoothPopup() {
  const bluetooth = AstalBluetooth.get_default()

  // Bluetooth Enabled
  const enabled = new Accessor(
    () => bluetooth.isPowered,
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
    <PopupWindow name={POPUP_NAME} anchor={Astal.WindowAnchor.TOP | Astal.WindowAnchor.RIGHT}>
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
    </PopupWindow>
  )
}
