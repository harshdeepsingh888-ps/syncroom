import type { Logger } from "pino";
import type { Socket } from "socket.io";

import {
  registerParticipantHandlers,
  registerPlaybackHandlers,
  registerRoomHandlers,
} from "./handlers/index.js";

export function registerConnectionHandlers(
  socket: Socket,
  logger: Logger,
): void {
  logger.info(
    {
      event: "socket_connected",
      socketId: socket.id,
    },
    "Realtime client connected.",
  );

  registerRoomHandlers(socket);
  registerPlaybackHandlers(socket);

  registerParticipantHandlers(
    socket,
    logger,
  );
}