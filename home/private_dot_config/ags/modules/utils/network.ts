export function isValidBssid(bssid: string): boolean {
  return /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(bssid)
}

export function escapeForKeyfile(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")
}

export function isValidSsid(ssid: string): boolean {
  if (!ssid || ssid.length === 0 || ssid.length > 32) return false
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(ssid)) return false
  if (/^\s*$/.test(ssid)) return false
  if (ssid.startsWith("-")) return false
  return true
}
