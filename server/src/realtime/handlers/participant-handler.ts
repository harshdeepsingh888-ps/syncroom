import type { Logger } from "pino";
import type { Socket } from "socket.io";

import { roomService } from "../../modules/rooms/room-container.js";

export function registerParticipantHandlers(
  socket: Socket,
  logger: Logger,
): void {
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