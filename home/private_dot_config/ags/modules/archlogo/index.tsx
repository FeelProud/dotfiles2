import { Gtk } from "ags/gtk4"
import { createPoll } from "ags/time"
import { readFile } from "ags/file"
import { execAsync } from "ags/process"
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
  const cpuPercent = createPoll(0, 2000, getCpuUsage)
  const memPercent = createPoll(0, 2000, () => getMemoryUsage().percentage)
  const diskPercent = createPoll(0, 10000, () => getDiskUsage().percentage)

  const memInfo = createPoll({ used: "0", total: "0" }, 2000, () => {
    const mem = getMemoryUsage()
    return {
      used: formatBytes(mem.used),
      total: formatBytes(mem.total),
    }
  })

  const diskInfo = createPoll({ used: "0", total: "0" }, 10000, () => {
    const disk = getDiskUsage()
    return {
      used: formatBytes(disk.used),
      total: formatBytes(disk.total),
    }
  })

  const updateCount = createPoll(0, 600000, async () => {
    try {
      const result = await execAsync("checkupdates")
      const lines = result.trim().split("\n").filter((line) => line.length > 0)
      return lines.length
    } catch {
      return 0
    }
  })

  return (
    <PopupWindow name={POPUP_NAME} position="top-left">
      <box orientation={Gtk.Orientation.VERTICAL} spacing={8} cssClasses={["system-stats-menu"]}>
        <label label="System Stats" cssClasses={["stats-header"]} />

        <box cssClasses={["separator"]} />

        <button
          cssClasses={updateCount.as(c => c > 0 ? ["stat-section", "stat-button"] : ["stat-section", "stat-button", "disabled"])}
          onClicked={() => {
            if (updateCount.peek() > 0) {
              execAsync(["kitty", "-e", "paru"])
            }
          }}
          sensitive={updateCount.as(c => c > 0)}
        >
          <box spacing={8}>
            <Gtk.Image iconName="software-update-available-symbolic" cssClasses={["stat-icon"]} pixelSize={16} />
            <label label="Updates" cssClasses={["stat-label"]} hexpand halign={Gtk.Align.START} />
            <label label={updateCount.as(c => c > 0 ? `${c} available` : "Up to date")} cssClasses={["stat-value"]} />
          </box>
        </button>

        <box cssClasses={["separator"]} />

        <box orientation={Gtk.Orientation.VERTICAL} spacing={4} cssClasses={["stat-section"]}>
          <box spacing={8}>
            <Gtk.Image iconName="preferences-system-symbolic" cssClasses={["stat-icon"]} pixelSize={16} />
            <label label="CPU" cssClasses={["stat-label"]} hexpand halign={Gtk.Align.START} />
            <label label={cpuPercent.as(p => `${p.toFixed(0)}%`)} cssClasses={["stat-value"]} />
          </box>
          <box cssClasses={["stat-bar-bg"]}>
            <box
              cssClasses={["stat-bar-fill", "cpu-bar"]}
              css={cpuPercent.as(p => `min-width: ${Math.round(Math.max(2, p * 2))}px;`)}
            />
          </box>
        </box>

        <box cssClasses={["separator"]} />

        <box orientation={Gtk.Orientation.VERTICAL} spacing={4} cssClasses={["stat-section"]}>
          <box spacing={8}>
            <Gtk.Image iconName="drive-harddisk-solidstate-symbolic" cssClasses={["stat-icon"]} pixelSize={16} />
            <label label="RAM" cssClasses={["stat-label"]} hexpand halign={Gtk.Align.START} />
            <label label={memPercent.as(p => `${p.toFixed(0)}%`)} cssClasses={["stat-value"]} />
          </box>
          <box cssClasses={["stat-bar-bg"]}>
            <box
              cssClasses={["stat-bar-fill", "ram-bar"]}
              css={memPercent.as(p => `min-width: ${Math.round(Math.max(2, p * 2))}px;`)}
            />
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
            <label label={diskPercent.as(p => `${p.toFixed(0)}%`)} cssClasses={["stat-value"]} />
          </box>
          <box cssClasses={["stat-bar-bg"]}>
            <box
              cssClasses={["stat-bar-fill", "disk-bar"]}
              css={diskPercent.as(p => `min-width: ${Math.round(Math.max(2, p * 2))}px;`)}
            />
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
