import { request as httpRequest } from "http";
import { request as httpsRequest } from "https";
import { URL } from "url";
import { performance } from "perf_hooks";

export type LogLevel = "none" | "normal" | "debug";

export interface PingConfig {
  url: string;
  intervalMs: number;
  timeoutMs: number;
  logLevel: LogLevel;
  criticalFailureThreshold: number;
}

export interface PingResult {
  timestamp: Date;
  ok: boolean;
  statusCode?: number;
  responseTimeMs: number;
  errorMessage?: string;
}

export interface HealthStats {
  startTime: Date;
  total: number;
  successes: number;
  failures: number;
  consecutiveFailures: number;
  lastError?: string;
  lastStatusCode?: number;
  lastResponseTimeMs?: number;
  skippedOverlaps: number;
}

export interface Notifier {
  notifyCritical(message: string, stats: HealthStats): Promise<void>;
}

class Logger {
  private level: LogLevel;
  constructor(level: LogLevel) { this.level = level; }
  info(msg: string, extra?: Record<string, unknown>): void { if (this.level === "normal" || this.level === "debug") console.log(msg, extra ?? {}); }
  debug(msg: string, extra?: Record<string, unknown>): void { if (this.level === "debug") console.log(msg, extra ?? {}); }
  error(msg: string, extra?: Record<string, unknown>): void { if (this.level !== "none") console.error(msg, extra ?? {}); }
}

class HttpPinger {
  async ping(urlStr: string, timeoutMs: number): Promise<PingResult> {
    const url = new URL(urlStr);
    const start = performance.now();
    return new Promise<PingResult>((resolve) => {
      const controller = new AbortController();
      const timer = setTimeout(() => { controller.abort(); }, timeoutMs);
      const isHttps = url.protocol === "https:";
      const req = (isHttps ? httpsRequest : httpRequest)({
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port ? Number(url.port) : undefined,
        path: url.pathname + (url.search || ""),
        method: "GET",
        signal: controller.signal,
        timeout: timeoutMs
      }, res => {
        // consume and discard the body to complete the response
        res.on("data", () => {});
        res.on("end", () => {
          clearTimeout(timer);
          const dur = performance.now() - start;
          resolve({ timestamp: new Date(), ok: true, statusCode: res.statusCode, responseTimeMs: Math.round(dur) });
        });
      });
      req.on("timeout", () => {
        // timeout event may fire on some Node versions; abort ensures closure
        controller.abort();
      });
      req.on("error", err => {
        clearTimeout(timer);
        const dur = performance.now() - start;
        resolve({ timestamp: new Date(), ok: false, responseTimeMs: Math.round(dur), errorMessage: String(err?.message ?? err) });
      });
      req.end();
    });
  }
}

class HealthMonitor {
  private stats: HealthStats;
  constructor() {
    this.stats = {
      startTime: new Date(),
      total: 0,
      successes: 0,
      failures: 0,
      consecutiveFailures: 0,
      skippedOverlaps: 0
    };
  }
  record(result: PingResult): void {
    this.stats.total += 1;
    this.stats.lastResponseTimeMs = result.responseTimeMs;
    this.stats.lastStatusCode = result.statusCode;
    if (result.ok && (result.statusCode ?? 0) >= 200 && (result.statusCode ?? 0) < 500) {
      this.stats.successes += 1;
      this.stats.consecutiveFailures = 0;
      this.stats.lastError = undefined;
    } else {
      this.stats.failures += 1;
      this.stats.consecutiveFailures += 1;
      this.stats.lastError = result.errorMessage ?? `status ${result.statusCode ?? 0}`;
    }
  }
  incrementSkippedOverlap(): void { this.stats.skippedOverlaps += 1; }
  snapshot(): HealthStats { return { ...this.stats }; }
}

export class PingService {
  private config: PingConfig;
  private logger: Logger;
  private pinger: HttpPinger;
  private monitor: HealthMonitor;
  private notifier?: Notifier;
  private running: boolean;
  private nextTickAt?: number;
  private stopped: boolean;

  constructor(config: PingConfig, notifier?: Notifier) {
    this.config = config;
    this.logger = new Logger(config.logLevel);
    this.pinger = new HttpPinger();
    this.monitor = new HealthMonitor();
    this.notifier = notifier;
    this.running = false;
    this.stopped = true;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    const now = Date.now();
    this.nextTickAt = now; // trigger an immediate first ping, then align subsequently
    this.logger.info("ping service started", { url: this.config.url, intervalMs: this.config.intervalMs, timeoutMs: this.config.timeoutMs });
    // kick off first tick immediately
    void this.tick();
  }

  stop(): void {
    this.stopped = true;
    this.logger.info("ping service stopped");
  }

  stats(): HealthStats { return this.monitor.snapshot(); }

  async pingOnce(): Promise<PingResult> {
    const res = await this.pinger.ping(this.config.url, this.config.timeoutMs);
    this.monitor.record(res);
    return res;
  }

  private scheduleNext(): void {
    if (this.stopped) return;
    const now = Date.now();
    const delay = Math.max(0, (this.nextTickAt ?? now) - now);
    setTimeout(() => this.tick(), delay);
  }

  private async tick(): Promise<void> {
    if (this.stopped) return;
    const planned = this.nextTickAt ?? Date.now();
    // plan next aligned tick immediately to avoid drift
    this.nextTickAt = planned + this.config.intervalMs;
    if (this.running) {
      this.monitor.incrementSkippedOverlap();
      this.logger.debug("skipping tick due to overlap");
      this.scheduleNext();
      return;
    }
    this.running = true;
    const startedAt = new Date();
    const res = await this.pinger.ping(this.config.url, this.config.timeoutMs);
    this.monitor.record(res);
    const stats = this.monitor.snapshot();
    const logPayload = { ts: startedAt.toISOString(), status: res.statusCode ?? null, ms: res.responseTimeMs, ok: res.ok, err: res.errorMessage ?? null };
    if (res.ok) this.logger.info("ping ok", logPayload); else this.logger.error("ping error", logPayload);
    if (stats.consecutiveFailures >= this.config.criticalFailureThreshold && this.notifier) {
      try { await this.notifier.notifyCritical("consecutive failures", stats); } catch {}
    }
    this.running = false;
    this.scheduleNext();
  }
}

export function makeDefaultPingConfigFromEnv(): PingConfig | null {
  const url = process.env.PING_URL ?? "https://hopetrackerbot.onrender.com/";
  if (!url) return null;
  const intervalMinutes = Number(process.env.PING_INTERVAL_MINUTES ?? "10");
  const timeoutSeconds = Number(process.env.PING_TIMEOUT_SECONDS ?? "30");
  const levelRaw = (process.env.PING_LOG_LEVEL ?? "normal") as LogLevel;
  const level: LogLevel = levelRaw === "none" || levelRaw === "debug" ? levelRaw : "normal";
  const threshold = Number(process.env.PING_CRITICAL_FAILURES ?? "3");
  return {
    url,
    intervalMs: Math.max(1, Math.round(intervalMinutes * 60_000)),
    timeoutMs: Math.max(1, Math.round(timeoutSeconds * 1_000)),
    logLevel: level,
    criticalFailureThreshold: Math.max(1, threshold)
  };
}
