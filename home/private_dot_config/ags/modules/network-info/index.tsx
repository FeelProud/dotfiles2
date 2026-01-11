import { Gtk } from "ags/gtk4"
import { execAsync } from "ags/process"
import { createPoll } from "ags/time"

interface NetworkIPs {
  ethernet: string
  wifi: string
}

async function getNetworkIPs(): Promise<NetworkIPs> {
  const result: NetworkIPs = { ethernet: "N/A", wifi: "N/A" }

  try {
    const response = await execAsync("ip -4 addr show")
    const lines = response.split("\n")

    let currentInterface = ""
    for (const line of lines) {
      const ifaceMatch = line.match(/^\d+:\s+(\w+):/)
      if (ifaceMatch) {
        currentInterface = ifaceMatch[1]
      }

      const ipMatch = line.match(/inet\s+(\d+\.\d+\.\d+\.\d+\/\d+)/)
      if (ipMatch && currentInterface) {
        const ipWithMask = ipMatch[1]
        if (currentInterface === "lo") continue

        if (currentInterface.startsWith("e") && result.ethernet === "N/A") {
          result.ethernet = ipWithMask
        } else if (currentInterface.startsWith("w") && result.wifi === "N/A") {
          result.wifi = ipWithMask
        }
      }
    }
  } catch {}

  return result
}

export function LocalIP() {
  const networkIPs = createPoll<NetworkIPs>({ ethernet: "N/A", wifi: "N/A" }, 30000, getNetworkIPs)

  return (
    <box spacing={8}>
      <button cssClasses={["ip-widget"]}>
        <box spacing={4} valign={Gtk.Align.CENTER}>
          <label label="settings_ethernet" cssClasses={["bar-icon"]} valign={Gtk.Align.CENTER} />
          <label label={networkIPs.as(ips => ips.ethernet)} valign={Gtk.Align.CENTER} />
        </box>
      </button>

      <button cssClasses={["ip-widget"]}>
        <box spacing={4} valign={Gtk.Align.CENTER}>
          <label label="wifi" cssClasses={["bar-icon"]} valign={Gtk.Align.CENTER} />
          <label label={networkIPs.as(ips => ips.wifi)} valign={Gtk.Align.CENTER} />
        </box>
      </button>
    </box>
  )
}

export function RemoteIP() {
  const remoteIp = createPoll("...", 60000, async () => {
    try {
      const response = await execAsync("curl -s https://api.ipify.org")
      return response.trim() || "N/A"
    } catch (error) {
      return "N/A"
    }
  })

  return (
    <button cssClasses={["ip-widget"]}>
      <box spacing={4} valign={Gtk.Align.CENTER}>
        <label label="public" cssClasses={["bar-icon"]} valign={Gtk.Align.CENTER} />
        <label label={remoteIp} valign={Gtk.Align.CENTER} />
      </box>
    </button>
  )
}
