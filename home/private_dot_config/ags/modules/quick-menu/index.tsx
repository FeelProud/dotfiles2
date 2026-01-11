import { Gtk } from "ags/gtk4"
import GLib from "gi://GLib"
import { Accessor, For, createState } from "ags"
import { createPoll } from "ags/time"
import { PopupWindow, PopupButton, closePopup } from "../popup"
import Mpris from "gi://AstalMpris"
import Notifd from "gi://AstalNotifd"
import { execAsync } from "ags/process"
import { formatTimeAgo } from "../utils/time"
import { createModuleLogger } from "../utils/logger"

const logger = createModuleLogger("QuickMenu")

const POPUP_NAME = "agenda-popup"

const [isRecording, setIsRecording] = createState(false)

const time = createPoll("", 1000, "date +'%a %d %b • %I:%M %p'")

const mpris = Mpris.get_default()

const playersAccessor = new Accessor(
  () => mpris.players || [],
  (callback) => {
    const addedId = mpris.connect("player-added", callback)
    const closedId = mpris.connect("player-closed", callback)
    return () => {
      mpris.disconnect(addedId)
      mpris.disconnect(closedId)
    }
  }
)

const notifd = Notifd.get_default()

const notificationsAccessor = new Accessor(
  () => notifd.notifications || [],
  (callback) => {
    const notifiedId = notifd.connect("notified", callback)
    const resolvedId = notifd.connect("resolved", callback)
    return () => {
      notifd.disconnect(notifiedId)
      notifd.disconnect(resolvedId)
    }
  }
)

export function Agenda() {
  return (
    <PopupButton popupName={POPUP_NAME} cssClasses={["agenda-widget"]}>
      <label label={time} />
    </PopupButton>
  )
}

function MusicPlayer({ player }: { player: Mpris.Player }) {
  const title = new Accessor(
    () => player.title || "Unknown",
    (callback) => {
      const id = player.connect("notify::title", callback)
      return () => player.disconnect(id)
    }
  )

  const artist = new Accessor(
    () => player.artist || "Unknown Artist",
    (callback) => {
      const id = player.connect("notify::artist", callback)
      return () => player.disconnect(id)
    }
  )

  const coverArt = new Accessor(
    () => player.coverArt || "",
    (callback) => {
      const id = player.connect("notify::cover-art", callback)
      return () => player.disconnect(id)
    }
  )

  const playbackStatus = new Accessor(
    () => player.playbackStatus,
    (callback) => {
      const id = player.connect("notify::playback-status", callback)
      return () => player.disconnect(id)
    }
  )

  const canGoNext = new Accessor(
    () => player.canGoNext,
    (callback) => {
      const id = player.connect("notify::can-go-next", callback)
      return () => player.disconnect(id)
    }
  )

  const canGoPrevious = new Accessor(
    () => player.canGoPrevious,
    (callback) => {
      const id = player.connect("notify::can-go-previous", callback)
      return () => player.disconnect(id)
    }
  )

  const canPlay = new Accessor(
    () => player.canPlay,
    (callback) => {
      const id = player.connect("notify::can-play", callback)
      return () => player.disconnect(id)
    }
  )

  const canPause = new Accessor(
    () => player.canPause,
    (callback) => {
      const id = player.connect("notify::can-pause", callback)
      return () => player.disconnect(id)
    }
  )

  const length = new Accessor(
    () => player.length,
    (callback) => {
      const id = player.connect("notify::length", callback)
      return () => player.disconnect(id)
    }
  )

  const getPlayPauseIcon = (status: Mpris.PlaybackStatus) => {
    return status === Mpris.PlaybackStatus.PLAYING ? "pause" : "play_arrow"
  }

  const formatTime = (seconds: number): string => {
    if (seconds < 0) return "0:00"
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  return (
    <box orientation={Gtk.Orientation.VERTICAL} spacing={4} cssClasses={["music-player"]}>
      <box spacing={8}>
        <box cssClasses={["album-art-container"]}>
          <Gtk.Image
            cssClasses={["album-art"]}
            pixelSize={32}
            $={(img: Gtk.Image) => {
              const updateArt = () => {
                const art = coverArt.peek()
                if (art) {
                  img.set_from_file(art)
                } else {
                  img.set_from_icon_name("audio-x-generic-symbolic")
                }
              }
              updateArt()
              coverArt.subscribe(updateArt)
            }}
          />
        </box>

        <box orientation={Gtk.Orientation.VERTICAL} spacing={0} hexpand valign={Gtk.Align.CENTER}>
          <label
            cssClasses={["track-title"]}
            label={title}
            halign={Gtk.Align.START}
            ellipsize={3}
            maxWidthChars={20}
          />
          <label
            cssClasses={["track-artist"]}
            label={artist}
            halign={Gtk.Align.START}
            ellipsize={3}
            maxWidthChars={20}
          />
        </box>

        <box halign={Gtk.Align.END} spacing={4} cssClasses={["player-controls"]} valign={Gtk.Align.CENTER}>
          <button
            cssClasses={["control-button"]}
            onClicked={() => player.previous()}
            sensitive={canGoPrevious}
          >
            <label label="skip_previous" cssClasses={["control-icon"]} />
          </button>
          <button
            cssClasses={["control-button", "play-pause"]}
            onClicked={() => player.play_pause()}
            sensitive={canPlay.as((cp) => cp || canPause.peek())}
          >
            <label
              label={playbackStatus.as((s) => getPlayPauseIcon(s))}
              cssClasses={["control-icon"]}
            />
          </button>
          <button
            cssClasses={["control-button"]}
            onClicked={() => player.next()}
            sensitive={canGoNext}
          >
            <label label="skip_next" cssClasses={["control-icon"]} />
          </button>
        </box>
      </box>

      <box spacing={6} valign={Gtk.Align.CENTER}>
        <label
          cssClasses={["progress-time"]}
          $={(label: Gtk.Label) => {
            const update = () => {
              label.label = formatTime(player.position)
            }
            update()
            const interval = setInterval(update, 1000)
            label.connect("destroy", () => clearInterval(interval))
          }}
        />
        <Gtk.ProgressBar
          cssClasses={["progress-bar"]}
          hexpand
          $={(bar: Gtk.ProgressBar) => {
            const update = () => {
              const pos = player.position
              const len = player.length
              bar.set_fraction(len > 0 ? pos / len : 0)
            }
            update()
            const interval = setInterval(update, 1000)
            bar.connect("destroy", () => clearInterval(interval))
          }}
        />
        <label
          cssClasses={["progress-time"]}
          label={length.as((l) => formatTime(l))}
        />
      </box>
    </box>
  )
}

function QuickToolButton({
  icon,
  label,
  command,
}: {
  icon: string
  label: string
  command: string
}) {
  return (
    <button
      cssClasses={["quick-tool-button"]}
      tooltipText={label}
      onClicked={() => {
        closePopup(POPUP_NAME)
        setTimeout(() => {
          execAsync(["bash", "-c", command]).catch((err) => {
            logger.error(`Failed to execute quick tool command: ${command}`, err)
          })
        }, 100)
      }}
    >
      <box orientation={Gtk.Orientation.VERTICAL} spacing={4}>
        <label label={icon} cssClasses={["quick-tool-icon"]} />
        <label label={label} cssClasses={["quick-tool-label"]} />
      </box>
    </button>
  )
}

function RecordButton() {
  const toggleRecording = async () => {
    if (isRecording()) {
      execAsync(["pkill", "-SIGINT", "wf-recorder"]).catch((err) => {
        logger.warn(`Could not stop wf-recorder: ${err}`)
      })
      setIsRecording(false)
    } else {
      closePopup(POPUP_NAME)
      try {
        const geometry = await execAsync(["slurp"])
        if (geometry) {
          const home = GLib.get_home_dir()
          const filename = `${home}/Videos/recording-${new Date().toISOString().replace(/[:.]/g, "-")}.mp4`
          setIsRecording(true)
          execAsync(["wf-recorder", "-g", geometry.trim(), "-f", filename])
            .then(() => setIsRecording(false))
            .catch(() => setIsRecording(false))
        }
      } catch {}
    }
  }

  return (
    <button
      cssClasses={isRecording.as((r) => (r ? ["quick-tool-button", "recording"] : ["quick-tool-button"]))}
      tooltipText={isRecording.as((r) => (r ? "Stop Recording" : "Record"))}
      onClicked={toggleRecording}
    >
      <box orientation={Gtk.Orientation.VERTICAL} spacing={4}>
        <label
          label={isRecording.as((r) => (r ? "stop_circle" : "videocam"))}
          cssClasses={["quick-tool-icon"]}
        />
        <label
          label={isRecording.as((r) => (r ? "Stop" : "Record"))}
          cssClasses={["quick-tool-label"]}
        />
      </box>
    </button>
  )
}

function QuickTools() {
  return (
    <box orientation={Gtk.Orientation.VERTICAL} spacing={4} cssClasses={["agenda-section"]}>
      <box cssClasses={["section-title"]} spacing={6}>
        <label label="build" cssClasses={["section-icon"]} />
        <label cssClasses={["section-title-label"]} label="Quick Tools" />
      </box>
      <box spacing={8} cssClasses={["quick-tools-grid"]} homogeneous>
        <QuickToolButton icon="colorize" label="Picker" command="hyprpicker -a" />
        <QuickToolButton icon="screenshot_region" label="Screenshot" command="hyprshot -m region -o ~/Pictures/Screenshots" />
        <RecordButton />
        <QuickToolButton icon="calculate" label="Calculator" command="qalculate-gtk" />
        <QuickToolButton icon="event" label="Agenda" command="gnome-calendar" />
        <QuickToolButton icon="desktop_windows" label="Displays" command="nwg-displays" />
      </box>
    </box>
  )
}

function NotificationItem({ notification }: { notification: Notifd.Notification }) {
  const actionsAccessor = new Accessor(
    () => notification.actions || [],
    () => () => {}
  )

  return (
    <box cssClasses={["notification-item"]} spacing={10}>
      <Gtk.Image
        cssClasses={["notification-icon"]}
        pixelSize={48}
        valign={Gtk.Align.CENTER}
        $={(img: Gtk.Image) => {
          const imagePath = notification.image
          if (imagePath) {
            img.set_from_file(imagePath)
          } else if (notification.appIcon) {
            img.set_from_icon_name(notification.appIcon)
          } else {
            img.set_from_icon_name("dialog-information-symbolic")
          }
        }}
      />

      <box orientation={Gtk.Orientation.VERTICAL} spacing={2} hexpand valign={Gtk.Align.CENTER}>
        <box spacing={4} valign={Gtk.Align.START}>
          <label
            cssClasses={["notification-app"]}
            label={notification.appName || "Unknown"}
            halign={Gtk.Align.START}
            valign={Gtk.Align.CENTER}
            hexpand
          />
          <label
            cssClasses={["notification-time"]}
            label={formatTimeAgo(notification.time)}
            halign={Gtk.Align.END}
            valign={Gtk.Align.CENTER}
          />
          <button
            cssClasses={["notification-close"]}
            valign={Gtk.Align.CENTER}
            onClicked={() => notification.dismiss()}
          >
            <label label="close" cssClasses={["close-icon"]} />
          </button>
        </box>
        <label
          cssClasses={["notification-summary"]}
          label={notification.summary || ""}
          halign={Gtk.Align.START}
          ellipsize={3}
          maxWidthChars={30}
        />
        <box spacing={8} visible={!!notification.body || actionsAccessor.as((a) => a.length > 0)}>
          <label
            cssClasses={["notification-body"]}
            label={notification.body || ""}
            halign={Gtk.Align.START}
            valign={Gtk.Align.START}
            ellipsize={3}
            maxWidthChars={30}
            lines={2}
            wrap
            hexpand
            visible={!!notification.body}
          />
          <box
            spacing={4}
            cssClasses={["notification-actions"]}
            halign={Gtk.Align.END}
            valign={Gtk.Align.END}
            visible={actionsAccessor.as((a) => a.length > 0)}
          >
            <For each={actionsAccessor}>
              {(action) => (
                <button
                  cssClasses={["notification-action-button"]}
                  onClicked={() => notification.invoke(action.id)}
                >
                  <label label={action.label} />
                </button>
              )}
            </For>
          </box>
        </box>
      </box>
    </box>
  )
}

export function AgendaPopup() {
  return (
    <PopupWindow name={POPUP_NAME} position="top-center">
      <box orientation={Gtk.Orientation.VERTICAL} spacing={8} cssClasses={["agenda-menu"]}>
        <QuickTools />

        <box cssClasses={["separator"]} />

        <box orientation={Gtk.Orientation.VERTICAL} spacing={4} cssClasses={["agenda-section"]}>
          <box cssClasses={["section-title"]} spacing={6}>
            <label label="music_note" cssClasses={["section-icon"]} />
            <label cssClasses={["section-title-label"]} label="Now Playing" />
          </box>
          <box orientation={Gtk.Orientation.VERTICAL} spacing={8} cssClasses={["music-section"]}>
            <box
              cssClasses={["no-content"]}
              halign={Gtk.Align.CENTER}
              spacing={8}
              visible={playersAccessor.as((p) => p.length === 0)}
            >
              <label label="music_off" cssClasses={["no-content-icon"]} />
              <label label="No media playing" cssClasses={["no-content-label"]} />
            </box>
            <box
              orientation={Gtk.Orientation.VERTICAL}
              spacing={8}
              visible={playersAccessor.as((p) => p.length > 0)}
            >
              <For each={playersAccessor}>
                {(player) => <MusicPlayer player={player} />}
              </For>
            </box>
          </box>
        </box>

        <box cssClasses={["separator"]} />

        <box orientation={Gtk.Orientation.VERTICAL} spacing={4} cssClasses={["agenda-section"]}>
          <box cssClasses={["section-title"]} spacing={6}>
            <label label="notifications" cssClasses={["section-icon"]} />
            <label cssClasses={["section-title-label"]} label="Notifications" />
            <box hexpand />
            <button
              cssClasses={["clear-all-button"]}
              onClicked={() => {
                const notifications = notifd.notifications || []
                notifications.forEach((n) => n.dismiss())
              }}
              visible={notificationsAccessor.as((n) => n.length > 0)}
            >
              <label label="Clear all" cssClasses={["clear-all-label"]} />
            </button>
          </box>
          <Gtk.ScrolledWindow
            cssClasses={["notifications-scroll"]}
            hscrollbarPolicy={Gtk.PolicyType.NEVER}
            vscrollbarPolicy={Gtk.PolicyType.AUTOMATIC}
            propagateNaturalHeight={true}
            maxContentHeight={500}
          >
            <box orientation={Gtk.Orientation.VERTICAL} spacing={6} cssClasses={["notifications-list"]}>
              <box
                cssClasses={["no-content"]}
                halign={Gtk.Align.CENTER}
                spacing={8}
                visible={notificationsAccessor.as((n) => n.length === 0)}
              >
                <label label="notifications_off" cssClasses={["no-content-icon"]} />
                <label label="No notifications" cssClasses={["no-content-label"]} />
              </box>
              <box
                orientation={Gtk.Orientation.VERTICAL}
                spacing={6}
                visible={notificationsAccessor.as((n) => n.length > 0)}
              >
                <For each={notificationsAccessor}>
                  {(notification) => <NotificationItem notification={notification} />}
                </For>
              </box>
            </box>
          </Gtk.ScrolledWindow>
        </box>
      </box>
    </PopupWindow>
  )
}
