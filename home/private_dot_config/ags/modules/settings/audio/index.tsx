import { Gtk } from "ags/gtk4"
import { Accessor, For } from "ags"
import Wp from "gi://AstalWp"
import { PopupWindow, PopupButton } from "../../popup"
import { checkAudioReady, onAudioReady, removeAudioReadyCallback } from "../../utils/audio"

const AUDIO_POPUP_NAME = "audio-popup"

const wp = Wp.get_default()
const audio = wp?.audio

const speakersAccessor = audio
  ? new Accessor(
      () => (checkAudioReady() ? audio.speakers || [] : []),
      (callback) => {
        const addedId = audio.connect("speaker-added", callback)
        const removedId = audio.connect("speaker-removed", callback)

        if (!checkAudioReady()) {
          onAudioReady(callback)
        }

        return () => {
          audio.disconnect(addedId)
          audio.disconnect(removedId)
          removeAudioReadyCallback(callback)
        }
      }
    )
  : new Accessor(() => [] as Wp.Endpoint[], () => () => {})

const microphonesAccessor = audio
  ? new Accessor(
      () => (checkAudioReady() ? audio.microphones || [] : []),
      (callback) => {
        const addedId = audio.connect("microphone-added", callback)
        const removedId = audio.connect("microphone-removed", callback)

        if (!checkAudioReady()) {
          onAudioReady(callback)
        }

        return () => {
          audio.disconnect(addedId)
          audio.disconnect(removedId)
          removeAudioReadyCallback(callback)
        }
      }
    )
  : new Accessor(() => [] as Wp.Endpoint[], () => () => {})

function DeviceItem({
  endpoint,
  icon,
  type,
}: {
  endpoint: Wp.Endpoint
  icon: string
  type: "speaker" | "microphone"
}) {
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

        update()

        const endpointId = endpoint.connect("notify::is-default", update)

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

export function Audio() {
  return (
    <PopupButton popupName={AUDIO_POPUP_NAME} cssClasses={["audio-widget"]}>
      <box spacing={4}>
        <label label="volume_up" cssClasses={["bar-icon"]} />
      </box>
    </PopupButton>
  )
}

export function AudioPopup() {
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

          if (checkAudioReady()) {
            updateVolumeListener()
          } else {
            onAudioReady(() => {
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

          if (checkAudioReady()) {
            updateMuteListener()
          } else {
            onAudioReady(() => {
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

          if (checkAudioReady()) {
            updateVolumeListener()
          } else {
            onAudioReady(() => {
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

          if (checkAudioReady()) {
            updateMuteListener()
          } else {
            onAudioReady(() => {
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
    <PopupWindow name={AUDIO_POPUP_NAME} position="top-right">
      <box orientation={Gtk.Orientation.VERTICAL} spacing={6} cssClasses={["settings-menu"]}>
        <box orientation={Gtk.Orientation.VERTICAL} spacing={4} cssClasses={["settings-section"]}>
          <box cssClasses={["section-title"]} spacing={6}>
            <Gtk.Image iconName="audio-speakers-symbolic" pixelSize={14} />
            <label cssClasses={["section-title-label"]} label="Audio" />
          </box>

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

          <DeviceSelector
            label="Output Device"
            icon="audio-speakers-symbolic"
            endpoints={speakersAccessor}
            type="speaker"
          />

          <DeviceSelector
            label="Input Device"
            icon="audio-input-microphone-symbolic"
            endpoints={microphonesAccessor}
            type="microphone"
          />
        </box>
      </box>
    </PopupWindow>
  )
}
