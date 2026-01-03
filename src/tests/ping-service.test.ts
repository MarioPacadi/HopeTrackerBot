import { createServer, Server } from "http";
import { PingService, makeDefaultPingConfigFromEnv } from "../ping.js";

function assert(cond: boolean, msg: string): void { if (!cond) throw new Error(msg); }
function sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }

async function withServer(handler: (req: any, res: any) => void, fn: (url: string, srv: Server) => Promise<void>): Promise<void> {
  const srv = createServer(handler);
  await new Promise<void>(resolve => srv.listen(0, resolve));
  const address = srv.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const url = `http://localhost:${port}/`;
  try { await fn(url, srv); } finally { await new Promise<void>(resolve => srv.close(() => resolve())); }
}

async function run(): Promise<void> {
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
    const svc = new PingService({ url, intervalMs: 50, timeoutMs: 1000, logLevel: "none", criticalFailureThreshold: 3 });
    svc.start();
    await sleep(450);
    const s = svc.stats();
    assert(s.total >= 1, "expected executed pings");
    assert(s.skippedOverlaps === 0, "unexpected overlap handling");
  });

  // env config builder
  process.env.PING_URL = "https://example.com/";
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
