import { Gtk } from "ags/gtk4"
import { Accessor, For } from "ags"
import Tray from "gi://AstalTray"
import { closeAllPopups } from "../popup"

export function SystemTray() {
  const tray = Tray.get_default()

  const itemsAccessor = new Accessor(
    () => tray.get_items(),
    (callback) => {
      const addedId = tray.connect("item-added", callback)
      const removedId = tray.connect("item-removed", callback)
      return () => {
        tray.disconnect(addedId)
        tray.disconnect(removedId)
      }
    }
  )

  return (
    <box visible={itemsAccessor.as((items) => items.length > 0)}>
      <box cssClasses={["system-tray"]} spacing={4}>
        <For each={itemsAccessor}>
          {(item) => {
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
                cssClasses={["system-tray-item"]}
                tooltipMarkup={tooltipMarkup}
                menuModel={item.menuModel}
                $={(btn: Gtk.MenuButton) => {
                  btn.insert_action_group("dbusmenu", item.actionGroup)
                  btn.connect("notify::active", () => {
                    if (btn.active) {
                      closeAllPopups()
                      item.about_to_show()
                    }
                  })
                }}
              >
                <Gtk.Image gicon={gicon} />
              </menubutton>
            )
          }}
        </For>
      </box>
      <box cssClasses={["system-tray-separator"]} />
    </box>
  )
}
