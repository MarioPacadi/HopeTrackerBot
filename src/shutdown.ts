import { Client } from "discord.js";
import { Pool } from "pg";
import { Logger } from "./logger.js";

export class ShutdownManager {
  private client: Client;
  private pool: Pool;

  constructor(client: Client, pool: Pool) {
    this.client = client;
    this.pool = pool;
  }

  setup(): void {
    const shutdown = async (signal: string) => {
      Logger.info(`Received ${signal}. Shutting down gracefully...`);
      
      try {
        Logger.info("Destroying Discord client...");
        await this.client.destroy();
        Logger.info("Discord client destroyed.");

        Logger.info("Closing database pool...");
        await this.pool.end();
        Logger.info("Database pool closed.");

        Logger.info("Shutdown complete. Exiting.");
        process.exit(0);
      } catch (err) {
        Logger.error("Error during shutdown", err);
        process.exit(1);
      }
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  }
}
