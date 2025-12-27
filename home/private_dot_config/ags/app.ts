import app from "ags/gtk4/app"
import style from "./style.scss"
import { TopBar, BottomBar } from "./modules/bar"
import { ArchLogoPopup } from "./modules/archlogo"
import { BatteryPopup } from "./modules/battery"
import { BluetoothPopup } from "./modules/bluetooth"
import { WifiPopup } from "./modules/wifi"
import { PowerPopup } from "./modules/powermenu"
import { ClockPopup } from "./modules/clock"

app.start({
  css: style,
  // This is the clean fix:
  requestHandler(request: string, res: (response: any) => void) {
    if (request === "quit") {
      app.quit()
      return res("Quitting...")
    }

    // You can add logic here to reload CSS or toggle windows
    if (request === "ping") return res("pong")

    res(`Unknown request: ${request}`)
  },
  main() {
    app.get_monitors().forEach((monitor, index) => TopBar(monitor, index))
    app.get_monitors().forEach((monitor, index) => BottomBar(monitor, index))
    // PopupClickCatcher() // Disabled - layer-shell windows can't catch clicks over apps
    ArchLogoPopup()
    BatteryPopup()
    BluetoothPopup()
    WifiPopup()
    PowerPopup()
    ClockPopup()
  },
})
