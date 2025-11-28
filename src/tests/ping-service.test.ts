import { createServer, Server } from "http";
import { PingService, makeDefaultPingConfigFromEnv, computeRandomIntervalMs, shouldAutoRestart } from "../ping.js";

function assert(cond: boolean, msg: string): void { if (!cond) throw new Error(msg); }
function sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }

async function withServer(handler: (req: any, res: any) => void, fn: (url: string, srv: Server) => Promise<void>): Promise<void> {
  const srv = createServer(handler);
  await new Promise<void>(resolve => srv.listen(0, resolve));
  const address = srv.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const url = `https://hopetrackerbot.onrender.com/`;
  try { await fn(url, srv); } finally { await new Promise<void>(resolve => srv.close(() => resolve())); }
}

async function run(): Promise<void> {
  // random interval generation bounds
  for (let i = 0; i < 50; i++) {
    const v = computeRandomIntervalMs(10, 15, () => Math.random());
    assert(v >= 10 * 60_000 && v < 15 * 60_000, "random interval bounds incorrect");
  }

  // success pings
  await withServer((_req, res) => { res.statusCode = 204; res.end(); }, async (url) => {
    const svc = new PingService({ url, intervalMs: 50, timeoutMs: 1000, logLevel: "none", criticalFailureThreshold: 3 });
    const res = await svc.pingOnce();
    assert(res.ok, "single ping not ok");
    const s = svc.stats();
    assert(s.total >= 1, "expected at least 1 ping");
    assert(s.failures === 0, "unexpected failures");
  });

  // timeout errors
  await withServer((_req, res) => { setTimeout(() => { res.statusCode = 200; res.end(); }, 200); }, async (url) => {
    const svc = new PingService({ url, intervalMs: 50, timeoutMs: 50, logLevel: "none", criticalFailureThreshold: 2 });
    const res = await svc.pingOnce();
    assert(!res.ok, "expected timeout failure");
    const s = svc.stats();
    assert(s.failures >= 1, "expected failures on timeout");
    assert(s.consecutiveFailures >= 1, "expected consecutive failures");
  });

  // overlap handling: make each request take longer than interval
  await withServer((_req, res) => { setTimeout(() => { res.statusCode = 200; res.end(); }, 120); }, async (url) => {
    const svc = new PingService({ url, intervalMs: 50, timeoutMs: 1000, logLevel: "none", criticalFailureThreshold: 3, timeZone: "UTC", now: () => new Date(Date.UTC(2020, 1, 1, 1, 0, 0)) });
    svc.start();
    await sleep(450);
    const s = svc.stats();
    assert(s.total >= 1, "expected executed pings");
    assert(s.skippedOverlaps === 0, "unexpected overlap handling");
  });

  // time-based stop at 02:00 in given timezone
  await withServer((_req, res) => { res.statusCode = 200; res.end(); }, async (url) => {
    const tz = "UTC";
    const svc = new PingService({ url, intervalMs: 50, timeoutMs: 1000, logLevel: "none", criticalFailureThreshold: 3, timeZone: tz, now: () => new Date(Date.UTC(2020, 1, 1, 2, 0, 0)) });
    svc.start();
    await sleep(50);
    const s = svc.stats();
    assert(s.total === 0, "should not ping after cutoff");
  });

  // persistence flag behavior
  const mem: { data: Record<string, string> } = { data: {} };
  const storage = {
    getItem: (k: string): string | null => (k in mem.data ? mem.data[k] : null),
    setItem: (k: string, v: string): void => { mem.data[k] = v; },
    removeItem: (k: string): void => { delete mem.data[k]; }
  };
  assert(!shouldAutoRestart(storage), "restart should be disabled initially");
  await withServer((_req, res) => { res.statusCode = 200; res.end(); }, async (url) => {
    const svc = new PingService({ url, intervalMs: 50, timeoutMs: 1000, logLevel: "none", criticalFailureThreshold: 3, persist: true, storage, timeZone: "UTC", now: () => new Date(Date.UTC(2020, 1, 1, 1, 0, 0)) });
    svc.start();
    await sleep(10);
    assert(shouldAutoRestart(storage), "restart flag not set");
    svc.stop();
    assert(!shouldAutoRestart(storage), "restart flag not cleaned up");
  });

  // env config builder
  process.env.PING_URL = "https://hopetrackerbot.onrender.com/";
  process.env.PING_INTERVAL_MINUTES = "10";
  process.env.PING_TIMEOUT_SECONDS = "30";
  process.env.PING_LOG_LEVEL = "debug";
  const cfg = makeDefaultPingConfigFromEnv();
  assert(!!cfg, "cfg missing");
  assert(cfg!.intervalMs === 10 * 60_000, "interval conversion incorrect");
  assert(cfg!.timeoutMs === 30 * 1_000, "timeout conversion incorrect");

  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
