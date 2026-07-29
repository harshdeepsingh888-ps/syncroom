import type { Logger } from "pino";
import type { Socket } from "socket.io";

import {
  registerParticipantHandlers,
  registerPlaybackHandlers,
  registerRoomHandlers,
} from "./handlers/index.js";

export function registerConnectionHandlers(
  socket: Socket,
  _logger: Logger,
): void {
  registerRoomHandlers(socket);
  registerPlaybackHandlers(socket);
  registerParticipantHandlers(socket);
}