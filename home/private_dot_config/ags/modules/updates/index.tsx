import { createPoll } from "ags/time"
import { execAsync } from "ags/process"

export function Updates() {
  const updates = createPoll("", 600000, async () => {
    try {
      const result = await execAsync("checkupdates")
      const lines = result.trim().split("\n").filter((line) => line.length > 0)
      const count = lines.length
      return count > 0 ? `${count}` : ""
    } catch (error) {
      return ""
    }
  })

  return (
    <box cssClasses={["updates"]} spacing={8}>
      <label label="📦" />
      <label label={updates} />
    </box>
  )
}
