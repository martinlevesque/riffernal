export type LogLevel = "debug" | "info" | "error";

const PRIORITY: Record<LogLevel, number> = { debug: 10, info: 20, error: 40 };

// Read per call so tests can flip LOG_LEVEL without re-importing the module.
function minLevel(): number {
  const raw = (process.env.LOG_LEVEL ?? "info").toLowerCase();
  return PRIORITY[raw as LogLevel] ?? PRIORITY.info;
}

function emit(level: LogLevel, message: string): void {
  if (PRIORITY[level] < minLevel()) {
    return;
  }

  const line = `${new Date().toISOString()} ${level.toUpperCase()} ${message}`;

  if (level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export function errDetails(err: unknown): string {
  if (err instanceof Error) {
    return err.stack ?? err.message;
  }
  return String(err);
}

export const logger = {
  debug: (message: string) => emit("debug", message),
  info: (message: string) => emit("info", message),
  error: (message: string) => emit("error", message),
};
