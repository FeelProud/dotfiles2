import { Gtk } from "ags/gtk4"
import { Astal } from "ags/gtk4"
import { createPoll } from "ags/time"
import { PopupWindow, PopupButton } from "../popup"

const POPUP_NAME = "clock-popup"

export function Clock() {
  const time = createPoll("", 1000, "date +'%a %d %b • %I:%M %p'")

  return (
    <PopupButton popupName={POPUP_NAME} cssClasses={["clock-widget"]}>
      <label label={time} />
    </PopupButton>
  )
}

export function ClockPopup() {
  return (
    <PopupWindow name={POPUP_NAME} anchor={Astal.WindowAnchor.TOP}>
      <box cssClasses={["clock-menu"]}>
        <Gtk.Calendar />
      </box>
    </PopupWindow>
  )
}
