import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { Accessor, createState } from "ags"

// Global popup state manager
const popupStates = new Map<string, [Accessor<boolean>, (v: boolean) => void]>()

export function getPopupState(name: string): [Accessor<boolean>, (v: boolean) => void] {
  if (!popupStates.has(name)) {
    popupStates.set(name, createState(false))
  }
  return popupStates.get(name)!
}

export function togglePopup(name: string) {
  const [visible, setVisible] = getPopupState(name)
  const isCurrentlyVisible = visible.peek()

  // Close all other popups first
  popupStates.forEach(([, setOtherVisible], otherName) => {
    if (otherName !== name) {
      setOtherVisible(false)
    }
  })

  // Toggle the requested popup
  setVisible(!isCurrentlyVisible)
}

export function closePopup(name: string) {
  const [, setVisible] = getPopupState(name)
  setVisible(false)
}

export function openPopup(name: string) {
  // Close all other popups first
  popupStates.forEach(([, setOtherVisible], otherName) => {
    if (otherName !== name) {
      setOtherVisible(false)
    }
  })

  const [, setVisible] = getPopupState(name)
  setVisible(true)
}

export function closeAllPopups() {
  popupStates.forEach(([, setVisible]) => setVisible(false))
}

interface PopupWindowProps {
  name: string
  anchor?: Astal.WindowAnchor
  marginTop?: number
  marginRight?: number
  marginBottom?: number
  marginLeft?: number
  children: JSX.Element
}

export function PopupWindow({
  name,
  anchor = Astal.WindowAnchor.TOP | Astal.WindowAnchor.RIGHT,
  marginTop = 8,
  marginRight = 8,
  marginBottom = 8,
  marginLeft = 8,
  children,
}: PopupWindowProps) {
  const [visible] = getPopupState(name)

  const setup = (win: Astal.Window) => {
    // Key controller for Escape
    const keyController = new Gtk.EventControllerKey()
    keyController.connect("key-pressed", (_ctrl, keyval) => {
      if (keyval === Gdk.KEY_Escape) {
        closePopup(name)
        return true
      }
      return false
    })
    win.add_controller(keyController)
  }

  return (
    <window
      name={name}
      cssClasses={["popup-window"]}
      visible={visible}
      anchor={anchor}
      exclusivity={Astal.Exclusivity.NORMAL}
      keymode={Astal.Keymode.ON_DEMAND}
      margin_top={marginTop}
      margin_right={marginRight}
      margin_bottom={marginBottom}
      margin_left={marginLeft}
      application={app}
      $={setup}
    >
      <box cssClasses={["popup-content-wrapper"]}>
        {children}
      </box>
    </window>
  )
}

// Popup toggle button component
interface PopupButtonProps {
  popupName: string
  children: JSX.Element
  cssClasses?: string[]
}

export function PopupButton({ popupName, children, cssClasses = [] }: PopupButtonProps) {
  return (
    <button
      cssClasses={["popup-trigger", ...cssClasses]}
      onClicked={() => togglePopup(popupName)}
    >
      {children}
    </button>
  )
}
