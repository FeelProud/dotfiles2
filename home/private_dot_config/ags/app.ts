import app from "ags/gtk4/app"
import style from "./style.scss"
import { TopBar, BottomBar } from "./modules/bar"

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
    app.get_monitors().map(TopBar)
    app.get_monitors().map(BottomBar)
  },
})