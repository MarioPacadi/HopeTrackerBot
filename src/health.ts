import { createServer } from "http";
import { pool } from "./db";

export function startHealthServer(port: number): void {
  const server = createServer(async (req, res) => {
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