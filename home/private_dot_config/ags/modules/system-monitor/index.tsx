import { Gtk } from "ags/gtk4"
import { createState } from "ags"
import { createPoll } from "ags/time"
import { readFile } from "ags/file"
import { execAsync } from "ags/process"
import Gio from "gi://Gio"
import { PopupWindow, PopupButton } from "../popup"

type MemoryUsage = { percentage: number; total: number; used: number }
type DiskUsage = { percentage: number; total: number; used: number }
type CpuTime = { total: number; idle: number }
type GpuStats = { available: boolean; usage: number; memUsed: number; memTotal: number; temp: number }

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

const getCpuTemp = () => {
  try { return Math.round(parseInt(readFile("/sys/class/thermal/thermal_zone1/temp").trim()) / 1000) }
  catch { return 0 }
}

const getMemoryUsage = (): MemoryUsage => {
  const meminfo = readFile("/proc/meminfo")
  const getValue = (k: string) => { 
    const m = meminfo.match(new RegExp(`${k}:\\s+(\\d+)`))
    return m ? parseInt(m[1]) * 1024 : 0 
  }
  const total = getValue("MemTotal")
  const used = total - getValue("MemAvailable")
  return { percentage: total > 0 ? (used / total) * 100 : 0, total, used }
}

const getDiskUsage = (): DiskUsage => {
  try {
    const file = Gio.File.new_for_path("/")
    const info = file.query_filesystem_info("filesystem::size,filesystem::free", null)
    const total = info.get_attribute_uint64("filesystem::size")
    const free = info.get_attribute_uint64("filesystem::free")
    const used = total - free
    return { percentage: total > 0 ? (used / total) * 100 : 0, total, used }
  } catch { return { percentage: 0, total: 0, used: 0 } }
}

const formatBytes = (b: number) => b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1)} GB` : `${(b / 1024 ** 2).toFixed(0)} MB`
const formatMB = (mb: number) => mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`

const getGpuStats = async (): Promise<GpuStats> => {
  try {
    const res = await execAsync("nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu --format=csv,noheader,nounits")
    const [usage, memUsed, memTotal, temp] = res.trim().split(",").map(s => parseInt(s.trim()))
    return { available: true, usage, memUsed, memTotal, temp }
  } catch { return { available: false, usage: 0, memUsed: 0, memTotal: 0, temp: 0 } }
}

export function ArchLogo() {
  return (
    <PopupButton popupName="archlogo-popup" cssClasses={["arch-logo-widget"]}>
      <Gtk.Image file="/usr/share/pixmaps/archlinux-logo.svg" pixelSize={20} />
    </PopupButton>
  )
}

export function ArchLogoPopup() {
  const cpuPercent = createPoll(0, 2000, getCpuUsage)
  const cpuTemp = createPoll(0, 2000, getCpuTemp)
  const memPercent = createPoll(0, 2000, () => getMemoryUsage().percentage)
  const diskPercent = createPoll(0, 10000, () => getDiskUsage().percentage)
  
  const memInfo = createPoll({ used: "0", total: "0" }, 2000, () => {
    const m = getMemoryUsage()
    return { used: formatBytes(m.used), total: formatBytes(m.total) }
  })

  const diskInfo = createPoll({ used: "0", total: "0" }, 10000, () => {
    const d = getDiskUsage()
    return { used: formatBytes(d.used), total: formatBytes(d.total) }
  })

  const [gpuStats, setGpuStats] = createState<GpuStats>({
    available: false,
    usage: 0,
    memUsed: 0,
    memTotal: 0,
    temp: 0,
  })
  const [updateCount, setUpdateCount] = createState(0)

  const updateGpu = async () => setGpuStats(await getGpuStats())
  const checkUp = async () => {
    try {
      const r = await execAsync("checkupdates")
      setUpdateCount(r.trim().split("\n").filter(l => l.length > 0).length)
    } catch {
      setUpdateCount(0)
    }
  }

  updateGpu()
  checkUp()
  setInterval(updateGpu, 2000)
  setInterval(checkUp, 600000)

  return (
    <PopupWindow name="archlogo-popup" position="top-left" widthRequest={244}>
      <box orientation={Gtk.Orientation.VERTICAL} spacing={8} cssClasses={["system-stats-menu"]}>
        <label label="System Stats" cssClasses={["stats-header"]} />
        <box cssClasses={["separator"]} />

        <button
          cssClasses={updateCount.as(c => c > 0 ? ["stat-section", "stat-button", "has-updates"] : ["stat-section", "stat-button", "disabled"])}
          onClicked={async () => {
            if (updateCount.peek() > 0) {
              await execAsync(["kitty", "-e", "paru"])
              checkUp()
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
            <box cssClasses={["stat-bar-fill", "cpu-bar"]} css={cpuPercent.as(p => `min-width: ${Math.round(Math.max(2, p * 2))}px;`)} />
          </box>
          <label label={cpuTemp.as(t => `${t}°C`)} cssClasses={["stat-detail"]} halign={Gtk.Align.END} />
        </box>

        <box orientation={Gtk.Orientation.VERTICAL} spacing={8} visible={gpuStats.as(g => g.available)}>
          <box cssClasses={["separator"]} />
          <box orientation={Gtk.Orientation.VERTICAL} spacing={4} cssClasses={["stat-section"]}>
            <box spacing={8}>
              <Gtk.Image iconName="video-display-symbolic" cssClasses={["stat-icon"]} pixelSize={16} />
              <label label="GPU" cssClasses={["stat-label"]} hexpand halign={Gtk.Align.START} />
              <label label={gpuStats.as(g => `${g.usage}%`)} cssClasses={["stat-value"]} />
            </box>
            <box cssClasses={["stat-bar-bg"]}>
              <box cssClasses={["stat-bar-fill", "gpu-bar"]} css={gpuStats.as(g => `min-width: ${Math.round(Math.max(2, g.usage * 2))}px;`)} />
            </box>
            <label label={gpuStats.as(g => `${formatMB(g.memUsed)} / ${formatMB(g.memTotal)} • ${g.temp}°C`)} cssClasses={["stat-detail"]} halign={Gtk.Align.END} />
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
            <box cssClasses={["stat-bar-fill", "ram-bar"]} css={memPercent.as(p => `min-width: ${Math.round(Math.max(2, p * 2))}px;`)} />
          </box>
          <label label={memInfo.as(m => `${m.used} / ${m.total}`)} cssClasses={["stat-detail"]} halign={Gtk.Align.END} />
        </box>

        <box cssClasses={["separator"]} />

        <box orientation={Gtk.Orientation.VERTICAL} spacing={4} cssClasses={["stat-section"]}>
          <box spacing={8}>
            <Gtk.Image iconName="drive-harddisk-symbolic" cssClasses={["stat-icon"]} pixelSize={16} />
            <label label="Disk" cssClasses={["stat-label"]} hexpand halign={Gtk.Align.START} />
            <label label={diskPercent.as(p => `${p.toFixed(0)}%`)} cssClasses={["stat-value"]} />
          </box>
          <box cssClasses={["stat-bar-bg"]}>
            <box cssClasses={["stat-bar-fill", "disk-bar"]} css={diskPercent.as(p => `min-width: ${Math.round(Math.max(2, p * 2))}px;`)} />
          </box>
          <label label={diskInfo.as(d => `${d.used} / ${d.total}`)} cssClasses={["stat-detail"]} halign={Gtk.Align.END} />
        </box>

      </box>
    </PopupWindow>
  )
}