import { Accessor } from "ags"
import Hyprland from "gi://AstalHyprland"
import AstalRiver from "gi://AstalRiver"
import Gdk from "gi://Gdk"

const detectWindowManager = (): "hyprland" | "river" | null => {
  try {
    const hypr = Hyprland.get_default()
    if (hypr) return "hyprland"
  } catch {}

  try {
    const river = AstalRiver.River.get_default()
    if (river) return "river"
  } catch {}

  return null
}

const WM = detectWindowManager()

function isWsOccupiedOrFocused(
  wsId: number,
  workspaces: Hyprland.Workspace[],
  focusedWs: Hyprland.Workspace | null
): boolean {
  const ws = workspaces.find((w) => w.id === wsId)
  const isOccupied = ws !== undefined && ws.get_clients().length > 0
  const isFocused = focusedWs?.id === wsId
  return isOccupied || isFocused
}

function getWrapperClasses(wsId: number, hypr: Hyprland.Hyprland): string[] {
  const workspaces = hypr.get_workspaces()
  const focusedWs = hypr.get_focused_workspace()
  const classes = ["ws-wrapper"]

  const isActive = isWsOccupiedOrFocused(wsId, workspaces, focusedWs)

  if (isActive) {
    classes.push("occupied")
    const prevActive = isWsOccupiedOrFocused(wsId - 1, workspaces, focusedWs)
    const nextActive = isWsOccupiedOrFocused(wsId + 1, workspaces, focusedWs)
    if (!prevActive) classes.push("group-start")
    if (!nextActive) classes.push("group-end")
  }

  return classes
}

function getButtonClasses(wsId: number, hypr: Hyprland.Hyprland): string[] {
  const focusedWs = hypr.get_focused_workspace()
  const classes = ["ws-button"]
  if (focusedWs?.id === wsId) classes.push("focused")
  return classes
}

function HyprlandWorkspaceButton({ wsId, hypr }: { wsId: number; hypr: Hyprland.Hyprland }) {
  const wrapperClasses = new Accessor(
    () => getWrapperClasses(wsId, hypr),
    (callback) => {
      const ids = [
        hypr.connect("notify::workspaces", callback),
        hypr.connect("notify::focused-workspace", callback),
        hypr.connect("client-added", callback),
        hypr.connect("client-removed", callback),
        hypr.connect("client-moved", callback),
      ]
      return () => ids.forEach((id) => hypr.disconnect(id))
    }
  )

  const buttonClasses = new Accessor(
    () => getButtonClasses(wsId, hypr),
    (callback) => {
      const id = hypr.connect("notify::focused-workspace", callback)
      return () => hypr.disconnect(id)
    }
  )

  return (
    <box cssClasses={wrapperClasses.as((c) => c)}>
      <button
        cssClasses={buttonClasses.as((c) => c)}
        onClicked={() => hypr.dispatch("workspace", wsId.toString())}
      >
        <label cssClasses={["ws-button-label"]} label={wsId.toString()} />
      </button>
    </box>
  )
}

function getRiverOutput(): AstalRiver.Output | null {
  const display = Gdk.Display.get_default()
  if (!display) return null
  const monitors = display.get_monitors()
  if (!monitors || monitors.get_n_items() === 0) return null
  const monitor = monitors.get_item(0) as Gdk.Monitor
  if (!monitor) return null
  const monitorName = monitor.get_model()
  if (!monitorName) return null
  const river = AstalRiver.River.get_default()
  if (!river) return null
  return river.get_output(monitorName)
}

function RiverWorkspaceButton({ i, output }: { i: number; output: AstalRiver.Output | null }) {
  const tag = 1 << (i - 1)

  const handleClick = () => {
    if (output) {
      output.focused_tags = tag
    }
  }

  return (
    <button
      cssClasses={["ws-button"]}
      onClicked={handleClick}
    >
      <label label={i.toString()} cssClasses={["ws-button-label"]} />
    </button>
  )
}

export function Workspaces() {
  if (WM === "hyprland") {
    const hypr = Hyprland.get_default()
    const workspaceIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

    return (
      <box cssClasses={["ws-container"]}>
        {workspaceIds.map((wsId) => (
          <HyprlandWorkspaceButton wsId={wsId} hypr={hypr} />
        ))}
      </box>
    )
  }

  if (WM === "river") {
    const output = getRiverOutput()
    const workspaceIds = [1, 2, 3, 4, 5, 6, 7, 8, 9]

    return (
      <box cssClasses={["ws-container"]}>
        {workspaceIds.map((i) => (
          <RiverWorkspaceButton i={i} output={output} />
        ))}
      </box>
    )
  }

  return (
    <box cssClasses={["ws-container"]}>
      <label label="No WM detected" />
    </box>
  )
}
