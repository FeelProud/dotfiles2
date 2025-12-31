import app from "ags/gtk4/app"
import style from "./style.scss"
import { TopBar, BottomBar } from "./modules/bar"
import { ArchLogoPopup } from "./modules/archlogo"
import { BatteryPopup } from "./modules/battery"
import { BluetoothPopup } from "./modules/bluetooth"
import { WifiPopup } from "./modules/wifi"
import { PowerPopup } from "./modules/powermenu"
import { AgendaPopup } from "./modules/agenda"
import { SettingsPopup } from "./modules/settings"
import { OSD, triggerVolumeOSD, triggerBrightnessOSD } from "./modules/osd"
import { NotificationPopup } from "./modules/notification"

app.start({
  css: style,
  requestHandler(request: string | string[], res: (response: any) => void) {
    // request is an array of arguments
    const cmd = Array.isArray(request) ? request[0] : request

    if (cmd === "quit") {
      app.quit()
      return res("Quitting...")
    }

    if (cmd === "ping") return res("pong")

    // OSD triggers - called from Hyprland keybinds
    if (cmd === "osd-volume") {
      triggerVolumeOSD()
      return res("ok")
    }

    if (cmd === "osd-brightness") {
      triggerBrightnessOSD()
      return res("ok")
    }

    res(`Unknown request: ${cmd}`)
  },
  main() {
    app.get_monitors().forEach((monitor, index) => TopBar(monitor, index))
    app.get_monitors().forEach((monitor, index) => BottomBar(monitor, index))
    ArchLogoPopup()
    BatteryPopup()
    BluetoothPopup()
    WifiPopup()
    PowerPopup()
    AgendaPopup()
    SettingsPopup()
    OSD()
    NotificationPopup()
  },
})
