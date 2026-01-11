import { Gtk } from "ags/gtk4"
import { getCurrentTheme, subscribeToTheme } from "../settings"

export function setupWindowTheme(win: Gtk.Window): () => void {
  const applyTheme = () => {
    const theme = getCurrentTheme()
    if (theme === "light") {
      win.add_css_class("light-mode")
    } else {
      win.remove_css_class("light-mode")
    }
  }

  applyTheme()
  const unsubscribeTheme = subscribeToTheme(applyTheme)
  win.connect("destroy", () => unsubscribeTheme())

  return unsubscribeTheme
}
