export type LogLevel = "debug" | "info" | "warn" | "error";

export class Logger {
  private static format(level: LogLevel, message: string, meta?: unknown): string {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(meta ? { meta } : {})
    });
  }

  static debug(message: string, meta?: unknown): void {
    if (process.env.LOG_LEVEL === "debug" || process.env.NODE_ENV !== "production") {
      console.debug(Logger.format("debug", message, meta));
    }
  }

  static info(message: string, meta?: unknown): void {
    console.log(Logger.format("info", message, meta));
  }

  static warn(message: string, meta?: unknown): void {
    console.warn(Logger.format("warn", message, meta));
  }

  static error(message: string, meta?: unknown): void {
    console.error(Logger.format("error", message, meta instanceof Error ? { name: meta.name, message: meta.message, stack: meta.stack } : meta));
  }
}
