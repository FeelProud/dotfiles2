import { Gtk } from "ags/gtk4"
import { Accessor, For } from "ags"
import { execAsync, subprocess } from "ags/process"
import { PopupWindow, PopupButton } from "../popup"
import Wp from "gi://AstalWp"

const POPUP_NAME = "settings-popup"

// Audio setup with proper async initialization
const wp = Wp.get_default()
const audio = wp?.audio

// Track ready state for async initialization
let isAudioReady = false
const audioReadyCallbacks: Set<() => void> = new Set()

if (wp) {
  if (wp.audio?.defaultSpeaker) {
    // Already initialized
    isAudioReady = true
  }
  wp.connect("ready", () => {
    isAudioReady = true
    audioReadyCallbacks.forEach((cb) => cb())
    audioReadyCallbacks.clear()
  })
}

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

// Create reactive accessor for speakers list with ready state and lifecycle signals
const speakersAccessor = audio
  ? new Accessor(
      () => (isAudioReady ? audio.speakers || [] : []),
      (callback) => {
        const addedId = audio.connect("speaker-added", callback)
        const removedId = audio.connect("speaker-removed", callback)

        // Trigger callback when audio becomes ready
        if (!isAudioReady) {
          audioReadyCallbacks.add(callback)
        }

        return () => {
          audio.disconnect(addedId)
          audio.disconnect(removedId)
          audioReadyCallbacks.delete(callback)
        }
      }
    )
  : new Accessor(() => [] as Wp.Endpoint[], () => () => {})

// Create reactive accessor for microphones list with ready state and lifecycle signals
const microphonesAccessor = audio
  ? new Accessor(
      () => (isAudioReady ? audio.microphones || [] : []),
      (callback) => {
        const addedId = audio.connect("microphone-added", callback)
        const removedId = audio.connect("microphone-removed", callback)

        // Trigger callback when audio becomes ready
        if (!isAudioReady) {
          audioReadyCallbacks.add(callback)
        }

        return () => {
          audio.disconnect(addedId)
          audio.disconnect(removedId)
          audioReadyCallbacks.delete(callback)
        }
      }
    )
  : new Accessor(() => [] as Wp.Endpoint[], () => () => {})

export function Settings() {
  return (
    <PopupButton popupName={POPUP_NAME} cssClasses={["settings-widget"]}>
      <box spacing={4}>
        <label label="settings" cssClasses={["bar-icon"]} />
      </box>
    </PopupButton>
  )
}

// Single device item component
function DeviceItem({
  endpoint,
  icon,
  type,
}: {
  endpoint: Wp.Endpoint
  icon: string
  type: "speaker" | "microphone"
}) {
  // Use the endpoint's own isDefault property directly
  const checkIsDefault = () => endpoint.isDefault

  return (
    <button
      cssClasses={["selector-item"]}
      onClicked={() => (endpoint.isDefault = true)}
      $={(btn: Gtk.Button) => {
        const update = () => {
          if (checkIsDefault()) {
            btn.add_css_class("selected")
          } else {
            btn.remove_css_class("selected")
          }
        }

        // Initial update
        update()

        // Listen to this endpoint's is-default property
        const endpointId = endpoint.connect("notify::is-default", update)

        // Also listen to global default changes
        const globalSignal = type === "speaker" ? "notify::default-speaker" : "notify::default-microphone"
        const globalId = audio?.connect(globalSignal, update)

        btn.connect("destroy", () => {
          endpoint.disconnect(endpointId)
          if (globalId && audio) audio.disconnect(globalId)
        })
      }}
    >
      <box spacing={6}>
        <Gtk.Image iconName={icon} pixelSize={12} />
        <label
          label={endpoint.description || endpoint.name || "Unknown"}
          hexpand
          halign={Gtk.Align.START}
          ellipsize={3}
        />
        <Gtk.Image
          iconName="object-select-symbolic"
          pixelSize={12}
          $={(img: Gtk.Image) => {
            const update = () => {
              img.visible = checkIsDefault()
            }
            update()

            const endpointId = endpoint.connect("notify::is-default", update)
            const globalSignal = type === "speaker" ? "notify::default-speaker" : "notify::default-microphone"
            const globalId = audio?.connect(globalSignal, update)

            img.connect("destroy", () => {
              endpoint.disconnect(endpointId)
              if (globalId && audio) audio.disconnect(globalId)
            })
          }}
        />
      </box>
    </button>
  )
}

// Device selector component
function DeviceSelector({
  label,
  icon,
  endpoints,
  type,
}: {
  label: string
  icon: string
  endpoints: Accessor<Wp.Endpoint[]>
  type: "speaker" | "microphone"
}) {
  return (
    <box orientation={Gtk.Orientation.VERTICAL} spacing={2} cssClasses={["device-selector"]}>
      <box cssClasses={["selector-header"]} spacing={6}>
        <Gtk.Image iconName={icon} pixelSize={14} />
        <label cssClasses={["selector-label"]} label={label} />
      </box>
      <box orientation={Gtk.Orientation.VERTICAL} spacing={1} cssClasses={["selector-list"]}>
        <For each={endpoints}>
          {(endpoint) => <DeviceItem endpoint={endpoint} icon={icon} type={type} />}
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

          // Handle async initialization
          if (isAudioReady) {
            updateVolumeListener()
          } else {
            audioReadyCallbacks.add(() => {
              updateVolumeListener()
              callback()
            })
          }

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

          // Handle async initialization
          if (isAudioReady) {
            updateMuteListener()
          } else {
            audioReadyCallbacks.add(() => {
              updateMuteListener()
              callback()
            })
          }

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

          // Handle async initialization
          if (isAudioReady) {
            updateVolumeListener()
          } else {
            audioReadyCallbacks.add(() => {
              updateVolumeListener()
              callback()
            })
          }

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

          // Handle async initialization
          if (isAudioReady) {
            updateMuteListener()
          } else {
            audioReadyCallbacks.add(() => {
              updateMuteListener()
              callback()
            })
          }

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
      <box orientation={Gtk.Orientation.VERTICAL} spacing={6} cssClasses={["settings-menu"]}>
        {/* Audio Section */}
        <box orientation={Gtk.Orientation.VERTICAL} spacing={4} cssClasses={["settings-section"]}>
          <box cssClasses={["section-title"]} spacing={6}>
            <Gtk.Image iconName="audio-speakers-symbolic" pixelSize={14} />
            <label cssClasses={["section-title-label"]} label="Audio" />
          </box>

          {/* Speaker Volume */}
          <box cssClasses={["audio-slider-row"]} spacing={6}>
            <button cssClasses={["icon-button"]} onClicked={toggleMute}>
              <Gtk.Image
                iconName={volumeMuted.as((m) => getVolumeIcon(m, volume.peek()))}
                pixelSize={16}
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
          <box cssClasses={["audio-slider-row"]} spacing={6}>
            <button cssClasses={["icon-button"]} onClicked={toggleMicMute}>
              <Gtk.Image
                iconName={micMuted.as((m) => getMicIcon(m))}
                pixelSize={16}
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
            label="Output Device"
            icon="audio-speakers-symbolic"
            endpoints={speakersAccessor}
            type="speaker"
          />

          {/* Source Selector (Input) */}
          <DeviceSelector
            label="Input Device"
            icon="audio-input-microphone-symbolic"
            endpoints={microphonesAccessor}
            type="microphone"
          />
        </box>

        <box cssClasses={["separator"]} />

        {/* Brightness Section */}
        <box orientation={Gtk.Orientation.VERTICAL} spacing={4} cssClasses={["settings-section"]}>
          <box cssClasses={["settings-header"]} spacing={6}>
            <Gtk.Image iconName="display-brightness-symbolic" pixelSize={16} />
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