import { Gtk } from "ags/gtk4"
import { execAsync } from "ags/process"
import { PopupWindow, PopupButton } from "../popup"

const POPUP_NAME = "power-popup"

export function PowerButton() {
  return (
    <PopupButton popupName={POPUP_NAME} cssClasses={["power-button"]}>
      <box>
        <label label="power_settings_new" cssClasses={["power-icon"]} />
      </box>
    </PopupButton>
  )
}

export function PowerPopup() {
  return (
    <PopupWindow name={POPUP_NAME} position="top-right">
      <box orientation={Gtk.Orientation.VERTICAL} spacing={8} cssClasses={["power-menu"]}>
        <button
          cssClasses={["power-option"]}
          onClicked={() => execAsync("hyprlock")}
        >
          <box spacing={8}>
            <label label="lock" cssClasses={["power-icon"]} />
            <label label="Lock" />
          </box>
        </button>
        <button
          cssClasses={["power-option"]}
          onClicked={() => execAsync("systemctl reboot")}
        >
          <box spacing={8}>
            <label label="restart_alt" cssClasses={["power-icon"]} />
            <label label="Reboot" />
          </box>
        </button>
        <button
          cssClasses={["power-option"]}
          onClicked={() => execAsync("systemctl poweroff")}
        >
          <box spacing={8}>
            <label label="power_settings_new" cssClasses={["power-icon"]} />
            <label label="Shutdown" />
          </box>
        </button>
      </box>
    </PopupWindow>
  )
}
