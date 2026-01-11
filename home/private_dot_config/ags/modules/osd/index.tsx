import app from "ags/gtk4/app"
import { Astal, Gtk } from "ags/gtk4"
import { Accessor, createState } from "ags"
import { execAsync, subprocess } from "ags/process"
import Wp from "gi://AstalWp"
import { setupWindowTheme } from "../utils/theme"
import { checkAudioReady, onAudioReady } from "../utils/audio"

type OSDType = "volume" | "brightness"

interface OSDState {
  visible: boolean
  type: OSDType
  value: number
  muted?: boolean
}

const [osdState, setOsdState] = createState<OSDState>({
  visible: false,
  type: "volume",
  value: 0,
  muted: false,
})

let hideTimeout: ReturnType<typeof setTimeout> | null = null
const HIDE_DELAY = 1500

function showOSD(type: OSDType, value: number, muted = false) {
  if (hideTimeout) clearTimeout(hideTimeout)
  setOsdState({ visible: true, type, value, muted })
  hideTimeout = setTimeout(() => setOsdState((prev) => ({ ...prev, visible: false })), HIDE_DELAY)
}

export async function triggerVolumeOSD() {
  const wp = Wp.get_default()
  const speaker = wp?.audio?.defaultSpeaker
  if (speaker) {
    const vol = Math.round((speaker.volume || 0) * 100)
    const muted = speaker.mute ?? false
    showOSD("volume", vol, muted)
  }
}

export async function triggerBrightnessOSD() {
  await new Promise((resolve) => setTimeout(resolve, 10))
  const brightness = await getBrightnessValue()
  if (brightness >= 0) showOSD("brightness", brightness)
}

async function getBrightnessValue(): Promise<number> {
  try {
    const result = await execAsync("brightnessctl get")
    const max = await execAsync("brightnessctl max")
    return Math.round((parseInt(result.trim()) / parseInt(max.trim())) * 100)
  } catch {
    return -1
  }
}

const wp = Wp.get_default()
const audio = wp?.audio

let lastVolume = -1
let lastMuted = false
let startupGracePeriod = true

setTimeout(() => {
  startupGracePeriod = false
}, 2000)

if (wp) {
  if (wp.audio?.defaultSpeaker) {
    lastVolume = Math.round((wp.audio.defaultSpeaker.volume || 0) * 100)
    lastMuted = wp.audio.defaultSpeaker.mute ?? false
  }

  onAudioReady(() => {
    if (audio?.defaultSpeaker) {
      lastVolume = Math.round((audio.defaultSpeaker.volume || 0) * 100)
      lastMuted = audio.defaultSpeaker.mute ?? false
    }
    setupVolumeMonitor()
  })
}

function setupVolumeMonitor() {
  if (!audio) return

  let currentSpeaker = audio.defaultSpeaker
  let volumeId: number | null = null
  let muteId: number | null = null

  const connectSpeaker = () => {
    if (volumeId !== null && currentSpeaker) currentSpeaker.disconnect(volumeId)
    if (muteId !== null && currentSpeaker) currentSpeaker.disconnect(muteId)

    currentSpeaker = audio.defaultSpeaker
    if (!currentSpeaker) return

    volumeId = currentSpeaker.connect("notify::volume", () => {
      if (startupGracePeriod) return
      const vol = Math.round((currentSpeaker!.volume || 0) * 100)
      const muted = currentSpeaker!.mute ?? false
      lastVolume = vol
      showOSD("volume", vol, muted)
    })

    muteId = currentSpeaker.connect("notify::mute", () => {
      if (startupGracePeriod) return
      const vol = Math.round((currentSpeaker!.volume || 0) * 100)
      const muted = currentSpeaker!.mute ?? false
      lastMuted = muted
      showOSD("volume", vol, muted)
    })
  }

  connectSpeaker()
  audio.connect("notify::default-speaker", connectSpeaker)
}

let lastBrightness = -1
let isSettingBrightness = false

getBrightnessValue().then((v) => {
  if (v >= 0) lastBrightness = v
})

export function markBrightnessSettingStart() {
  isSettingBrightness = true
}

export function markBrightnessSettingEnd() {
  setTimeout(() => {
    isSettingBrightness = false
  }, 300)
}

subprocess(
  ["bash", "-c", "udevadm monitor --subsystem-match=backlight"],
  async () => {
    if (startupGracePeriod) return
    if (isSettingBrightness) return

    const brightness = await getBrightnessValue()
    if (brightness >= 0) {
      lastBrightness = brightness
      showOSD("brightness", brightness)
    }
  }
)

function getIcon(type: OSDType, value: number, muted = false): string {
  if (type === "brightness") {
    if (value <= 33) return "brightness_low"
    if (value <= 66) return "brightness_medium"
    return "brightness_high"
  }
  if (muted || value === 0) return "volume_off"
  if (value <= 33) return "volume_mute"
  if (value <= 66) return "volume_down"
  return "volume_up"
}

export function OSD() {
  const visible = new Accessor(
    () => osdState.peek().visible,
    (callback) => osdState.subscribe(callback)
  )

  const value = new Accessor(
    () => osdState.peek().value,
    (callback) => osdState.subscribe(callback)
  )

  const icon = new Accessor(
    () => getIcon(osdState.peek().type, osdState.peek().value, osdState.peek().muted),
    (callback) => osdState.subscribe(callback)
  )

  const isMuted = new Accessor(
    () => osdState.peek().muted ?? false,
    (callback) => osdState.subscribe(callback)
  )

  const setup = (win: Gtk.Window) => {
    setupWindowTheme(win)
  }

  return (
    <window
      name="osd"
      cssClasses={["osd-window"]}
      visible={visible}
      anchor={Astal.WindowAnchor.RIGHT}
      exclusivity={Astal.Exclusivity.NORMAL}
      layer={Astal.Layer.OVERLAY}
      application={app}
      marginRight={20}
      $={setup}
    >
      <box cssClasses={["osd-container"]} orientation={Gtk.Orientation.VERTICAL} spacing={8}>
        <label
          cssClasses={isMuted.as((m) => (m ? ["osd-value", "muted"] : ["osd-value"]))}
          label={value.as((v) => `${v}`)}
        />
        <box cssClasses={["osd-progress-container"]} vexpand halign={Gtk.Align.CENTER}>
          <Gtk.LevelBar
            cssClasses={isMuted.as((m) => (m ? ["osd-level", "muted"] : ["osd-level"]))}
            orientation={Gtk.Orientation.VERTICAL}
            inverted={true}
            value={value.as((v) => v / 100)}
            minValue={0}
            maxValue={1}
            vexpand
          />
        </box>
        <box cssClasses={["osd-icon-container"]} halign={Gtk.Align.CENTER} valign={Gtk.Align.CENTER}>
          <label
            cssClasses={isMuted.as((m) => (m ? ["osd-icon", "muted"] : ["osd-icon"]))}
            label={icon}
            halign={Gtk.Align.CENTER}
            valign={Gtk.Align.CENTER}
          />
        </box>
      </box>
    </window>
  )
}
