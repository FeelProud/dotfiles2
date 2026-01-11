export function logError(module: string, message: string, error?: unknown): void {
  const errorMsg = error instanceof Error ? error.message : String(error)
  console.error(`[${module}] ${message}${error ? `: ${errorMsg}` : ""}`)
}

export function logWarning(module: string, message: string): void {
  console.warn(`[${module}] ${message}`)
}

export function logInfo(module: string, message: string): void {
  console.log(`[${module}] ${message}`)
}

export function createModuleLogger(moduleName: string) {
  return {
    error: (message: string, error?: unknown) => logError(moduleName, message, error),
    warn: (message: string) => logWarning(moduleName, message),
    info: (message: string) => logInfo(moduleName, message),
  }
}
