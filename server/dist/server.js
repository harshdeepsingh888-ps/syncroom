import { createServer } from "node:http";
import pino from "pino";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
const logger = pino({
    level: env.NODE_ENV === "production" ? "info" : "debug",
});
const app = createApp();
const httpServer = createServer(app);
httpServer.listen(env.PORT, () => {
    logger.info({
        port: env.PORT,
        environment: env.NODE_ENV,
        clientOrigin: env.CLIENT_ORIGIN,
    }, "SyncRoom server started");
});
function shutDown(signal) {
    logger.info({ signal }, "Server shutdown requested");
    httpServer.close((error) => {
        if (error) {
            logger.error({ error }, "Failed to close the HTTP server");
            process.exit(1);
        }
        logger.info("HTTP server closed");
        process.exit(0);
    });
}
process.on("SIGINT", shutDown);
process.on("SIGTERM", shutDown);
//# sourceMappingURL=server.js.map