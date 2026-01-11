import { Gtk } from "ags/gtk4"
import { Accessor, For, createState } from "ags"
import { execAsync } from "ags/process"
import { writeFileAsync } from "ags/file"
import AstalNetwork from "gi://AstalNetwork?version=0.1"
import GLib from "gi://GLib"
import { PopupWindow, PopupButton, getPopupState } from "../popup"
import { isValidBssid, isValidSsid, escapeForKeyfile } from "../utils/network"
import { createModuleLogger } from "../utils/logger"

const logger = createModuleLogger("WiFi")

const POPUP_NAME = "network-popup"
const network = AstalNetwork.get_default()

const [connectingBssid, setConnectingBssid] = createState<string | null>(null)
const [passwordDialogAp, setPasswordDialogAp] = createState<{ bssid: string; ssid: string } | null>(null)
const [passwordError, setPasswordError] = createState<string | null>(null)
const [enterpriseDialogAp, setEnterpriseDialogAp] = createState<{ bssid: string; ssid: string } | null>(null)
const [enterpriseError, setEnterpriseError] = createState<string | null>(null)
const [popupVisible] = getPopupState(POPUP_NAME)
popupVisible.subscribe(() => {
  if (!popupVisible.peek()) {
    setPasswordDialogAp(null)
    setPasswordError(null)
    setEnterpriseDialogAp(null)
    setEnterpriseError(null)
  }
})

export function Wifi() {
  const wifi = network.wifi
  const wired = network.wired

  const networkIcon = new Accessor(
    () => {
      const wiredState = wired?.state
      if (wiredState === AstalNetwork.DeviceState.ACTIVATED) {
        return "settings_ethernet"
      }
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

function openEnterpriseDialog(bssid: string, ssid: string) {
  setEnterpriseError(null)
  setEnterpriseDialogAp({ bssid, ssid })
}

function closeEnterpriseDialog() {
  setEnterpriseDialogAp(null)
  setEnterpriseError(null)
}

function isEnterpriseNetwork(ap: AstalNetwork.AccessPoint): boolean {
  const FLAG_8021X = 0x200
  return ((ap.rsnFlags ?? 0) & FLAG_8021X) !== 0 || ((ap.wpaFlags ?? 0) & FLAG_8021X) !== 0
}

async function connectWithEnterprise(
  bssid: string,
  ssid: string,
  username: string,
  password: string
): Promise<{ success: boolean; error?: string }> {
  if (!isValidBssid(bssid)) {
    return { success: false, error: "Invalid network" }
  }
  if (!isValidSsid(ssid)) {
    return { success: false, error: "Invalid network name" }
  }

  const tmpDir = GLib.get_tmp_dir()
  const tmpFile = `${tmpDir}/nm-enterprise-${GLib.uuid_string_random()}.conf`
  const safeSsid = escapeForKeyfile(ssid)
  const safeUsername = escapeForKeyfile(username)
  const safePassword = escapeForKeyfile(password)

  try {
    await execAsync(["nmcli", "connection", "delete", "id", ssid]).catch((err) => {
      logger.warn(`Could not delete existing connection: ${err}`)
    })

    const keyfileContent = `[connection]
id=${safeSsid}
type=wifi

[wifi]
ssid=${safeSsid}
mode=infrastructure

[wifi-security]
key-mgmt=wpa-eap

[802-1x]
eap=peap;
identity=${safeUsername}
password=${safePassword}
phase2-auth=mschapv2

[ipv4]
method=auto

[ipv6]
method=auto
`
    await writeFileAsync(tmpFile, keyfileContent)
    await execAsync(["chmod", "600", tmpFile])
    await execAsync(["nmcli", "connection", "load", tmpFile])
    await execAsync(["rm", "-f", tmpFile]).catch((err) => {
      logger.warn(`Could not delete temp file: ${err}`)
    })
    await execAsync(["nmcli", "--wait", "30", "connection", "up", ssid])

    return { success: true }
  } catch (err: unknown) {
    await execAsync(["rm", "-f", tmpFile]).catch((err) => {
      logger.warn(`Could not delete temp file: ${err}`)
    })
    await execAsync(["nmcli", "connection", "delete", "id", ssid]).catch((err) => {
      logger.warn(`Could not delete existing connection: ${err}`)
    })

    const errorMsg = err instanceof Error ? err.message : String(err)
    let friendlyError = errorMsg

    if (errorMsg.includes("Secrets were required") || errorMsg.includes("authentication")) {
      friendlyError = "Authentication failed"
    } else if (errorMsg.includes("No network with SSID")) {
      friendlyError = "Network not found"
    } else if (errorMsg.includes("Connection activation failed")) {
      friendlyError = "Connection failed"
    }

    return { success: false, error: friendlyError }
  }
}

async function connectWithPassword(bssid: string, ssid: string, password: string): Promise<{ success: boolean; error?: string }> {
  if (!isValidBssid(bssid)) {
    return { success: false, error: "Invalid network" }
  }
  if (!isValidSsid(ssid)) {
    return { success: false, error: "Invalid network name" }
  }

  const tmpDir = GLib.get_tmp_dir()
  const tmpFile = `${tmpDir}/nm-wifi-${GLib.uuid_string_random()}.conf`
  const safeSsid = escapeForKeyfile(ssid)
  const safePassword = escapeForKeyfile(password)

  try {
    const keyfileContent = `[connection]
id=${safeSsid}
type=wifi

[wifi]
ssid=${safeSsid}
mode=infrastructure
bssid=${bssid}

[wifi-security]
key-mgmt=wpa-psk
psk=${safePassword}

[ipv4]
method=auto

[ipv6]
method=auto
`
    await writeFileAsync(tmpFile, keyfileContent)
    await execAsync(["chmod", "600", tmpFile])
    await execAsync(["nmcli", "connection", "load", tmpFile])
    await execAsync(["rm", "-f", tmpFile]).catch((err) => {
      logger.warn(`Could not delete temp file: ${err}`)
    })
    await execAsync(["nmcli", "--wait", "30", "connection", "up", ssid])

    return { success: true }
  } catch (err: unknown) {
    await execAsync(["rm", "-f", tmpFile]).catch((err) => {
      logger.warn(`Could not delete temp file: ${err}`)
    })
    await execAsync(["nmcli", "connection", "delete", "id", ssid]).catch((err) => {
      logger.warn(`Could not delete existing connection: ${err}`)
    })

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
    const connections = await execAsync([
      "nmcli", "-t", "-f", "NAME,TYPE", "connection", "show"
    ])
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
    await execAsync(["nmcli", "--wait", "30", "device", "wifi", "connect", bssid])

    const activeBssid = await execAsync([
      "nmcli", "-t", "-f", "BSSID", "device", "wifi", "show-password"
    ]).catch(() => "")

    return { success: activeBssid.toLowerCase().includes(bssid.toLowerCase()), hasSaved: true }
  } catch {
    return { success: false, hasSaved: true }
  }
}

function InlinePasswordEntry() {
  const [passwordText, setPasswordText] = createState("")
  const [isConnecting, setIsConnecting] = createState(false)
  let entryRef: Gtk.PasswordEntry | null = null

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
            <label label="progress_activity" cssClasses={["bar-icon", "spinning"]} visible={isConnecting} />
            <label label="Connect" />
          </box>
        </button>
      </box>
    </box>
  )
}

function InlineEnterpriseEntry() {
  const [usernameText, setUsernameText] = createState("")
  const [passwordText, setPasswordText] = createState("")
  const [isConnecting, setIsConnecting] = createState(false)
  let usernameRef: Gtk.Entry | null = null
  let passwordRef: Gtk.PasswordEntry | null = null

  enterpriseDialogAp.subscribe(() => {
    if (!enterpriseDialogAp.peek()) {
      setUsernameText("")
      setPasswordText("")
      if (usernameRef) usernameRef.set_text("")
      if (passwordRef) passwordRef.set_text("")
    }
  })

  const canConnect = new Accessor(
    () => usernameText.peek().length > 0 && passwordText.peek().length > 0,
    (callback) => {
      const unsub1 = usernameText.subscribe(callback)
      const unsub2 = passwordText.subscribe(callback)
      return () => { unsub1(); unsub2() }
    }
  )

  const handleConnect = async () => {
    const dialogAp = enterpriseDialogAp.peek()
    const username = usernameText.peek()
    const password = passwordText.peek()
    if (!dialogAp || !username || !password) return

    setIsConnecting(true)
    setConnectingBssid(dialogAp.bssid)

    const result = await connectWithEnterprise(dialogAp.bssid, dialogAp.ssid, username, password)

    setIsConnecting(false)
    setConnectingBssid(null)

    if (result.success) {
      closeEnterpriseDialog()
    } else {
      setEnterpriseError(result.error || "Connection failed")
    }
  }

  const handleCancel = () => {
    closeEnterpriseDialog()
    setUsernameText("")
    setPasswordText("")
    if (usernameRef) usernameRef.set_text("")
    if (passwordRef) passwordRef.set_text("")
  }

  const setupUsernameEntry = (entry: Gtk.Entry) => {
    usernameRef = entry
    entry.connect("changed", () => {
      setUsernameText(entry.get_text())
      setEnterpriseError(null)
    })
    entry.connect("activate", () => {
      passwordRef?.grab_focus()
    })
    setTimeout(() => entry.grab_focus(), 50)
  }

  const setupPasswordEntry = (entry: Gtk.PasswordEntry) => {
    passwordRef = entry
    entry.connect("changed", () => {
      setPasswordText(entry.get_text())
      setEnterpriseError(null)
    })
    entry.connect("activate", () => {
      if (canConnect.peek()) {
        handleConnect()
      }
    })
  }

  return (
    <box
      orientation={Gtk.Orientation.VERTICAL}
      spacing={8}
      cssClasses={["wifi-password-inline"]}
      visible={enterpriseDialogAp.as(ap => ap !== null)}
    >
      <box cssClasses={["separator"]} />
      <box spacing={8}>
        <Gtk.Image iconName="network-wireless-encrypted-symbolic" pixelSize={16} />
        <label
          label={enterpriseDialogAp.as(ap => ap ? `Connect to ${ap.ssid}` : "")}
          cssClasses={["wifi-password-title"]}
          hexpand
          halign={Gtk.Align.START}
          ellipsize={3}
        />
        <label
          label="Enterprise"
          cssClasses={["wifi-enterprise-badge"]}
        />
      </box>
      <Gtk.Entry
        placeholderText="Username"
        hexpand
        $={setupUsernameEntry}
      />
      <Gtk.PasswordEntry
        showPeekIcon
        placeholderText="Password"
        hexpand
        $={setupPasswordEntry}
      />
      <label
        label={enterpriseError.as(e => e || "")}
        cssClasses={["wifi-password-error"]}
        visible={enterpriseError.as(e => e !== null)}
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
          sensitive={canConnect}
        >
          <box spacing={4}>
            <label label="progress_activity" cssClasses={["bar-icon", "spinning"]} visible={isConnecting} />
            <label label="Connect" />
          </box>
        </button>
      </box>
    </box>
  )
}

function AccessPointItem({ ap, activeApSsid }: { ap: AstalNetwork.AccessPoint; activeApSsid: Accessor<string | null> }) {
  const ssid = ap?.ssid || "WiFi"
  const bssid = ap?.bssid || ""
  const strength = ap?.strength ?? 0
  const isActive = activeApSsid.as(activeSsid => activeSsid === ap?.ssid)
  const isConnecting = connectingBssid.as(connecting => connecting === bssid)
  const isOpenNetwork = ap?.flags === 0 && ap?.wpaFlags === 0 && ap?.rsnFlags === 0
  const actuallyRequiresPassword = ap?.requiresPassword && !isOpenNetwork
  const isEnterprise = isEnterpriseNetwork(ap)

  const getStrengthIcon = (strength: number): string => {
    if (strength >= 80) return "network-wireless-signal-excellent-symbolic"
    if (strength >= 60) return "network-wireless-signal-good-symbolic"
    if (strength >= 40) return "network-wireless-signal-ok-symbolic"
    if (strength >= 20) return "network-wireless-signal-weak-symbolic"
    return "network-wireless-signal-none-symbolic"
  }

  const connectToAp = async () => {
    if (!ap) return
    if (activeApSsid.peek() === ap.ssid) return
    if (connectingBssid.peek() !== null) return
    if (!bssid || !isValidBssid(bssid)) return

    closePasswordDialog()
    closeEnterpriseDialog()
    setConnectingBssid(bssid)

    try {
      await execAsync(["nmcli", "--wait", "10", "device", "wifi", "connect", bssid])
      setConnectingBssid(null)
      return
    } catch {}

    setConnectingBssid(null)

    if (ap.requiresPassword) {
      if (isEnterprise) {
        openEnterpriseDialog(bssid, ssid)
      } else {
        openPasswordDialog(bssid, ssid)
      }
    }
  }

  const cssClasses = new Accessor(
    () => {
      const classes = ["net-item"]
      if (activeApSsid.peek() === ap?.ssid) classes.push("connected")
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
        <Gtk.Image iconName={getStrengthIcon(strength)} pixelSize={14} />
        <label
          label={ssid || "Hidden Network"}
          cssClasses={["net-item-name"]}
          hexpand
          halign={Gtk.Align.START}
          ellipsize={3}
        />
        <Gtk.Image
          iconName="network-wireless-encrypted-symbolic"
          pixelSize={12}
          visible={isActive.as(active => {
            const connecting = connectingBssid.peek() === bssid
            return actuallyRequiresPassword && !isEnterprise && !active && !connecting
          })}
        />
        <label
          label="802.1X"
          cssClasses={["wifi-enterprise-badge-small"]}
          visible={isActive.as(active => {
            const connecting = connectingBssid.peek() === bssid
            return isEnterprise && !active && !connecting
          })}
        />
        <label
          label="progress_activity"
          cssClasses={["bar-icon", "spinning"]}
          visible={isConnecting}
        />
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
          if (!ap || !ap.ssid || seen.has(ap.ssid)) return false
          seen.add(ap.ssid)
          return true
        })
        .sort((a, b) => {
          const activeAp = wifi.activeAccessPoint
          if (activeAp?.ssid) {
            if (a.ssid === activeAp.ssid) return -1
            if (b.ssid === activeAp.ssid) return 1
          }
          return (b.strength ?? 0) - (a.strength ?? 0)
        })
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
      execAsync("gnome-control-center network").catch((err) => {
        logger.error("Failed to open network settings", err)
      })
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

  const toggleWired = async () => {
    const state = wiredState.peek()
    try {
      const deviceOutput = await execAsync(["nmcli", "-t", "-f", "DEVICE,TYPE", "device"])
      const ethernetLine = deviceOutput.split("\n").find(line => line.includes(":ethernet"))
      if (!ethernetLine) return

      const deviceName = ethernetLine.split(":")[0]
      if (!deviceName || !/^[a-zA-Z0-9_-]+$/.test(deviceName)) return

      if (state === AstalNetwork.DeviceState.ACTIVATED) {
        await execAsync(["nmcli", "device", "disconnect", deviceName])
      } else if (state === AstalNetwork.DeviceState.DISCONNECTED) {
        await execAsync(["nmcli", "device", "connect", deviceName])
      }
    } catch {}
  }

  const canToggleWired = (state: AstalNetwork.DeviceState): boolean => {
    return state === AstalNetwork.DeviceState.ACTIVATED || state === AstalNetwork.DeviceState.DISCONNECTED
  }

  return (
    <PopupWindow name={POPUP_NAME} position="top-right">
      <box orientation={Gtk.Orientation.VERTICAL} spacing={6} cssClasses={["net-menu"]}>
        <box cssClasses={["net-header"]} spacing={8}>
          <Gtk.Image iconName="network-transmit-receive-symbolic" pixelSize={14} />
          <label cssClasses={["net-title"]} label="Network" hexpand halign={Gtk.Align.START} />
          <button cssClasses={["net-settings-btn"]} onClicked={openNetworkSettings} tooltipText="Network Settings">
            <Gtk.Image iconName="emblem-system-symbolic" pixelSize={14} />
          </button>
        </box>

        {wired && (
          <box orientation={Gtk.Orientation.VERTICAL} spacing={4} cssClasses={["net-section"]}>
            <box cssClasses={["net-section-header"]} spacing={6}>
              <Gtk.Image iconName="network-wired-symbolic" pixelSize={12} />
              <label cssClasses={["net-section-title"]} label="Ethernet" hexpand halign={Gtk.Align.START} />
              <Gtk.Switch
                active={wiredState.as(s => isWiredConnected(s))}
                sensitive={wiredState.as(s => canToggleWired(s))}
                onNotify:active={() => { toggleWired() }}
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

        <box orientation={Gtk.Orientation.VERTICAL} spacing={4} cssClasses={["net-section"]}>
          <box cssClasses={["net-section-header"]} spacing={6}>
            <Gtk.Image iconName="network-wireless-symbolic" pixelSize={12} />
            <label cssClasses={["net-section-title"]} label="Wi-Fi" hexpand halign={Gtk.Align.START} />
            <button
              cssClasses={isScanning.as(s => s ? ["scan-icon-btn", "scanning"] : ["scan-icon-btn"])}
              onClicked={toggleScan}
              sensitive={wifiEnabled}
              tooltipText="Scan for networks"
            >
              <Gtk.Image iconName="view-refresh-symbolic" pixelSize={14} cssClasses={isScanning.as(s => s ? ["spinning"] : [])} />
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

          <Gtk.ScrolledWindow
            cssClasses={["net-ap-scroll"]}
            hscrollbarPolicy={Gtk.PolicyType.NEVER}
            vscrollbarPolicy={Gtk.PolicyType.AUTOMATIC}
            propagateNaturalHeight
            maxContentHeight={256}
            visible={accessPoints.as(aps => aps.length > 0)}
          >
            <box orientation={Gtk.Orientation.VERTICAL} spacing={2} cssClasses={["net-ap-list"]}>
              <For each={accessPoints}>
                {(ap) => <AccessPointItem ap={ap} activeApSsid={activeApSsid} />}
              </For>
            </box>
          </Gtk.ScrolledWindow>

          <InlinePasswordEntry />
          <InlineEnterpriseEntry />
        </box>
      </box>
    </PopupWindow>
  )
}
