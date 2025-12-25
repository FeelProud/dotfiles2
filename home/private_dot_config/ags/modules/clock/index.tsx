import { Gtk } from "ags/gtk4"
import { createPoll } from "ags/time"

export function Clock() {
  const time = createPoll("", 1000, "date")

  return (
    <menubutton hexpand={false} halign={Gtk.Align.CENTER}>
      <label label={time} />
      <popover>
        <Gtk.Calendar />
      </popover>
    </menubutton>
  )
}
