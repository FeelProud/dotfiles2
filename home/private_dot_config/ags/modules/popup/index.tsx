import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { Accessor, createState } from "ags"
import Hyprland from "gi://AstalHyprland"
import { setupWindowTheme } from "../utils/theme"

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

  popupStates.forEach(([, setOtherVisible], otherName) => {
    if (otherName !== name) {
      setOtherVisible(false)
    }
  })

  setVisible(!isCurrentlyVisible)
}

export function closePopup(name: string) {
  const [, setVisible] = getPopupState(name)
  setVisible(false)
}

export function openPopup(name: string) {
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

type PopupPosition = "top-left" | "top-center" | "top-right" | "bottom-left" | "bottom-center" | "bottom-right"

interface PopupWindowProps {
  name: string
  position?: PopupPosition
  marginTop?: number
  marginRight?: number
  marginBottom?: number
  marginLeft?: number
  widthRequest?: number
  children: JSX.Element
}

export function PopupWindow({
  name,
  position = "top-right",
  marginTop = 8,
  marginRight = 8,
  marginBottom = 8,
  marginLeft = 8,
  widthRequest,
  children,
}: PopupWindowProps) {
  const [visible] = getPopupState(name)

  const setup = (win: Gtk.Window) => {
    const keyController = new Gtk.EventControllerKey()
    keyController.connect("key-pressed", (_ctrl, keyval) => {
      if (keyval === Gdk.KEY_Escape) {
        closePopup(name)
        return true
      }
      return false
    })
    win.add_controller(keyController)

    const hypr = Hyprland.get_default()
    const workspaceId = hypr.connect("notify::focused-workspace", () => closePopup(name))
    const clientAddedId = hypr.connect("client-added", () => closePopup(name))

    const unsubscribeTheme = setupWindowTheme(win)

    win.connect("destroy", () => {
      hypr.disconnect(workspaceId)
      hypr.disconnect(clientAddedId)
      unsubscribeTheme()
    })
  }

  const ClickCatcher = ({
    hexpand = false,
    vexpand = false,
  }: {
    hexpand?: boolean
    vexpand?: boolean
  }) => (
    <button
      cssClasses={["popup-click-catcher"]}
      hexpand={hexpand}
      vexpand={vexpand}
      onClicked={() => closePopup(name)}
    />
  )

  const isTop = position.startsWith("top")
  const isLeft = position.endsWith("left")
  const isRight = position.endsWith("right")
  const vAlign = isTop ? Gtk.Align.START : Gtk.Align.END
  const hAlign = isLeft ? Gtk.Align.START : isRight ? Gtk.Align.END : Gtk.Align.CENTER

  return (
    <window
      name={name}
      cssClasses={["popup-window-fullscreen"]}
      visible={visible}
      anchor={
        Astal.WindowAnchor.TOP |
        Astal.WindowAnchor.BOTTOM |
        Astal.WindowAnchor.LEFT |
        Astal.WindowAnchor.RIGHT
      }
      exclusivity={Astal.Exclusivity.NORMAL}
      keymode={Astal.Keymode.ON_DEMAND}
      layer={Astal.Layer.OVERLAY}
      application={app}
      $={setup}
    >
      <box orientation={Gtk.Orientation.HORIZONTAL} hexpand vexpand>
        {!isLeft && <ClickCatcher hexpand vexpand />}

        <box orientation={Gtk.Orientation.VERTICAL} hexpand={false} vexpand>
          {!isTop && <ClickCatcher hexpand vexpand />}

          <box
            orientation={Gtk.Orientation.VERTICAL}
            valign={vAlign}
            halign={hAlign}
            hexpand={false}
            cssClasses={["popup-content-wrapper"]}
            marginTop={isTop ? marginTop : 0}
            marginBottom={!isTop ? marginBottom : 0}
            marginStart={isLeft ? marginLeft : 0}
            marginEnd={isRight ? marginRight : 0}
            widthRequest={widthRequest ?? -1}
          >
            {children}
          </box>

          {isTop && <ClickCatcher hexpand vexpand />}
        </box>

        {!isRight && <ClickCatcher hexpand vexpand />}
      </box>
    </window>
  )
}

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
