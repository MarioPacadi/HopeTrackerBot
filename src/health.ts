import { createServer } from "http";
import { pool } from "./db.js";
import { getContainer } from "./di.js";

export function startHealthServer(port: number): void {
  const server = createServer(async (req, res) => {
    if (req.url?.startsWith("/values-history")) {
      const url = new URL(req.url, "http://localhost");
      const guildId = url.searchParams.get("guildId") ?? "";
      const userId = url.searchParams.get("userId") ?? "";
      try {
        let rows;
        if (guildId && userId) rows = await getContainer().valuesMessages.listByUser(guildId, userId, 200);
        else if (guildId) rows = await getContainer().valuesMessages.listForGuild(guildId, 200);
        else rows = await getContainer().valuesMessages.listAll(200);
        res.statusCode = 200;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        const items = rows.map(r => `<li><code>${r.createdAt.toISOString()}</code> | guild=${r.guildId} user=${r.discordUserId} by=${r.creatorUserId} | ${r.content.replace(/</g, "&lt;")}</li>`).join("");
        res.end(`<!DOCTYPE html><html><body><h1>Values Messages History</h1><ul>${items}</ul></body></html>`);
      } catch {
        res.statusCode = 500;
        res.end("error");
      }
      return;
    }
    if (req.url === "/") {
      let dbOk = false;
      try {
        await pool.query("select 1");
        dbOk = true;
      } catch {}
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(
        "<!DOCTYPE html>" +
          "<html><head><meta charset=\"utf-8\"/><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"/>" +
          "<title>Hope Tracker Bot</title>" +
          "<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Arial,sans-serif;background:#0f172a;color:#e2e8f0;margin:0;padding:2rem}main{max-width:760px;margin:0 auto}h1{margin:0 0 1rem;font-size:1.75rem}p{margin:.5rem 0}code{background:#1f2937;padding:.2rem .4rem;border-radius:.25rem}a{color:#93c5fd}img{max-width:100%;height:auto;margin:1rem 0}</style>" +
          "</head><body><main>" +
          "<h1>Hope Tracker Bot</h1>" +
          "<img src=\"https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fstatic.wixstatic.com%2Fmedia%2Fbe39ef_b575ceb932e9489398289a2237f9c654~mv2.gif&f=1&nofb=1&ipt=806d0f6b4cb6b8145c9127328e8cb0cae8711863b1a0ae263c127fa395d91fae\" alt=\"Hope\"/>" +
          "<p>Bot web service is running.</p>" +
          (dbOk ? "<p>Database: <span style=\"color:#22c55e\">ok</span></p>" : "<p>Database: <span style=\"color:#ef4444\">error</span></p>") +
          "<p>Health check: <a href=\"/healthz\">/healthz</a></p>" +
          "</main></body></html>"
      );
      return;
    }
    if (req.url === "/healthz") {
      try {
        await pool.query("select 1");
        res.statusCode = 200;
        res.end("ok");
      } catch {
        res.statusCode = 500;
        res.end("db error");
      }
      return;
    }
    res.statusCode = 404;
    res.end("not found");
  });
  server.listen(port);
}
