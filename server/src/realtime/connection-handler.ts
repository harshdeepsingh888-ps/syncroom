import type { Logger } from "pino";

import {
  CLIENT_EVENTS,
  SERVER_EVENTS,
} from "./events.js";

import type { SyncRoomSocket } from "./socket-context.js";

export function registerConnectionHandlers(
  socket: SyncRoomSocket,
  logger: Logger,
): void {
  const connectedAt = new Date().toISOString();

  socket.data.connectedAt = connectedAt;

  logger.info(
    {
      socketId: socket.id,
      connectedAt,
      transport: socket.conn.transport.name,
      remoteAddress: socket.handshake.address,
    },
    "Socket connected",
  );

  socket.emit(SERVER_EVENTS.CONNECTION_READY, {
    socketId: socket.id,
    connectedAt,
  });

  socket.on(
    CLIENT_EVENTS.CONNECTION_PING,
    (payload, acknowledge) => {
      const receivedAt = new Date().toISOString();

      logger.debug(
        {
          socketId: socket.id,
          sentAt: payload.sentAt,
          receivedAt,
        },
        "Socket ping received",
      );

      acknowledge({
        ok: true,
        data: {
          sentAt: payload.sentAt,
          receivedAt,
        },
      });
    },
  );

  socket.on("disconnect", (reason) => {
    logger.info(
      {
        socketId: socket.id,
        connectedAt: socket.data.connectedAt,
        disconnectedAt: new Date().toISOString(),
        reason,
      },
      "Socket disconnected",
    );
  });

  socket.on("error", (error) => {
    logger.error(
      {
        err: error,
        socketId: socket.id,
      },
      "Socket error",
    );
  });
}