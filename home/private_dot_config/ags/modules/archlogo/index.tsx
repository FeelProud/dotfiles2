import { Gtk } from "ags/gtk4"
import { createPoll } from "ags/time"
import { readFile } from "ags/file"
import Gio from "gi://Gio"
import { PopupWindow, PopupButton } from "../popup"

type MemoryUsage = { percentage: number; total: number; used: number }
type DiskUsage = { percentage: number; total: number; used: number }
type CpuTime = { total: number; idle: number }

const POPUP_NAME = "archlogo-popup"

let lastCpuStats: CpuTime = { total: 1, idle: 0 }

const getCpuUsage = (): number => {
  const stat = readFile("/proc/stat")
  const cpuLine = stat.slice(0, stat.indexOf("\n"))
  const times = cpuLine.replace(/cpu\s+/, "").split(/\s+/).map(Number)
  const idle = times[3] + times[4]
  const total = times.reduce((a, b) => a + b, 0)

  const dtotal = total - lastCpuStats.total
  const didle = idle - lastCpuStats.idle
  lastCpuStats = { total, idle }

  return dtotal > 0 ? ((dtotal - didle) / dtotal) * 100 : 0
}

const getMemoryUsage = (): MemoryUsage => {
  const meminfo = readFile("/proc/meminfo")
  const getValue = (key: string): number => {
    const match = meminfo.match(new RegExp(`${key}:\\s+(\\d+)`))
    return match ? parseInt(match[1]) * 1024 : 0
  }

  const total = getValue("MemTotal")
  const available = getValue("MemAvailable")
  const used = total - available
  const percentage = total > 0 ? (used / total) * 100 : 0

  return { percentage, total, used }
}

const getDiskUsage = (): DiskUsage => {
  try {
    const file = Gio.File.new_for_path("/")
    const info = file.query_filesystem_info("filesystem::size,filesystem::free", null)
    const total = info.get_attribute_uint64("filesystem::size")
    const free = info.get_attribute_uint64("filesystem::free")
    const used = total - free
    const percentage = total > 0 ? (used / total) * 100 : 0
    return { percentage, total, used }
  } catch {
    return { percentage: 0, total: 0, used: 0 }
  }
}

const formatBytes = (bytes: number): string => {
  const gb = bytes / (1024 * 1024 * 1024)
  if (gb >= 1) return `${gb.toFixed(1)} GB`
  const mb = bytes / (1024 * 1024)
  return `${mb.toFixed(0)} MB`
}

export function ArchLogo() {
  return (
    <PopupButton popupName={POPUP_NAME} cssClasses={["arch-logo-widget"]}>
      <Gtk.Image file="/usr/share/pixmaps/archlinux-logo.svg" pixelSize={20} />
    </PopupButton>
  )
}

export function ArchLogoPopup() {
  const cpuUsage = createPoll("0%", 2000, () => `${getCpuUsage().toFixed(0)}%`)

  const memInfo = createPoll({ used: "0", total: "0", percent: "0%" }, 2000, () => {
    const mem = getMemoryUsage()
    return {
      used: formatBytes(mem.used),
      total: formatBytes(mem.total),
      percent: `${mem.percentage.toFixed(0)}%`
    }
  })

  const diskInfo = createPoll({ used: "0", total: "0", percent: "0%" }, 10000, () => {
    const disk = getDiskUsage()
    return {
      used: formatBytes(disk.used),
      total: formatBytes(disk.total),
      percent: `${disk.percentage.toFixed(0)}%`
    }
  })

  return (
    <PopupWindow name={POPUP_NAME} position="top-left">
      <box orientation={Gtk.Orientation.VERTICAL} spacing={8} cssClasses={["system-stats-menu"]}>
        <label label="System Stats" cssClasses={["stats-header"]} />

        <box cssClasses={["separator"]} />

        <box orientation={Gtk.Orientation.VERTICAL} spacing={4} cssClasses={["stat-section"]}>
          <box spacing={8}>
            <Gtk.Image iconName="preferences-system-symbolic" cssClasses={["stat-icon"]} pixelSize={16} />
            <label label="CPU" cssClasses={["stat-label"]} hexpand halign={Gtk.Align.START} />
            <label label={cpuUsage} cssClasses={["stat-value"]} />
          </box>
          <box cssClasses={["stat-detail-spacer"]} />
        </box>

        <box cssClasses={["separator"]} />

        <box orientation={Gtk.Orientation.VERTICAL} spacing={4} cssClasses={["stat-section"]}>
          <box spacing={8}>
            <Gtk.Image iconName="drive-harddisk-solidstate-symbolic" cssClasses={["stat-icon"]} pixelSize={16} />
            <label label="RAM" cssClasses={["stat-label"]} hexpand halign={Gtk.Align.START} />
            <label label={memInfo.as(m => m.percent)} cssClasses={["stat-value"]} />
          </box>
          <label
            label={memInfo.as(m => `${m.used} / ${m.total}`)}
            cssClasses={["stat-detail"]}
            halign={Gtk.Align.END}
          />
        </box>

        <box cssClasses={["separator"]} />

        <box orientation={Gtk.Orientation.VERTICAL} spacing={4} cssClasses={["stat-section"]}>
          <box spacing={8}>
            <Gtk.Image iconName="drive-harddisk-symbolic" cssClasses={["stat-icon"]} pixelSize={16} />
            <label label="Disk" cssClasses={["stat-label"]} hexpand halign={Gtk.Align.START} />
            <label label={diskInfo.as(d => d.percent)} cssClasses={["stat-value"]} />
          </box>
          <label
            label={diskInfo.as(d => `${d.used} / ${d.total}`)}
            cssClasses={["stat-detail"]}
            halign={Gtk.Align.END}
          />
        </box>
      </box>
    </PopupWindow>
  )
}
