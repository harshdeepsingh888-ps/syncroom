import type { Socket } from "socket.io";
import { z } from "zod";

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

type RemoveParticipantSuccess = {
  success: true;
  roomId: string;
  roomVersion: number;
  removedParticipantId: string;
};

type RemoveParticipantFailure = {
  success: false;
  code:
    | "INVALID_PAYLOAD"
    | "ROOM_NOT_FOUND"
    | "PARTICIPANT_NOT_FOUND"
    | "REMOVE_FORBIDDEN"
    | "HOST_SELF_REMOVAL_FORBIDDEN";
  message: string;
};

type RemoveParticipantResponse =
  | RemoveParticipantSuccess
  | RemoveParticipantFailure;

type RoomCreateAck = (
  response: RoomCreateAckResponse,
) => void;

type RoomJoinAck = (
  response: RoomJoinAckResponse,
) => void;

type RemoveParticipantAck = (
  response: RemoveParticipantResponse,
) => void;

const removeParticipantPayloadSchema =
  z.object({
    roomId: z.string().trim().min(1),
    actorParticipantId:
      z.string().trim().min(1),
    targetParticipantId:
      z.string().trim().min(1),
  });

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
          message:
            "Display name is required.",
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
        displayName:
          participant.displayName,
        role: participant.role,
      }));

      ack({
        success: true,
        roomId: result.room.id,
        participantId:
          result.participant.id,
        role: result.participant.role,
        roomVersion:
          result.room.roomVersion,
        playback: result.room.playback,
        participants,
      });

      socket
        .to(result.room.id)
        .emit("participant:joined", {
          roomId: result.room.id,
          roomVersion:
            result.room.roomVersion,
          participant: {
            id: result.participant.id,
            displayName:
              result.participant
                .displayName,
            role:
              result.participant.role,
          },
        });
    },
  );

  socket.on(
    "room:remove-participant",
    async (
      payload: unknown,
      ack: RemoveParticipantAck,
    ): Promise<void> => {
      if (typeof ack !== "function") {
        socket.emit("realtime:error", {
          code: "ACK_REQUIRED",
          message:
            "Participant removal requires an acknowledgement callback.",
        });

        return;
      }

      const parsedPayload =
        removeParticipantPayloadSchema.safeParse(
          payload,
        );

      if (!parsedPayload.success) {
        ack({
          success: false,
          code: "INVALID_PAYLOAD",
          message:
            "Room ID, acting participant ID, and target participant ID are required.",
        });

        return;
      }

      const result =
        roomService.removeParticipant({
          ...parsedPayload.data,
          actorSocketId: socket.id,
        });

      if (!result.success) {
        ack({
          success: false,
          code: result.code,
          message: result.message,
        });

        return;
      }

      const removedParticipant =
        result.removedParticipant;

      const removalEvent = {
        roomId: result.room.id,
        roomVersion:
          result.room.roomVersion,
        participant: {
          id: removedParticipant.id,
          displayName:
            removedParticipant.displayName,
          role: removedParticipant.role,
        },
        removedByParticipantId:
          parsedPayload.data
            .actorParticipantId,
        reason: "removed_by_host",
      };

      const targetSocket =
        socket.nsp.sockets.get(
          removedParticipant.socketId,
        );

      if (targetSocket !== undefined) {
        targetSocket.emit(
          "participant:removed",
          removalEvent,
        );

        await targetSocket.leave(
          result.room.id,
        );
      }

      socket.nsp
        .to(result.room.id)
        .emit(
          "participant:removed",
          removalEvent,
        );

      ack({
        success: true,
        roomId: result.room.id,
        roomVersion:
          result.room.roomVersion,
        removedParticipantId:
          removedParticipant.id,
      });
    },
  );
}