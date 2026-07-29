import cors from "cors";
import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";

import { env } from "./config/env.js";

export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");

  app.use(
    pinoHttp({
      quietReqLogger: true,
    }),
  );

  app.use(helmet());

  app.use(
    cors({
      origin: env.CLIENT_ORIGIN,
      methods: ["GET", "POST"],
    }),
  );

  app.use(express.json({ limit: "100kb" }));

  app.get("/health", (_request: Request, response: Response) => {
    response.status(200).json({
      status: "ok",
      service: "syncroom-server",
      timestamp: new Date().toISOString(),
    });
  });

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
          error,
          method: request.method,
          path: request.path,
        },
        "Unhandled request error",
      );

      response.status(500).json({
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected server error occurred.",
        },
      });
    },
  );

  return app;
}