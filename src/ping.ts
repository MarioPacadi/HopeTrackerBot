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
  timeZone?: string;
  persist?: boolean;
  storage?: StorageLike;
  now?: () => Date;
  randomProvider?: () => number;
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

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
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
  private first: boolean;
  private storage: StorageLike;

  constructor(config: PingConfig, notifier?: Notifier) {
    this.config = config;
    this.logger = new Logger(config.logLevel);
    this.pinger = new HttpPinger();
    this.monitor = new HealthMonitor();
    this.notifier = notifier;
    this.running = false;
    this.stopped = true;
    this.first = true;
    this.storage = config.storage ?? createDefaultStorage();
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    const now = Date.now();
    this.nextTickAt = now; // trigger an immediate first ping, then align subsequently
    this.logger.info("ping service started", { url: this.config.url, intervalMs: this.config.intervalMs, timeoutMs: this.config.timeoutMs });
    if (this.config.persist) this.storage.setItem(PING_ENABLED_KEY, "1");
    // kick off first tick immediately
    void this.tick();
  }

  stop(): void {
    this.stopped = true;
    this.logger.info("ping service stopped");
    if (this.config.persist) this.storage.removeItem(PING_ENABLED_KEY);
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
    if (this.shouldStopByTime()) { this.stop(); return; }
    const planned = this.nextTickAt ?? Date.now();
    const nextMs = this.first ? this.config.intervalMs : computeRandomIntervalMs(10, 15, this.config.randomProvider);
    this.first = false;
    this.nextTickAt = planned + nextMs;
    if (this.running) {
      this.monitor.incrementSkippedOverlap();
      this.logger.debug("skipping tick due to overlap");
      this.scheduleNext();
      return;
    }
    this.running = true;
    const startedAt = (this.config.now ?? (() => new Date()))();
    const res = await this.pinger.ping(this.config.url, this.config.timeoutMs);
    this.monitor.record(res);
    const stats = this.monitor.snapshot();
    const logPayload = { ts: startedAt.toISOString(), status: res.statusCode ?? "None", ms: res.responseTimeMs, ok: res.ok, err: res.errorMessage ?? "None" };
    if (res.ok) this.logger.info("ping ok", logPayload); else this.logger.error("ping error", logPayload);
    if (stats.consecutiveFailures >= this.config.criticalFailureThreshold && this.notifier) {
      try { await this.notifier.notifyCritical("consecutive failures", stats); } catch {}
    }
    this.running = false;
    this.scheduleNext();
  }

  private shouldStopByTime(): boolean {
    const tz = this.config.timeZone ?? getSystemTimeZone();
    const now = (this.config.now ?? (() => new Date()))();
    const { hour } = getHourMinute(now, tz);
    return hour >= 2;
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
  const timeZone = process.env.PING_TIMEZONE;
  const persist = (process.env.PING_PERSIST ?? "false") === "true";
  return {
    url,
    intervalMs: Math.max(1, Math.round(intervalMinutes * 60_000)),
    timeoutMs: Math.max(1, Math.round(timeoutSeconds * 1_000)),
    logLevel: level,
    criticalFailureThreshold: Math.max(1, threshold),
    timeZone,
    persist
  };
}

export function computeRandomIntervalMs(minMinutes: number, maxMinutesExclusive: number, rnd?: () => number): number {
  const minMs = Math.max(0, Math.round(minMinutes * 60_000));
  const maxMs = Math.max(minMs + 1, Math.round(maxMinutesExclusive * 60_000));
  const r = Math.min(0.999999999, Math.max(0, (rnd ?? Math.random)()));
  const span = maxMs - minMs;
  return minMs + Math.floor(r * span);
}

function getSystemTimeZone(): string | undefined {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return undefined; }
}

function getHourMinute(d: Date, timeZone?: string): { hour: number; minute: number } {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone, hour12: false, hour: "2-digit", minute: "2-digit" });
  const s = fmt.format(d); // e.g., "02:05"
  const [hh, mm] = s.split(":");
  const hour = Number(hh);
  const minute = Number(mm);
  return { hour: Number.isNaN(hour) ? d.getHours() : hour, minute: Number.isNaN(minute) ? d.getMinutes() : minute };
}

const PING_ENABLED_KEY = "ping.enabled";

function createDefaultStorage(): StorageLike {
  const ls: unknown = (globalThis as unknown as { localStorage?: StorageLike }).localStorage;
  if (ls && typeof (ls as StorageLike).getItem === "function") return ls as StorageLike;
  // fallback in Node: in-memory storage
  const map = new Map<string, string>();
  return {
    getItem: (key: string): string | null => map.get(key) ?? null,
    setItem: (key: string, value: string): void => { map.set(key, value); },
    removeItem: (key: string): void => { map.delete(key); }
  };
}

export function shouldAutoRestart(storage?: StorageLike): boolean {
  const s = storage ?? createDefaultStorage();
  const v = s.getItem(PING_ENABLED_KEY);
  return v === "1";
}
