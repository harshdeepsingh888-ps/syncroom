import type { Logger } from "pino";
import type { Socket } from "socket.io";
import { z } from "zod";

import {
  PARTICIPANT_ROLES,
  type ParticipantRole,
} from "../../modules/rooms/domain/index.js";
import { roomService } from "../../modules/rooms/room-container.js";

const assignRolePayloadSchema = z.object({
  roomId: z.string().trim().min(1),
  actorParticipantId: z.string().trim().min(1),
  targetParticipantId: z.string().trim().min(1),
  role: z.enum([
    PARTICIPANT_ROLES.MODERATOR,
    PARTICIPANT_ROLES.PARTICIPANT,
  ]),
});

type AssignRoleSuccess = {
  success: true;
  roomId: string;
  roomVersion: number;
  participant: {
    id: string;
    displayName: string;
    role: "moderator" | "participant";
  };
};

type AssignRoleFailure = {
  success: false;
  code:
    | "INVALID_PAYLOAD"
    | "ROOM_NOT_FOUND"
    | "PARTICIPANT_NOT_FOUND"
    | "ROLE_FORBIDDEN"
    | "INVALID_ROLE_TARGET";
  message: string;
};

type AssignRoleResponse =
  | AssignRoleSuccess
  | AssignRoleFailure;

type AssignRoleAck = (
  response: AssignRoleResponse,
) => void;

const transferHostPayloadSchema = z.object({
  roomId: z.string().trim().min(1),
  actorParticipantId: z.string().trim().min(1),
  targetParticipantId: z.string().trim().min(1),
});

type TransferHostSuccessResponse = {
  success: true;
  roomId: string;
  roomVersion: number;
  newHost: {
    id: string;
    displayName: string;
    role: ParticipantRole;
  };
};

type TransferHostFailureResponse = {
  success: false;
  code:
    | "INVALID_PAYLOAD"
    | "ROOM_NOT_FOUND"
    | "PARTICIPANT_NOT_FOUND"
    | "TRANSFER_FORBIDDEN"
    | "INVALID_TRANSFER_TARGET";
  message: string;
};

type TransferHostResponse =
  | TransferHostSuccessResponse
  | TransferHostFailureResponse;

type TransferHostAck = (
  response: TransferHostResponse,
) => void;

export function registerParticipantHandlers(
  socket: Socket,
  logger: Logger,
): void {
  socket.on(
    "room:assign-role",
    (payload: unknown, ack: unknown): void => {
      const acknowledge =
        getAssignRoleAck(ack);

      if (acknowledge === null) {
        socket.emit("realtime:error", {
          code: "ACK_REQUIRED",
          message:
            "Role assignment requires an acknowledgement callback.",
        });

        return;
      }

      const parsedPayload =
        assignRolePayloadSchema.safeParse(
          payload,
        );

      if (!parsedPayload.success) {
        acknowledge({
          success: false,
          code: "INVALID_PAYLOAD",
          message:
            "Room ID, acting participant ID, target participant ID, and a valid assignable role are required.",
        });

        return;
      }

      const result =
        roomService.assignParticipantRole({
          ...parsedPayload.data,
          actorSocketId: socket.id,
        });

      if (!result.success) {
        acknowledge({
          success: false,
          code: result.code,
          message: result.message,
        });

        return;
      }

      const roleUpdatedEvent = {
        roomId: result.room.id,
        roomVersion:
          result.room.roomVersion,
        participant: {
          id: result.participant.id,
          displayName:
            result.participant.displayName,
          role: result.participant.role as
            | "moderator"
            | "participant",
        },
      };

      acknowledge({
        success: true,
        ...roleUpdatedEvent,
      });

      socket.nsp
        .to(result.room.id)
        .emit(
          "participant:role-updated",
          roleUpdatedEvent,
        );

      logger.info(
        {
          event:
            "participant_role_updated",
          roomId: result.room.id,
          actorParticipantId:
            parsedPayload.data
              .actorParticipantId,
          targetParticipantId:
            result.participant.id,
          role: result.participant.role,
          roomVersion:
            result.room.roomVersion,
        },
        "Participant role updated.",
      );
    },
  );

  socket.on(
    "room:transfer-host",
    (payload: unknown, ack: unknown): void => {
      const acknowledge =
        getTransferHostAck(ack);

      if (acknowledge === null) {
        socket.emit("realtime:error", {
          code: "ACK_REQUIRED",
          message:
            "Host transfer requires an acknowledgement callback.",
        });

        return;
      }

      const parsedPayload =
        transferHostPayloadSchema.safeParse(
          payload,
        );

      if (!parsedPayload.success) {
        acknowledge({
          success: false,
          code: "INVALID_PAYLOAD",
          message:
            "Room ID, acting participant ID, and target participant ID are required.",
        });

        return;
      }

      const result =
        roomService.transferHost({
          ...parsedPayload.data,
          actorSocketId: socket.id,
        });

      if (!result.success) {
        acknowledge({
          success: false,
          code: result.code,
          message: result.message,
        });

        return;
      }

      acknowledge({
        success: true,
        roomId: result.room.id,
        roomVersion: result.room.roomVersion,
        newHost: {
          id: result.newHost.id,
          displayName: result.newHost.displayName,
          role: result.newHost.role,
        },
      });

      const hostTransferredEvent = {
        roomId: result.room.id,
        roomVersion: result.room.roomVersion,
        previousHostParticipantId:
          result.previousHost.id,
        newHost: {
          id: result.newHost.id,
          displayName: result.newHost.displayName,
          role: result.newHost.role,
        },
      };

      socket.nsp
        .to(result.room.id)
        .emit(
          "host:transferred",
          hostTransferredEvent,
        );

      socket.nsp
        .to(result.room.id)
        .emit(
          "participant:list-updated",
          {
            roomId: result.room.id,
            roomVersion: result.room.roomVersion,
            participants: Array.from(
              result.room.participants.values(),
            ),
          },
        );

      logger.info(
        {
          event: "host_transferred_manually",
          roomId: result.room.id,
          previousHostParticipantId:
            result.previousHost.id,
          newHostParticipantId:
            result.newHost.id,
          roomVersion: result.room.roomVersion,
        },
        "Room host transferred manually.",
      );
    },
  );

  socket.on("disconnect", (reason) => {
    const result =
      roomService.disconnectParticipant({
        socketId: socket.id,
      });

    for (const update of result.updatedRooms) {
      const participantLeftEvent = {
        roomId: update.room.id,
        roomVersion:
          update.room.roomVersion,
        participant: {
          id: update.participant.id,
          displayName:
            update.participant.displayName,
          role: update.participant.role,
        },
        disconnectedAt:
          update.participant.disconnectedAt,
      };

      socket.nsp
        .to(update.room.id)
        .emit(
          "participant:left",
          participantLeftEvent,
        );

      logger.info(
        {
          event: "participant_left",
          socketId: socket.id,
          roomId: update.room.id,
          participantId:
            update.participant.id,
          disconnectReason: reason,
          roomVersion:
            update.room.roomVersion,
        },
        "Participant disconnected from room.",
      );

      if (update.newHost !== null) {
        const hostTransferredEvent = {
          roomId: update.room.id,
          roomVersion:
            update.room.roomVersion,
          previousHostParticipantId:
            update.previousHostParticipantId,
          newHost: {
            id: update.newHost.id,
            displayName:
              update.newHost.displayName,
            role: update.newHost.role,
          },
        };

        socket.nsp
          .to(update.room.id)
          .emit(
            "host:transferred",
            hostTransferredEvent,
          );

        logger.info(
          {
            event: "host_transferred",
            roomId: update.room.id,
            previousHostParticipantId:
              update.previousHostParticipantId,
            newHostParticipantId:
              update.newHost.id,
            roomVersion:
              update.room.roomVersion,
          },
          "Room host transferred.",
        );
      }
    }

    for (const roomId of result.deletedRoomIds) {
      logger.info(
        {
          event: "room_deleted",
          roomId,
          socketId: socket.id,
          reason: "room_empty",
        },
        "Empty room deleted after participant disconnect.",
      );
    }
  });
}

function getAssignRoleAck(
  value: unknown,
): AssignRoleAck | null {
  if (typeof value !== "function") {
    return null;
  }

  return value as AssignRoleAck;
}

function getTransferHostAck(
  value: unknown,
): TransferHostAck | null {
  if (typeof value !== "function") {
    return null;
  }

  return value as TransferHostAck;
}