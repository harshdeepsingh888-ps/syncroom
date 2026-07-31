import cors from "cors";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import helmet from "helmet";
import pino from "pino";
import { pinoHttp } from "pino-http";

import { env } from "./config/env.js";
import { youtubeRouter } from "./routes/youtube-router.js";

const logger = pino({
  name: "syncroom-server",
});

export function createApp(): express.Express {
  const app = express();

  app.disable("x-powered-by");

  app.use(
    pinoHttp({
      logger,
    }),
  );

  app.use(helmet());

  app.use(
    cors({
      origin: env.CLIENT_ORIGIN,
      credentials: true,
    }),
  );

  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_request: Request, response: Response) => {
    response.status(200).json({
      status: "ok",
      service: "syncroom-server",
      timestamp: new Date().toISOString(),
    });
  });

  app.use("/api/youtube", youtubeRouter);

  app.use((_request: Request, response: Response) => {
    response.status(404).json({
      error: {
        code: "ROUTE_NOT_FOUND",
        message: "The requested route does not exist.",
      },
    });
  });

  app.use(
    (
      error: unknown,
      request: Request,
      response: Response,
      _next: NextFunction,
    ) => {
      request.log.error(
        {
          err: error,
          method: request.method,
          url: request.originalUrl,
        },
        "Unhandled request error",
      );

      response.status(500).json({
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "An unexpected server error occurred.",
        },
      });
      app.get("/version", (_request, response) => {
  response.json({
    version: "submission-polish",
    deployedAt: new Date().toISOString(),
  });
});
    },
  );

  return app;
}