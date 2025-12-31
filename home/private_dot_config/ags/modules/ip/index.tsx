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
    // Get IP addresses with interface names using ip command
    const response = await execAsync("ip -4 addr show")
    const lines = response.split("\n")

    let currentInterface = ""
    for (const line of lines) {
      // Match interface name (e.g., "2: enp0s31f6:" or "3: wlan0:")
      const ifaceMatch = line.match(/^\d+:\s+(\w+):/)
      if (ifaceMatch) {
        currentInterface = ifaceMatch[1]
      }

      // Match IP address with mask (e.g., "inet 192.168.1.100/24")
      const ipMatch = line.match(/inet\s+(\d+\.\d+\.\d+\.\d+\/\d+)/)
      if (ipMatch && currentInterface) {
        const ipWithMask = ipMatch[1]
        // Skip loopback
        if (currentInterface === "lo") continue

        // Ethernet interfaces typically start with 'e' (eth0, enp0s31f6, etc.)
        if (currentInterface.startsWith("e") && result.ethernet === "N/A") {
          result.ethernet = ipWithMask
        }
        // WiFi interfaces typically start with 'w' (wlan0, wlp2s0, etc.)
        else if (currentInterface.startsWith("w") && result.wifi === "N/A") {
          result.wifi = ipWithMask
        }
      }
    }
  } catch {
    // Keep N/A values on error
  }

  return result
}

export function LocalIP() {
  const networkIPs = createPoll<NetworkIPs>({ ethernet: "N/A", wifi: "N/A" }, 30000, getNetworkIPs)

  return (
    <box spacing={8}>
      {/* Ethernet IP */}
      <button cssClasses={["ip-widget"]}>
        <box spacing={4} valign={Gtk.Align.CENTER}>
          <label label="settings_ethernet" cssClasses={["bar-icon"]} valign={Gtk.Align.CENTER} />
          <label label={networkIPs.as(ips => ips.ethernet)} valign={Gtk.Align.CENTER} />
        </box>
      </button>

      {/* WiFi IP */}
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
