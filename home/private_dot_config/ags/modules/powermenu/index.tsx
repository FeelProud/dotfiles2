import { Gtk } from "ags/gtk4"
import { execAsync } from "ags/process"

export function PowerButton() {
  return (
    <menubutton cssClasses={["power-button"]} hexpand={false} halign={Gtk.Align.END}>
      <box>
        <label label="⏻" />
      </box>
      <popover>
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
      </popover>
    </menubutton>
  )
}
