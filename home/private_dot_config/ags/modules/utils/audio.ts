import Wp from "gi://AstalWp"

let isAudioReady = false
const audioReadyCallbacks: Set<() => void> = new Set()

const wp = Wp.get_default()

if (wp) {
  if (wp.audio?.defaultSpeaker) {
    isAudioReady = true
  }
  wp.connect("ready", () => {
    isAudioReady = true
    audioReadyCallbacks.forEach((cb) => cb())
    audioReadyCallbacks.clear()
  })
}

export function checkAudioReady(): boolean {
  return isAudioReady
}

export function onAudioReady(callback: () => void): void {
  if (isAudioReady) {
    callback()
  } else {
    audioReadyCallbacks.add(callback)
  }
}

export function removeAudioReadyCallback(callback: () => void): void {
  audioReadyCallbacks.delete(callback)
}

export function executeWhenAudioReady(callback: () => void): () => void {
  onAudioReady(callback)
  return () => removeAudioReadyCallback(callback)
}
