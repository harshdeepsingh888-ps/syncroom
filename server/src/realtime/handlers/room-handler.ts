import type { Socket } from "socket.io";

import { roomService } from "../../modules/rooms/room-container.js";
import type {
  ParticipantRole,
  PlaybackState,
} from "../../modules/rooms/domain/index.js";

type CreateRoomPayload = {
  displayName: string;
};

type JoinRoomPayload = {
  roomId: string;
  displayName: string;
};

type RoomCreateAckResponse =
  | {
      success: true;
      roomId: string;
      participantId: string;
      roomVersion: number;
    }
  | {
      success: false;
      code: "INVALID_PAYLOAD";
      message: string;
    };

type RoomJoinAckResponse =
  | {
      success: true;
      roomId: string;
      participantId: string;
      role: ParticipantRole;
      roomVersion: number;
      playback: PlaybackState;
      participants: Array<{
        id: string;
        displayName: string;
        role: ParticipantRole;
      }>;
    }
  | {
      success: false;
      code:
        | "INVALID_PAYLOAD"
        | "ROOM_NOT_FOUND"
        | "ROOM_FULL";
      message: string;
    };

type RoomCreateAck = (
  response: RoomCreateAckResponse,
) => void;

type RoomJoinAck = (
  response: RoomJoinAckResponse,
) => void;

export function registerRoomHandlers(
  socket: Socket,
): void {
  socket.on(
    "room:create",
    async (
      payload: CreateRoomPayload,
      ack: RoomCreateAck,
    ): Promise<void> => {
      const displayName =
        payload?.displayName?.trim();

      if (!displayName) {
        ack({
          success: false,
          code: "INVALID_PAYLOAD",
          message: "Display name is required.",
        });

        return;
      }

      const { room, host } =
        roomService.createRoom({
          socketId: socket.id,
          displayName,
        });

      await socket.join(room.id);

      ack({
        success: true,
        roomId: room.id,
        participantId: host.id,
        roomVersion: room.roomVersion,
      });
    },
  );

  socket.on(
    "room:join",
    async (
      payload: JoinRoomPayload,
      ack: RoomJoinAck,
    ): Promise<void> => {
      const roomId = payload?.roomId?.trim();
      const displayName =
        payload?.displayName?.trim();

      if (!roomId || !displayName) {
        ack({
          success: false,
          code: "INVALID_PAYLOAD",
          message:
            "Room ID and display name are required.",
        });

        return;
      }

      const result = roomService.joinRoom({
        roomId,
        socketId: socket.id,
        displayName,
      });

      if (!result.success) {
        ack({
          success: false,
          code: result.code,
          message: result.message,
        });

        return;
      }

      await socket.join(result.room.id);

      const participants = Array.from(
        result.room.participants.values(),
      ).map((participant) => ({
        id: participant.id,
        displayName: participant.displayName,
        role: participant.role,
      }));

      ack({
        success: true,
        roomId: result.room.id,
        participantId: result.participant.id,
        role: result.participant.role,
        roomVersion: result.room.roomVersion,
        playback: result.room.playback,
        participants,
      });

      socket
        .to(result.room.id)
        .emit("participant:joined", {
          roomId: result.room.id,
          roomVersion: result.room.roomVersion,
          participant: {
            id: result.participant.id,
            displayName:
              result.participant.displayName,
            role: result.participant.role,
          },
        });
    },
  );
}