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
          onClicked={() => execAsync("systemctl poweroff")}
        >
          <box spacing={8}>
            <label label="power_settings_new" cssClasses={["power-icon"]} />
            <label label="Shutdown" />
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
          onClicked={() => execAsync("systemctl suspend")}
        >
          <box spacing={8}>
            <label label="bedtime" cssClasses={["power-icon"]} />
            <label label="Suspend" />
          </box>
        </button>
        <button
          cssClasses={["power-option"]}
          onClicked={() => execAsync("hyprctl dispatch exit")}
        >
          <box spacing={8}>
            <label label="logout" cssClasses={["power-icon"]} />
            <label label="Logout" />
          </box>
        </button>
      </box>
    </PopupWindow>
  )
}
