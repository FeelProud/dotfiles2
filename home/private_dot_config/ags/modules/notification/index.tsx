import app from "ags/gtk4/app"
import { Astal, Gtk } from "ags/gtk4"
import { Accessor, createState } from "ags"
import Notifd from "gi://AstalNotifd"

// State for the notification popup
interface NotificationPopupState {
  visible: boolean
  notification: Notifd.Notification | null
}

const [popupState, setPopupState] = createState<NotificationPopupState>({
  visible: false,
  notification: null,
})

let hideTimeout: ReturnType<typeof setTimeout> | null = null
const DISPLAY_DURATION = 5000 // 5 seconds

// Show notification popup
function showNotificationPopup(notification: Notifd.Notification) {
  // Clear existing timeout
  if (hideTimeout) {
    clearTimeout(hideTimeout)
  }

  // Show popup with new notification
  setPopupState({ visible: true, notification })

  // Auto-hide after delay
  hideTimeout = setTimeout(() => {
    setPopupState((prev) => ({ ...prev, visible: false }))
  }, DISPLAY_DURATION)
}

// Hide popup
function hideNotificationPopup() {
  if (hideTimeout) {
    clearTimeout(hideTimeout)
    hideTimeout = null
  }
  setPopupState((prev) => ({ ...prev, visible: false }))
}

// Format time ago for notifications
function formatTimeAgo(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000)
  const diff = now - timestamp

  if (diff < 60) return "Just now"
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

// Notifd setup - listen for new notifications
const notifd = Notifd.get_default()

// Listen for new notifications
notifd.connect("notified", (_self, id: number) => {
  const notification = notifd.get_notification(id)
  if (notification) {
    showNotificationPopup(notification)
  }
})

// Also hide popup when notification is resolved/dismissed
notifd.connect("resolved", (_self, id: number) => {
  const currentNotification = popupState.peek().notification
  if (currentNotification && currentNotification.id === id) {
    hideNotificationPopup()
  }
})

// Notification popup window component
export function NotificationPopup() {
  const visible = new Accessor(
    () => popupState.peek().visible,
    (callback) => popupState.subscribe(callback)
  )

  const appName = new Accessor(
    () => popupState.peek().notification?.appName || "Notification",
    (callback) => popupState.subscribe(callback)
  )

  const summary = new Accessor(
    () => popupState.peek().notification?.summary || "",
    (callback) => popupState.subscribe(callback)
  )

  const body = new Accessor(
    () => popupState.peek().notification?.body || "",
    (callback) => popupState.subscribe(callback)
  )

  const timeAgo = new Accessor(
    () => {
      const notif = popupState.peek().notification
      return notif ? formatTimeAgo(notif.time) : ""
    },
    (callback) => popupState.subscribe(callback)
  )

  const hasBody = new Accessor(
    () => !!popupState.peek().notification?.body,
    (callback) => popupState.subscribe(callback)
  )

  const hasActions = new Accessor(
    () => (popupState.peek().notification?.actions?.length || 0) > 0,
    (callback) => popupState.subscribe(callback)
  )

  return (
    <window
      name="notification-popup"
      cssClasses={["notification-popup-window"]}
      visible={visible}
      anchor={Astal.WindowAnchor.TOP}
      exclusivity={Astal.Exclusivity.NORMAL}
      layer={Astal.Layer.OVERLAY}
      application={app}
      marginTop={50}
    >
      <button
        cssClasses={["notification-popup-button"]}
        onClicked={hideNotificationPopup}
      >
        <box cssClasses={["notification-popup-container"]} spacing={12}>
          {/* App icon / image */}
          <box cssClasses={["notification-popup-icon-container"]} valign={Gtk.Align.START}>
            <Gtk.Image
              pixelSize={48}
              $={(img: Gtk.Image) => {
                const updateImage = () => {
                  const notif = popupState.peek().notification
                  if (!notif) {
                    img.set_from_icon_name("dialog-information-symbolic")
                    return
                  }
                  const imagePath = notif.image
                  if (imagePath) {
                    img.set_from_file(imagePath)
                  } else if (notif.appIcon) {
                    img.set_from_icon_name(notif.appIcon)
                  } else {
                    img.set_from_icon_name("dialog-information-symbolic")
                  }
                }
                updateImage()
                const unsub = popupState.subscribe(updateImage)
                img.connect("destroy", unsub)
              }}
            />
          </box>

          {/* Content */}
          <box orientation={Gtk.Orientation.VERTICAL} spacing={4} hexpand>
            <box spacing={8}>
              <label
                cssClasses={["notification-popup-app"]}
                label={appName}
                halign={Gtk.Align.START}
                hexpand
              />
              <label
                cssClasses={["notification-popup-time"]}
                label={timeAgo}
                halign={Gtk.Align.END}
              />
            </box>
            <label
              cssClasses={["notification-popup-summary"]}
              label={summary}
              halign={Gtk.Align.START}
              ellipsize={3}
              maxWidthChars={35}
            />
            <label
              cssClasses={["notification-popup-body"]}
              label={body}
              halign={Gtk.Align.START}
              ellipsize={3}
              maxWidthChars={40}
              lines={2}
              wrap
              visible={hasBody}
            />
            {/* Actions */}
            <box
              spacing={6}
              cssClasses={["notification-popup-actions"]}
              marginTop={6}
              halign={Gtk.Align.END}
              visible={hasActions}
              $={(actionsBox: Gtk.Box) => {
                const updateActions = () => {
                  // Clear existing children
                  let child = actionsBox.get_first_child()
                  while (child) {
                    const next = child.get_next_sibling()
                    actionsBox.remove(child)
                    child = next
                  }

                  const notif = popupState.peek().notification
                  if (!notif?.actions) return

                  for (const action of notif.actions) {
                    const btn = new Gtk.Button()
                    btn.add_css_class("notification-popup-action-btn")
                    const label = new Gtk.Label({ label: action.label })
                    btn.set_child(label)
                    btn.connect("clicked", () => {
                      notif.invoke(action.id)
                      hideNotificationPopup()
                    })
                    actionsBox.append(btn)
                  }
                }
                updateActions()
                const unsub = popupState.subscribe(updateActions)
                actionsBox.connect("destroy", unsub)
              }}
            />
          </box>

          {/* Close button */}
          <button
            cssClasses={["notification-popup-close"]}
            valign={Gtk.Align.START}
            onClicked={() => {
              const notif = popupState.peek().notification
              if (notif) {
                notif.dismiss()
              }
              hideNotificationPopup()
            }}
          >
            <label label="close" cssClasses={["notification-popup-close-icon"]} />
          </button>
        </box>
      </button>
    </window>
  )
}
