import app from "ags/gtk4/app"
import { Astal, Gtk, Gdk } from "ags/gtk4"
import { Workspaces } from "../workspaces"
import { LocalIP, RemoteIP } from "../network-info"
import { ArchLogo } from "../system-monitor"
import { SystemTray } from "../systemtray"
import { PowerButton } from "../powermenu"
import { Agenda } from "../quick-menu"
import { Battery } from "../power-control"
import { Wifi } from "../wifi"
import { Bluetooth } from "../bluetooth"
import { Audio, Appearance } from "../settings"

export function TopBar(gdkmonitor: Gdk.Monitor, index: string | number) {
  const { TOP, LEFT, RIGHT } = Astal.WindowAnchor

  return (
    <window
      visible
      name={`top-bar-${index}`}
      class="TopBar"
      gdkmonitor={gdkmonitor}
      exclusivity={Astal.Exclusivity.EXCLUSIVE}
      anchor={TOP | LEFT | RIGHT}
      application={app}
    >
      <centerbox cssName="centerbox">
        <box $type="start" halign={Gtk.Align.START} spacing={4}>
          <ArchLogo />
          <Workspaces />
        </box>
        <box $type="center" halign={Gtk.Align.CENTER} cssClasses={["bar-center-widget"]}>
          <Agenda />
        </box>
        <box $type="end" halign={Gtk.Align.END} spacing={4}>
          <SystemTray />
          <Wifi />
          <Bluetooth />
          <Audio />
          <Appearance />
          <Battery />
          <PowerButton />
        </box>
      </centerbox>
    </window>
  )
}

export function BottomBar(gdkmonitor: Gdk.Monitor, index: string | number) {
  const { BOTTOM, LEFT, RIGHT } = Astal.WindowAnchor

  return (
    <window
      visible
      name={`bottom-bar-${index}`}
      class="BottomBar"
      gdkmonitor={gdkmonitor}
      exclusivity={Astal.Exclusivity.EXCLUSIVE}
      anchor={BOTTOM | LEFT | RIGHT}
      application={app}
    >
      <centerbox cssName="centerbox">
        <box $type="start" halign={Gtk.Align.START} cssClasses={["empty-section"]} />
        <box $type="center" halign={Gtk.Align.CENTER} cssClasses={["empty-section"]} />
        <box $type="end" halign={Gtk.Align.END} spacing={4}>
          <LocalIP />
          <RemoteIP />
        </box>
      </centerbox>
    </window>
  )
}
