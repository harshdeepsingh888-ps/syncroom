import { InMemoryRoomRepository } from "../../modules/rooms/repository/index.js";
import { RoomService } from "../../modules/rooms/service/index.js";

import type { Socket } from "socket.io";

const roomRepository = new InMemoryRoomRepository();
const roomService = new RoomService(roomRepository);

type CreateRoomPayload = {
  displayName: string;
};

type CreateRoomSuccess = {
  success: true;
  roomId: string;
  participantId: string;
};

type CreateRoomFailure = {
  success: false;
  message: string;
};

type CreateRoomAck = (
  response: CreateRoomSuccess | CreateRoomFailure,
) => void;

export function registerRoomHandlers(socket: Socket): void {
  socket.on(
    "room:create",
    (payload: CreateRoomPayload, ack: CreateRoomAck) => {
      const displayName = payload.displayName.trim();

      if (displayName.length === 0) {
        ack({
          success: false,
          message: "Display name is required.",
        });

        return;
      }

      const { room, host } = roomService.createRoom({
        socketId: socket.id,
        displayName,
      });

      ack({
        success: true,
        roomId: room.id,
        participantId: host.id,
      });
    },
  );
}