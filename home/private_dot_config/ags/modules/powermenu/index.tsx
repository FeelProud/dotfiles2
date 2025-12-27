import { Gtk } from "ags/gtk4"
import { Astal } from "ags/gtk4"
import { execAsync } from "ags/process"
import { PopupWindow, PopupButton } from "../popup"

const POPUP_NAME = "power-popup"

export function PowerButton() {
  return (
    <PopupButton popupName={POPUP_NAME} cssClasses={["power-button"]}>
      <box>
        <label label="⏻" />
      </box>
    </PopupButton>
  )
}

export function PowerPopup() {
  return (
    <PopupWindow name={POPUP_NAME} anchor={Astal.WindowAnchor.TOP | Astal.WindowAnchor.RIGHT}>
      <box orientation={Gtk.Orientation.VERTICAL} spacing={8} cssClasses={["power-menu"]}>
        <button
          cssClasses={["power-option"]}
          onClicked={() => execAsync("systemctl poweroff")}
        >
          <box spacing={8}>
            <label label="⏻" />
            <label label="Shutdown" />
          </box>
        </button>
        <button
          cssClasses={["power-option"]}
          onClicked={() => execAsync("systemctl reboot")}
        >
          <box spacing={8}>
            <label label="⟳" />
            <label label="Reboot" />
          </box>
        </button>
        <button
          cssClasses={["power-option"]}
          onClicked={() => execAsync("systemctl suspend")}
        >
          <box spacing={8}>
            <label label="⏾" />
            <label label="Suspend" />
          </box>
        </button>
        <button
          cssClasses={["power-option"]}
          onClicked={() => execAsync("hyprctl dispatch exit")}
        >
          <box spacing={8}>
            <label label="⎋" />
            <label label="Logout" />
          </box>
        </button>
      </box>
    </PopupWindow>
  )
}
