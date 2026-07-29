import type { Server as HttpServer } from "node:http";

import pino from "pino";
import { Server } from "socket.io";

import { registerConnectionHandlers } from "./connection-handler.js";

import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from "./events.js";

import type { SyncRoomSocketServer } from "./socket-context.js";

const realtimeLogger = pino({
  name: "syncroom-realtime",
});

export function createSocketServer(
  httpServer: HttpServer,
): SyncRoomSocketServer {
  const io = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >(httpServer, {
    cors: {
      origin: true,
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    registerConnectionHandlers(socket, realtimeLogger);
  });

  return io;
}