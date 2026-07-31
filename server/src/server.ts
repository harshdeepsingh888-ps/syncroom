import "dotenv/config";
import { createServer } from "node:http";

import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { createSocketServer } from "./realtime/index.js";

const app = createApp();
const httpServer = createServer(app);
const io = createSocketServer(httpServer);

let isShuttingDown = false;

function shutdown(signal: NodeJS.Signals): void {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  console.info(`${signal} received. Shutting down gracefully.`);

  io.close(() => {
    httpServer.close((error) => {
      if (error) {
        console.error(
          "Failed to close the HTTP server cleanly.",
          error,
        );

        process.exitCode = 1;
        return;
      }

      console.info("HTTP and Socket.IO servers closed.");
      process.exitCode = 0;
    });
  });

  setTimeout(() => {
    console.error("Graceful shutdown timed out.");
    process.exit(1);
  }, 10_000).unref();
}

httpServer.listen(env.PORT, () => {
  console.info(
    `SyncRoom server listening on port ${env.PORT}.`,
  );
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);