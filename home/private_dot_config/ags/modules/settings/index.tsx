import { Gtk } from "ags/gtk4"
import { Accessor, For } from "ags"
import { execAsync, subprocess } from "ags/process"
import { PopupWindow, PopupButton } from "../popup"
import Wp from "gi://AstalWp"

const POPUP_NAME = "settings-popup"

// Audio setup
const audio = Wp.get_default()?.audio

// Brightness state - reactive using udevadm monitor for instant updates
const getBrightness = async (): Promise<number> => {
  try {
    const result = await execAsync("brightnessctl get")
    const max = await execAsync("brightnessctl max")
    return Math.round((parseInt(result.trim()) / parseInt(max.trim())) * 100)
  } catch {
    return 50
  }
}

// Create a mutable state holder for brightness
let currentBrightness = 50
const brightnessSubscribers: Set<() => void> = new Set()
let debounceTimeout: ReturnType<typeof setTimeout> | null = null
let isSettingBrightness = false

const updateBrightness = () => {
  if (isSettingBrightness) return
  getBrightness().then((v) => {
    if (currentBrightness !== v) {
      currentBrightness = v
      brightnessSubscribers.forEach((cb) => cb())
    }
  })
}

// Initialize brightness value
updateBrightness()

// Start udevadm monitor to watch for backlight changes
subprocess(
  ["bash", "-c", "udevadm monitor --subsystem-match=backlight"],
  () => {
    // Debounce: udevadm outputs multiple lines per event
    if (debounceTimeout) clearTimeout(debounceTimeout)
    debounceTimeout = setTimeout(updateBrightness, 100)
  }
)

// Create an Accessor for the brightness value
const brightnessValue = new Accessor(
  () => currentBrightness,
  (callback) => {
    brightnessSubscribers.add(callback)
    return () => brightnessSubscribers.delete(callback)
  }
)

const setBrightness = async (percent: number) => {
  isSettingBrightness = true
  currentBrightness = percent
  brightnessSubscribers.forEach((cb) => cb())
  await execAsync(`brightnessctl set ${percent}%`)
  // Allow udev events again after a short delay
  setTimeout(() => {
    isSettingBrightness = false
  }, 200)
}

// Create reactive accessor for speakers list
const speakersAccessor = audio
  ? new Accessor(
      () => audio.speakers || [],
      (callback) => {
        const id = audio.connect("notify::speakers", callback)
        return () => audio.disconnect(id)
      }
    )
  : new Accessor(() => [] as Wp.Endpoint[], () => () => {})

// Create reactive accessor for microphones list
const microphonesAccessor = audio
  ? new Accessor(
      () => audio.microphones || [],
      (callback) => {
        const id = audio.connect("notify::microphones", callback)
        return () => audio.disconnect(id)
      }
    )
  : new Accessor(() => [] as Wp.Endpoint[], () => () => {})

export function Settings() {
  return (
    <PopupButton popupName={POPUP_NAME} cssClasses={["settings-widget"]}>
      <box spacing={4}>
        <Gtk.Image iconName="emblem-system-symbolic" />
      </box>
    </PopupButton>
  )
}

// Single device item component
function DeviceItem({
  endpoint,
  icon,
}: {
  endpoint: Wp.Endpoint
  icon: string
}) {
  const isDefault = new Accessor(
    () => endpoint.isDefault,
    (callback) => {
      const id = endpoint.connect("notify::is-default", callback)
      return () => endpoint.disconnect(id)
    }
  )

  return (
    <button
      cssClasses={isDefault.as((d) => d ? ["selector-item", "selected"] : ["selector-item"])}
      onClicked={() => endpoint.isDefault = true}
    >
      <box spacing={8}>
        <Gtk.Image iconName={icon} pixelSize={14} />
        <label
          label={endpoint.description || endpoint.name || "Unknown"}
          hexpand
          halign={Gtk.Align.START}
          ellipsize={3}
        />
        {isDefault.as((d) =>
          d ? <Gtk.Image iconName="object-select-symbolic" pixelSize={14} /> : <box />
        )()}
      </box>
    </button>
  )
}

// Device selector component
function DeviceSelector({
  label,
  icon,
  endpoints,
}: {
  label: string
  icon: string
  endpoints: Accessor<Wp.Endpoint[]>
}) {
  return (
    <box orientation={Gtk.Orientation.VERTICAL} spacing={4} cssClasses={["device-selector"]}>
      <box cssClasses={["selector-header"]} spacing={8}>
        <Gtk.Image iconName={icon} pixelSize={16} />
        <label cssClasses={["selector-label"]} label={label} />
      </box>
      <box orientation={Gtk.Orientation.VERTICAL} spacing={2} cssClasses={["selector-list"]}>
        <For each={endpoints}>
          {(endpoint) => <DeviceItem endpoint={endpoint} icon={icon} />}
        </For>
      </box>
    </box>
  )
}

export function SettingsPopup() {
  // Volume accessor for default speaker - listens to both speaker changes and volume changes
  const volume = audio
    ? new Accessor(
        () => Math.round((audio.defaultSpeaker?.volume || 0) * 100),
        (callback) => {
          const speakerId = audio.connect("notify::default-speaker", callback)
          // Also need to listen to volume changes on the current speaker
          let volumeId: number | null = null
          let currentSpeaker: Wp.Endpoint | null = null

          const updateVolumeListener = () => {
            if (volumeId !== null && currentSpeaker) {
              currentSpeaker.disconnect(volumeId)
            }
            currentSpeaker = audio.defaultSpeaker
            if (currentSpeaker) {
              volumeId = currentSpeaker.connect("notify::volume", callback)
            }
          }
          updateVolumeListener()
          const speakerChangeId = audio.connect("notify::default-speaker", updateVolumeListener)

          return () => {
            audio.disconnect(speakerId)
            audio.disconnect(speakerChangeId)
            if (volumeId !== null && currentSpeaker) {
              currentSpeaker.disconnect(volumeId)
            }
          }
        }
      )
    : new Accessor(() => 0, () => () => {})

  // Volume muted accessor for default speaker
  const volumeMuted = audio
    ? new Accessor(
        () => audio.defaultSpeaker?.mute ?? false,
        (callback) => {
          const speakerId = audio.connect("notify::default-speaker", callback)
          let muteId: number | null = null
          let currentSpeaker: Wp.Endpoint | null = null

          const updateMuteListener = () => {
            if (muteId !== null && currentSpeaker) {
              currentSpeaker.disconnect(muteId)
            }
            currentSpeaker = audio.defaultSpeaker
            if (currentSpeaker) {
              muteId = currentSpeaker.connect("notify::mute", callback)
            }
          }
          updateMuteListener()
          const speakerChangeId = audio.connect("notify::default-speaker", updateMuteListener)

          return () => {
            audio.disconnect(speakerId)
            audio.disconnect(speakerChangeId)
            if (muteId !== null && currentSpeaker) {
              currentSpeaker.disconnect(muteId)
            }
          }
        }
      )
    : new Accessor(() => false, () => () => {})

  // Mic volume accessor
  const micVolume = audio
    ? new Accessor(
        () => Math.round((audio.defaultMicrophone?.volume || 0) * 100),
        (callback) => {
          const micId = audio.connect("notify::default-microphone", callback)
          let volumeId: number | null = null
          let currentMic: Wp.Endpoint | null = null

          const updateVolumeListener = () => {
            if (volumeId !== null && currentMic) {
              currentMic.disconnect(volumeId)
            }
            currentMic = audio.defaultMicrophone
            if (currentMic) {
              volumeId = currentMic.connect("notify::volume", callback)
            }
          }
          updateVolumeListener()
          const micChangeId = audio.connect("notify::default-microphone", updateVolumeListener)

          return () => {
            audio.disconnect(micId)
            audio.disconnect(micChangeId)
            if (volumeId !== null && currentMic) {
              currentMic.disconnect(volumeId)
            }
          }
        }
      )
    : new Accessor(() => 0, () => () => {})

  // Mic muted accessor
  const micMuted = audio
    ? new Accessor(
        () => audio.defaultMicrophone?.mute ?? false,
        (callback) => {
          const micId = audio.connect("notify::default-microphone", callback)
          let muteId: number | null = null
          let currentMic: Wp.Endpoint | null = null

          const updateMuteListener = () => {
            if (muteId !== null && currentMic) {
              currentMic.disconnect(muteId)
            }
            currentMic = audio.defaultMicrophone
            if (currentMic) {
              muteId = currentMic.connect("notify::mute", callback)
            }
          }
          updateMuteListener()
          const micChangeId = audio.connect("notify::default-microphone", updateMuteListener)

          return () => {
            audio.disconnect(micId)
            audio.disconnect(micChangeId)
            if (muteId !== null && currentMic) {
              currentMic.disconnect(muteId)
            }
          }
        }
      )
    : new Accessor(() => false, () => () => {})

  const onVolumeChange = (scale: Gtk.Scale) => {
    const speaker = audio?.defaultSpeaker
    if (speaker) {
      speaker.volume = scale.get_value() / 100
    }
  }

  const onMicVolumeChange = (scale: Gtk.Scale) => {
    const microphone = audio?.defaultMicrophone
    if (microphone) {
      microphone.volume = scale.get_value() / 100
    }
  }

  const onBrightnessChange = (scale: Gtk.Scale) => {
    const value = Math.round(scale.get_value())
    setBrightness(value)
  }

  const toggleMute = () => {
    const speaker = audio?.defaultSpeaker
    if (speaker) {
      speaker.mute = !speaker.mute
    }
  }

  const toggleMicMute = () => {
    const microphone = audio?.defaultMicrophone
    if (microphone) {
      microphone.mute = !microphone.mute
    }
  }

  const getVolumeIcon = (muted: boolean, vol: number) => {
    if (muted) return "audio-volume-muted-symbolic"
    if (vol > 66) return "audio-volume-high-symbolic"
    if (vol > 33) return "audio-volume-medium-symbolic"
    return "audio-volume-low-symbolic"
  }

  const getMicIcon = (muted: boolean) => {
    return muted ? "microphone-disabled-symbolic" : "audio-input-microphone-symbolic"
  }

  return (
    <PopupWindow name={POPUP_NAME} position="top-right">
      <box orientation={Gtk.Orientation.VERTICAL} spacing={12} cssClasses={["settings-menu"]}>
        {/* Audio Section */}
        <box orientation={Gtk.Orientation.VERTICAL} spacing={8} cssClasses={["settings-section"]}>
          <box cssClasses={["section-title"]} spacing={8}>
            <Gtk.Image iconName="audio-speakers-symbolic" pixelSize={16} />
            <label cssClasses={["section-title-label"]} label="Audio" />
          </box>

          {/* Speaker Volume */}
          <box cssClasses={["audio-slider-row"]} spacing={8}>
            <button cssClasses={["icon-button"]} onClicked={toggleMute}>
              <Gtk.Image
                iconName={volumeMuted.as((m) => getVolumeIcon(m, volume.peek()))}
                pixelSize={18}
              />
            </button>
            <box cssClasses={["slider-container"]} hexpand>
              <Gtk.Scale
                cssClasses={["settings-slider", "speaker-slider"]}
                orientation={Gtk.Orientation.HORIZONTAL}
                hexpand={true}
                drawValue={false}
                adjustment={
                  new Gtk.Adjustment({
                    lower: 0,
                    upper: 100,
                    step_increment: 5,
                    page_increment: 10,
                    value: volume.peek(),
                  })
                }
                onValueChanged={onVolumeChange}
                $={(scale: Gtk.Scale) => {
                  // Subscribe to volume changes and update the slider
                  volume.subscribe(() => {
                    const v = volume.peek()
                    if (Math.abs(scale.get_value() - v) > 1) {
                      scale.set_value(v)
                    }
                  })
                }}
              />
            </box>
            <label cssClasses={["settings-value"]} label={volume.as((v) => `${v}%`)} />
          </box>

          {/* Microphone Volume */}
          <box cssClasses={["audio-slider-row"]} spacing={8}>
            <button cssClasses={["icon-button"]} onClicked={toggleMicMute}>
              <Gtk.Image
                iconName={micMuted.as((m) => getMicIcon(m))}
                pixelSize={18}
              />
            </button>
            <box cssClasses={["slider-container"]} hexpand>
              <Gtk.Scale
                cssClasses={["settings-slider", "mic-slider"]}
                orientation={Gtk.Orientation.HORIZONTAL}
                hexpand={true}
                drawValue={false}
                adjustment={
                  new Gtk.Adjustment({
                    lower: 0,
                    upper: 100,
                    step_increment: 5,
                    page_increment: 10,
                    value: micVolume.peek(),
                  })
                }
                onValueChanged={onMicVolumeChange}
                $={(scale: Gtk.Scale) => {
                  // Subscribe to mic volume changes and update the slider
                  micVolume.subscribe(() => {
                    const v = micVolume.peek()
                    if (Math.abs(scale.get_value() - v) > 1) {
                      scale.set_value(v)
                    }
                  })
                }}
              />
            </box>
            <label cssClasses={["settings-value"]} label={micVolume.as((v) => `${v}%`)} />
          </box>

          {/* Sink Selector (Output) */}
          <DeviceSelector
            label="sink Selector"
            icon="audio-headphones-symbolic"
            endpoints={speakersAccessor}
          />

          {/* Source Selector (Input) */}
          <DeviceSelector
            label="source Selector"
            icon="audio-input-microphone-symbolic"
            endpoints={microphonesAccessor}
          />
        </box>

        <box cssClasses={["separator"]} />

        {/* Brightness Section */}
        <box orientation={Gtk.Orientation.VERTICAL} spacing={8} cssClasses={["settings-section"]}>
          <box cssClasses={["settings-header"]} spacing={8}>
            <Gtk.Image iconName="display-brightness-symbolic" pixelSize={20} />
            <label cssClasses={["settings-label"]} label="Brightness" hexpand halign={Gtk.Align.START} />
            <label cssClasses={["settings-value"]} label={brightnessValue.as((v) => `${v}%`)} />
          </box>
          <box cssClasses={["slider-container"]}>
            <Gtk.Scale
              cssClasses={["settings-slider"]}
              orientation={Gtk.Orientation.HORIZONTAL}
              hexpand={true}
              drawValue={false}
              adjustment={
                new Gtk.Adjustment({
                  lower: 5,
                  upper: 100,
                  step_increment: 5,
                  page_increment: 10,
                  value: brightnessValue.peek(),
                })
              }
              onValueChanged={onBrightnessChange}
              $={(scale: Gtk.Scale) => {
                // Subscribe to brightness changes and update the slider
                brightnessValue.subscribe(() => {
                  const v = brightnessValue.peek()
                  if (Math.abs(scale.get_value() - v) > 1) {
                    scale.set_value(v)
                  }
                })
              }}
            />
          </box>
        </box>
      </box>
    </PopupWindow>
  )
}