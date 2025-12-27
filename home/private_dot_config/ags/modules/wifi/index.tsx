import { Gtk } from "ags/gtk4"
import { Accessor } from "ags"
import AstalNetwork from "gi://AstalNetwork?version=0.1"
import { PopupWindow, PopupButton } from "../popup"

const POPUP_NAME = "wifi-popup"

export function Wifi() {
  const network = AstalNetwork.get_default()
  const wifi = network.wifi

  // WiFi Icon
  const wifiIcon = new Accessor(
    () => wifi?.iconName || "network-wireless-disabled-symbolic",
    (callback) => {
      const id = wifi?.connect("notify::icon-name", callback)
      return () => id && wifi?.disconnect(id)
    }
  )

  return (
    <PopupButton popupName={POPUP_NAME} cssClasses={["wifi-widget"]}>
      <box spacing={4}>
        <Gtk.Image iconName={wifiIcon.as(i => i)} />
      </box>
    </PopupButton>
  )
}

export function WifiPopup() {
  const network = AstalNetwork.get_default()
  const wifi = network.wifi

  // WiFi SSID
  const ssid = new Accessor(
    () => wifi?.ssid || "No WiFi",
    (callback) => {
      const id = wifi?.connect("notify::ssid", callback)
      return () => id && wifi?.disconnect(id)
    }
  )

  // WiFi Strength
  const strength = new Accessor(
    () => wifi?.strength || 0,
    (callback) => {
      const id = wifi?.connect("notify::strength", callback)
      return () => id && wifi?.disconnect(id)
    }
  )

  // WiFi Enabled
  const enabled = new Accessor(
    () => wifi?.enabled || false,
    (callback) => {
      const id = wifi?.connect("notify::enabled", callback)
      return () => id && wifi?.disconnect(id)
    }
  )

  const toggleWifi = () => {
    if (wifi) {
      wifi.enabled = !wifi.enabled
    }
  }

  return (
    <PopupWindow name={POPUP_NAME} position="top-right">
      <box orientation={Gtk.Orientation.VERTICAL} spacing={8} cssClasses={["wifi-menu"]}>
        <box orientation={Gtk.Orientation.VERTICAL} spacing={4}>
          <label label={ssid.as(s => `Network: ${s}`)} />
          <label label={strength.as(s => `Signal: ${s}%`)} />
          <label label={enabled.as(e => e ? "WiFi: Enabled" : "WiFi: Disabled")} />
        </box>

        <button onClicked={toggleWifi}>
          <box spacing={8}>
            <label label={enabled.as(e => e ? "Disable WiFi" : "Enable WiFi")} />
          </box>
        </button>
      </box>
    </PopupWindow>
  )
}
