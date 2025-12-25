import { Gtk } from "ags/gtk4"
import { Accessor } from "ags"
import Tray from "gi://AstalTray"

export function SystemTray() {
  const tray = Tray.get_default()

  return (
    <box cssClasses={["system-tray"]} spacing={8}>
      {
        new Accessor(
          () => tray.get_items(),
          (callback) => {
            const id = tray.connect("notify::items", callback)
            return () => tray.disconnect(id)
          }
        ).as((items) =>
          items.map((item) => {
            const gicon = new Accessor(
              () => item.gicon,
              (callback) => {
                const id = item.connect("notify::gicon", callback)
                return () => item.disconnect(id)
              }
            )
            const tooltipMarkup = new Accessor(
              () => item.tooltipMarkup,
              (callback) => {
                const id = item.connect("notify::tooltip-markup", callback)
                return () => item.disconnect(id)
              }
            )

            return (
              <menubutton
                tooltipMarkup={tooltipMarkup()}
                menuModel={item.menuModel}
              >
                <Gtk.Image gicon={gicon()} />
              </menubutton>
            )
          })
        )()
      }
    </box>
  )
}
