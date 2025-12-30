import { Gtk } from "ags/gtk4"
import { Accessor, For, createState } from "ags"
import { execAsync } from "ags/process"
import AstalNetwork from "gi://AstalNetwork?version=0.1"
import { PopupWindow, PopupButton, getPopupState } from "../popup"

const POPUP_NAME = "network-popup"
const network = AstalNetwork.get_default()

// Validate BSSID format (MAC address: XX:XX:XX:XX:XX:XX)
// BSSIDs are inherently safe - only hex chars and colons
function isValidBssid(bssid: string): boolean {
  return /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(bssid)
}

// Global state for tracking which BSSID is currently connecting
const [connectingBssid, setConnectingBssid] = createState<string | null>(null)

// Global state for password dialog
const [passwordDialogAp, setPasswordDialogAp] = createState<{ bssid: string; ssid: string } | null>(null)
const [passwordError, setPasswordError] = createState<string | null>(null)

// Reset password dialog when popup closes
const [popupVisible] = getPopupState(POPUP_NAME)
popupVisible.subscribe(() => {
  if (!popupVisible.peek()) {
    setPasswordDialogAp(null)
    setPasswordError(null)
  }
})

export function Wifi() {
  const wifi = network.wifi
  const wired = network.wired

  const networkIcon = new Accessor(
    () => {
      // Check wired first - only show ethernet icon if actually connected
      const wiredState = wired?.state
      if (wiredState === AstalNetwork.DeviceState.ACTIVATED) {
        return "settings_ethernet"
      }
      // Then check wifi
      if (!wifi?.enabled) return "wifi_off"
      if (wifi?.internet === AstalNetwork.Internet.CONNECTED) {
        const strength = wifi?.strength || 0
        if (strength >= 80) return "signal_wifi_4_bar"
        if (strength >= 60) return "network_wifi_3_bar"
        if (strength >= 40) return "network_wifi_2_bar"
        if (strength >= 20) return "network_wifi_1_bar"
        return "signal_wifi_0_bar"
      }
      return "signal_wifi_0_bar"
    },
    (callback) => {
      const ids: number[] = []
      if (wifi) {
        ids.push(wifi.connect("notify::strength", callback))
        ids.push(wifi.connect("notify::enabled", callback))
        ids.push(wifi.connect("notify::internet", callback))
      }
      if (wired) {
        ids.push(wired.connect("notify::state", callback))
      }
      return () => {
        ids.forEach((id, i) => {
          if (i < 3) wifi?.disconnect(id)
          else wired?.disconnect(id)
        })
      }
    }
  )

  return (
    <PopupButton popupName={POPUP_NAME} cssClasses={["network-widget"]}>
      <box spacing={4}>
        <label label={networkIcon.as(i => i)} cssClasses={["bar-icon"]} />
      </box>
    </PopupButton>
  )
}

function openPasswordDialog(bssid: string, ssid: string) {
  setPasswordError(null)
  setPasswordDialogAp({ bssid, ssid })
}

function closePasswordDialog() {
  setPasswordDialogAp(null)
  setPasswordError(null)
}

async function connectWithPassword(bssid: string, ssid: string, password: string): Promise<{ success: boolean; error?: string }> {
  if (!isValidBssid(bssid)) {
    return { success: false, error: "Invalid network" }
  }

  try {
    // Connect using nmcli with BSSID (safe - only hex and colons)
    // If nmcli returns successfully, the connection was established
    await execAsync([
      "nmcli", "--wait", "30", "device", "wifi", "connect", bssid,
      "password", password
    ])

    // nmcli succeeded, connection is established
    return { success: true }

  } catch (err: unknown) {
    // Delete the failed connection
    await execAsync(["nmcli", "connection", "delete", "id", ssid]).catch(() => {})

    const errorMsg = err instanceof Error ? err.message : String(err)
    let friendlyError = errorMsg

    if (errorMsg.includes("Secrets were required") || errorMsg.includes("key-mgmt")) {
      friendlyError = "Wrong password"
    } else if (errorMsg.includes("No network with SSID")) {
      friendlyError = "Network not found"
    } else if (errorMsg.includes("Connection activation failed")) {
      friendlyError = "Connection failed"
    }

    return { success: false, error: friendlyError }
  }
}

async function hasSavedConnection(bssid: string): Promise<boolean> {
  if (!isValidBssid(bssid)) return false

  try {
    // Check if there's a saved connection for this BSSID
    const connections = await execAsync([
      "nmcli", "-t", "-f", "NAME,TYPE", "connection", "show"
    ])
    // Also check the BSSID in connection details
    const wifiConnections = connections.split("\n")
      .filter(line => line.includes("wireless"))
      .map(line => line.split(":")[0])

    for (const connName of wifiConnections) {
      try {
        const details = await execAsync([
          "nmcli", "-t", "-f", "802-11-wireless.seen-bssids", "connection", "show", connName
        ])
        if (details.toLowerCase().includes(bssid.toLowerCase())) {
          return true
        }
      } catch {
        continue
      }
    }
    return false
  } catch {
    return false
  }
}

async function connectToKnownNetwork(bssid: string): Promise<{ success: boolean; hasSaved: boolean }> {
  if (!isValidBssid(bssid)) {
    return { success: false, hasSaved: false }
  }

  const hasSaved = await hasSavedConnection(bssid)

  if (!hasSaved) {
    return { success: false, hasSaved: false }
  }

  try {
    // Try to connect using BSSID (safe - only hex and colons)
    await execAsync(["nmcli", "--wait", "30", "device", "wifi", "connect", bssid])

    // Verify connection by checking active BSSID
    const activeBssid = await execAsync([
      "nmcli", "-t", "-f", "BSSID", "device", "wifi", "show-password"
    ]).catch(() => "")

    return { success: activeBssid.toLowerCase().includes(bssid.toLowerCase()), hasSaved: true }
  } catch {
    // Connection failed but we have saved credentials - might be temporary issue
    return { success: false, hasSaved: true }
  }
}

function InlinePasswordEntry() {
  const [passwordText, setPasswordText] = createState("")
  const [isConnecting, setIsConnecting] = createState(false)
  let entryRef: Gtk.PasswordEntry | null = null

  // Reset password when dialog closes
  passwordDialogAp.subscribe(() => {
    if (!passwordDialogAp.peek()) {
      setPasswordText("")
      if (entryRef) {
        entryRef.set_text("")
      }
    }
  })

  const handleConnect = async () => {
    const dialogAp = passwordDialogAp.peek()
    const password = passwordText.peek()
    if (!dialogAp || password.length < 8) return

    setIsConnecting(true)
    setConnectingBssid(dialogAp.bssid)

    const result = await connectWithPassword(dialogAp.bssid, dialogAp.ssid, password)

    setIsConnecting(false)
    setConnectingBssid(null)

    if (result.success) {
      closePasswordDialog()
    } else {
      setPasswordError(result.error || "Connection failed")
    }
  }

  const handleCancel = () => {
    closePasswordDialog()
    setPasswordText("")
    if (entryRef) {
      entryRef.set_text("")
    }
  }

  const setupEntry = (entry: Gtk.PasswordEntry) => {
    entryRef = entry
    entry.connect("activate", () => {
      if (passwordText.peek().length >= 8) {
        handleConnect()
      }
    })
    entry.connect("changed", () => {
      setPasswordText(entry.get_text())
      setPasswordError(null)
    })
    // Auto-focus when mounted
    setTimeout(() => entry.grab_focus(), 50)
  }

  return (
    <box
      orientation={Gtk.Orientation.VERTICAL}
      spacing={8}
      cssClasses={["wifi-password-inline"]}
      visible={passwordDialogAp.as(ap => ap !== null)}
    >
      <box cssClasses={["separator"]} />
      <box spacing={8}>
        <Gtk.Image iconName="network-wireless-encrypted-symbolic" pixelSize={16} />
        <label
          label={passwordDialogAp.as(ap => ap ? `Connect to ${ap.ssid}` : "")}
          cssClasses={["wifi-password-title"]}
          hexpand
          halign={Gtk.Align.START}
          ellipsize={3}
        />
      </box>
      <Gtk.PasswordEntry
        showPeekIcon
        placeholderText="Enter password"
        hexpand
        $={setupEntry}
      />
      <label
        label={passwordError.as(e => e || "")}
        cssClasses={["wifi-password-error"]}
        visible={passwordError.as(e => e !== null)}
        halign={Gtk.Align.START}
      />
      <box spacing={8} halign={Gtk.Align.END}>
        <button
          cssClasses={["wifi-password-btn"]}
          onClicked={handleCancel}
          sensitive={isConnecting.as(c => !c)}
        >
          <label label="Cancel" />
        </button>
        <button
          cssClasses={["wifi-password-btn", "suggested"]}
          onClicked={handleConnect}
          sensitive={passwordText.as(p => p.length >= 8)}
        >
          <box spacing={4}>
            <Gtk.Spinner spinning={isConnecting} visible={isConnecting} />
            <label label="Connect" />
          </box>
        </button>
      </box>
    </box>
  )
}

function AccessPointItem({ ap, activeApSsid }: { ap: AstalNetwork.AccessPoint; activeApSsid: Accessor<string | null> }) {
  const ssid = ap.ssid || "WiFi"
  const bssid = ap.bssid || ""
  const isActive = activeApSsid.as(activeSsid => activeSsid === ap.ssid)
  const isConnecting = connectingBssid.as(connecting => connecting === bssid)

  const getStrengthIcon = (strength: number): string => {
    if (strength >= 80) return "network-wireless-signal-excellent-symbolic"
    if (strength >= 60) return "network-wireless-signal-good-symbolic"
    if (strength >= 40) return "network-wireless-signal-ok-symbolic"
    if (strength >= 20) return "network-wireless-signal-weak-symbolic"
    return "network-wireless-signal-none-symbolic"
  }

  const connectToAp = async () => {
    // Don't connect if already connected or already connecting
    if (activeApSsid.peek() === ap.ssid) return
    if (connectingBssid.peek() !== null) return
    if (!bssid || !isValidBssid(bssid)) return

    if (ap.requiresPassword) {
      // First try saved connection
      setConnectingBssid(bssid)

      const result = await connectToKnownNetwork(bssid)

      if (result.success) {
        setConnectingBssid(null)
        return
      }

      // If we have saved credentials but connection failed, just stop the spinner
      // Don't show error or ask for password - user can retry
      if (result.hasSaved) {
        setConnectingBssid(null)
        return
      }

      setConnectingBssid(null)

      // No saved connection, show password dialog inline
      openPasswordDialog(bssid, ssid)
    } else {
      // Open network
      setConnectingBssid(bssid)
      ap.activate(null, null)

      // Wait a bit for connection, then clear state
      setTimeout(() => {
        if (connectingBssid.peek() === bssid) {
          setConnectingBssid(null)
        }
      }, 10000)
    }
  }

  // Combined state for CSS classes
  const cssClasses = new Accessor(
    () => {
      const classes = ["net-item"]
      if (activeApSsid.peek() === ap.ssid) classes.push("connected")
      if (connectingBssid.peek() === bssid) classes.push("connecting")
      return classes
    },
    (callback) => {
      const unsub1 = activeApSsid.subscribe(callback)
      const unsub2 = connectingBssid.subscribe(callback)
      return () => {
        unsub1()
        unsub2()
      }
    }
  )

  return (
    <button
      cssClasses={cssClasses}
      onClicked={connectToAp}
      sensitive={isConnecting.as(c => !c)}
    >
      <box spacing={8}>
        <Gtk.Image iconName={getStrengthIcon(ap.strength)} pixelSize={14} />
        <label
          label={ap.ssid || "Hidden Network"}
          cssClasses={["net-item-name"]}
          hexpand
          halign={Gtk.Align.START}
          ellipsize={3}
        />
        {/* Lock icon for password-protected networks (when not connected/connecting) */}
        <Gtk.Image
          iconName="network-wireless-encrypted-symbolic"
          pixelSize={12}
          visible={isActive.as(active => {
            const connecting = connectingBssid.peek() === bssid
            return ap.requiresPassword && !active && !connecting
          })}
        />
        {/* Spinner when connecting */}
        <Gtk.Spinner
          spinning={isConnecting}
          visible={isConnecting}
        />
        {/* Checkmark when connected */}
        <Gtk.Image
          iconName="object-select-symbolic"
          pixelSize={12}
          visible={isActive.as(active => active && connectingBssid.peek() !== bssid)}
        />
      </box>
    </button>
  )
}

export function WifiPopup() {
  const wifi = network.wifi
  const wired = network.wired

  const wiredState = new Accessor(
    () => wired?.state ?? AstalNetwork.DeviceState.UNKNOWN,
    (callback) => {
      if (!wired) return () => {}
      const id = wired.connect("notify::state", callback)
      return () => wired.disconnect(id)
    }
  )

  const wiredSpeed = new Accessor(
    () => wired?.speed || 0,
    (callback) => {
      if (!wired) return () => {}
      const id = wired.connect("notify::speed", callback)
      return () => wired.disconnect(id)
    }
  )

  const wifiEnabled = new Accessor(
    () => wifi?.enabled ?? false,
    (callback) => {
      if (!wifi) return () => {}
      const id = wifi.connect("notify::enabled", callback)
      return () => wifi.disconnect(id)
    }
  )

  const isScanning = new Accessor(
    () => wifi?.scanning ?? false,
    (callback) => {
      if (!wifi) return () => {}
      const id = wifi.connect("notify::scanning", callback)
      return () => wifi.disconnect(id)
    }
  )

  const activeApSsid = new Accessor(
    () => wifi?.activeAccessPoint?.ssid ?? null,
    (callback) => {
      if (!wifi) return () => {}
      const id = wifi.connect("notify::active-access-point", callback)
      return () => wifi.disconnect(id)
    }
  )

  // Clear connecting state when connection is established
  activeApSsid.subscribe(() => {
    const currentlyConnecting = connectingBssid.peek()
    const nowActive = activeApSsid.peek()
    if (currentlyConnecting && nowActive === currentlyConnecting) {
      setConnectingBssid(null)
    }
  })

  const accessPoints = new Accessor(
    () => {
      if (!wifi) return []
      const seen = new Set<string>()
      return wifi.accessPoints
        .filter(ap => {
          if (!ap.ssid || seen.has(ap.ssid)) return false
          seen.add(ap.ssid)
          return true
        })
        .sort((a, b) => {
          const activeAp = wifi.activeAccessPoint
          if (activeAp) {
            if (a.ssid === activeAp.ssid) return -1
            if (b.ssid === activeAp.ssid) return 1
          }
          return b.strength - a.strength
        })
        .slice(0, 8)
    },
    (callback) => {
      if (!wifi) return () => {}
      const ids = [
        wifi.connect("notify::access-points", callback),
        wifi.connect("access-point-added", callback),
        wifi.connect("access-point-removed", callback),
        wifi.connect("notify::active-access-point", callback)
      ]
      return () => ids.forEach(id => wifi.disconnect(id))
    }
  )

  const toggleScan = () => {
    wifi?.scan()
  }

  const openNetworkSettings = () => {
    execAsync("nm-connection-editor").catch(() => {
      execAsync("gnome-control-center network").catch(() => {})
    })
  }

  const getWiredStatusText = (state: AstalNetwork.DeviceState): string => {
    switch (state) {
      case AstalNetwork.DeviceState.ACTIVATED:
        return "Connected"
      case AstalNetwork.DeviceState.UNAVAILABLE:
        return "Cable unplugged"
      case AstalNetwork.DeviceState.DISCONNECTED:
        return "Disabled"
      case AstalNetwork.DeviceState.PREPARE:
      case AstalNetwork.DeviceState.CONFIG:
      case AstalNetwork.DeviceState.IP_CONFIG:
      case AstalNetwork.DeviceState.IP_CHECK:
        return "Connecting..."
      case AstalNetwork.DeviceState.DEACTIVATING:
        return "Disconnecting..."
      case AstalNetwork.DeviceState.FAILED:
        return "Failed"
      default:
        return "Unavailable"
    }
  }

  const isWiredConnected = (state: AstalNetwork.DeviceState): boolean => {
    return state === AstalNetwork.DeviceState.ACTIVATED
  }

  const toggleWired = () => {
    const state = wiredState.peek()
    if (state === AstalNetwork.DeviceState.ACTIVATED) {
      execAsync("nmcli device disconnect $(nmcli -t -f DEVICE,TYPE device | grep ethernet | cut -d: -f1 | head -1)").catch(() => {})
    } else if (state === AstalNetwork.DeviceState.DISCONNECTED) {
      execAsync("nmcli device connect $(nmcli -t -f DEVICE,TYPE device | grep ethernet | cut -d: -f1 | head -1)").catch(() => {})
    }
  }

  const canToggleWired = (state: AstalNetwork.DeviceState): boolean => {
    return state === AstalNetwork.DeviceState.ACTIVATED || state === AstalNetwork.DeviceState.DISCONNECTED
  }

  return (
    <PopupWindow name={POPUP_NAME} position="top-right">
      <box orientation={Gtk.Orientation.VERTICAL} spacing={6} cssClasses={["net-menu"]}>
        {/* Header */}
        <box cssClasses={["net-header"]} spacing={8}>
          <Gtk.Image iconName="network-transmit-receive-symbolic" pixelSize={14} />
          <label cssClasses={["net-title"]} label="Network" hexpand halign={Gtk.Align.START} />
          <button cssClasses={["net-settings-btn"]} onClicked={openNetworkSettings} tooltipText="Network Settings">
            <Gtk.Image iconName="emblem-system-symbolic" pixelSize={14} />
          </button>
        </box>

        {/* Wired Section */}
        {wired && (
          <box orientation={Gtk.Orientation.VERTICAL} spacing={4} cssClasses={["net-section"]}>
            <box cssClasses={["net-section-header"]} spacing={6}>
              <Gtk.Image iconName="network-wired-symbolic" pixelSize={12} />
              <label cssClasses={["net-section-title"]} label="Ethernet" hexpand halign={Gtk.Align.START} />
              <Gtk.Switch
                active={wiredState.as(s => isWiredConnected(s))}
                sensitive={wiredState.as(s => canToggleWired(s))}
                onNotify:active={toggleWired}
              />
            </box>
            <box
              cssClasses={wiredState.as(s => isWiredConnected(s) ? ["net-status", "connected"] : ["net-status", "disconnected"])}
              spacing={8}
            >
              <Gtk.Image
                iconName={wiredState.as(s => isWiredConnected(s) ? "network-wired-symbolic" : "network-wired-disconnected-symbolic")}
                pixelSize={14}
              />
              <label
                label={wiredState.as(s => getWiredStatusText(s))}
                cssClasses={["net-status-label"]}
                hexpand
                halign={Gtk.Align.START}
              />
              <label
                label={wiredSpeed.as(s => s > 0 ? `${s} Mbps` : "")}
                cssClasses={["net-status-detail"]}
                visible={wiredState.as(s => isWiredConnected(s))}
              />
              <Gtk.Image
                iconName="object-select-symbolic"
                pixelSize={12}
                visible={wiredState.as(s => isWiredConnected(s))}
              />
            </box>
          </box>
        )}

        <box cssClasses={["separator"]} />

        {/* WiFi Section */}
        <box orientation={Gtk.Orientation.VERTICAL} spacing={4} cssClasses={["net-section"]}>
          <box cssClasses={["net-section-header"]} spacing={6}>
            <Gtk.Image iconName="network-wireless-symbolic" pixelSize={12} />
            <label cssClasses={["net-section-title"]} label="Wi-Fi" hexpand halign={Gtk.Align.START} />
            {/* Scan button */}
            <button
              cssClasses={isScanning.as(s => s ? ["scan-icon-btn", "scanning"] : ["scan-icon-btn"])}
              onClicked={toggleScan}
              sensitive={wifiEnabled}
              tooltipText="Scan for networks"
            >
              <box>
                <Gtk.Spinner
                  spinning={isScanning}
                  visible={isScanning}
                />
                <Gtk.Image
                  iconName="view-refresh-symbolic"
                  pixelSize={14}
                  visible={isScanning.as(s => !s)}
                />
              </box>
            </button>
            <Gtk.Switch
              active={wifiEnabled}
              onNotify:active={(sw: Gtk.Switch) => {
                if (wifi && wifi.enabled !== sw.active) {
                  wifi.enabled = sw.active
                }
              }}
            />
          </box>

          {/* Access point list */}
          <box orientation={Gtk.Orientation.VERTICAL} spacing={2} cssClasses={["net-ap-list"]} visible={accessPoints.as(aps => aps.length > 0)}>
            <For each={accessPoints}>
              {(ap) => <AccessPointItem ap={ap} activeApSsid={activeApSsid} />}
            </For>
          </box>

          {/* Inline password entry */}
          <InlinePasswordEntry />
        </box>
      </box>
    </PopupWindow>
  )
}
