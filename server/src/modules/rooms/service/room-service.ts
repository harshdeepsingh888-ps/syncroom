import { randomUUID } from "node:crypto";

import {
  MAX_ROOM_PARTICIPANTS,
  PARTICIPANT_ROLES,
  PLAYBACK_STATUSES,
  type Participant,
  type ParticipantRole,
  type PlaybackState,
  type Room,
} from "../domain/index.js";

import type { RoomRepository } from "../repository/index.js";

export type CreateRoomInput = {
  socketId: string;
  displayName: string;
};

export type CreateRoomResult = {
  room: Room;
  host: Participant;
};

export type JoinRoomInput = {
  roomId: string;
  socketId: string;
  displayName: string;
};

export type JoinRoomSuccess = {
  success: true;
  room: Room;
  participant: Participant;
};

export type JoinRoomFailure = {
  success: false;
  code: "ROOM_NOT_FOUND" | "ROOM_FULL";
  message: string;
};

export type JoinRoomResult =
  | JoinRoomSuccess
  | JoinRoomFailure;

export type UpdatePlaybackInput = {
  roomId: string;
  participantId: string;
  positionSeconds: number;
};

export type UpdatePlaybackSuccess = {
  success: true;
  room: Room;
};

export type UpdatePlaybackFailure = {
  success: false;
  code:
    | "ROOM_NOT_FOUND"
    | "PARTICIPANT_NOT_FOUND"
    | "PLAYBACK_FORBIDDEN";
  message: string;
};

export type UpdatePlaybackResult =
  | UpdatePlaybackSuccess
  | UpdatePlaybackFailure;

export type AssignParticipantRoleInput = {
  roomId: string;
  actorParticipantId: string;
  actorSocketId: string;
  targetParticipantId: string;
  role: Extract<
    ParticipantRole,
    "moderator" | "participant"
  >;
};

export type AssignParticipantRoleSuccess = {
  success: true;
  room: Room;
  participant: Participant;
};

export type AssignParticipantRoleFailure = {
  success: false;
  code:
    | "ROOM_NOT_FOUND"
    | "PARTICIPANT_NOT_FOUND"
    | "ROLE_FORBIDDEN"
    | "INVALID_ROLE_TARGET";
  message: string;
};

export type AssignParticipantRoleResult =
  | AssignParticipantRoleSuccess
  | AssignParticipantRoleFailure;

export type DisconnectParticipantInput = {
  socketId: string;
};

export type ParticipantDisconnectedRoomUpdate = {
  room: Room;
  participant: Participant;
  previousHostParticipantId: string;
  newHost: Participant | null;
};

export type DisconnectParticipantResult = {
  updatedRooms: ParticipantDisconnectedRoomUpdate[];
  deletedRoomIds: string[];
};

type PlaybackMutation = {
  status?: PlaybackState["status"];
  positionSeconds: number;
};

export class RoomService {
  public constructor(
    private readonly roomRepository: RoomRepository,
  ) {}

  public createRoom(
    input: CreateRoomInput,
  ): CreateRoomResult {
    const now = new Date().toISOString();
    const participantId = randomUUID();
    const roomId = randomUUID();

    const host: Participant = {
      id: participantId,
      socketId: input.socketId,
      displayName: input.displayName,
      role: PARTICIPANT_ROLES.HOST,
      joinedAt: now,
      disconnectedAt: null,
    };

    const room: Room = {
      id: roomId,
      hostParticipantId: participantId,
      participants: new Map([
        [participantId, host],
      ]),
      playback: {
        videoId: null,
        status: PLAYBACK_STATUSES.PAUSED,
        positionSeconds: 0,
        playbackRate: 1,
        updatedAt: now,
        updatedByParticipantId: null,
      },
      roomVersion: 1,
      createdAt: now,
      updatedAt: now,
    };

    this.roomRepository.save(room);

    return {
      room,
      host,
    };
  }

  public joinRoom(
    input: JoinRoomInput,
  ): JoinRoomResult {
    const room = this.roomRepository.findById(
      input.roomId,
    );

    if (room === null) {
      return {
        success: false,
        code: "ROOM_NOT_FOUND",
        message:
          "The requested room does not exist.",
      };
    }

    if (
      room.participants.size >=
      MAX_ROOM_PARTICIPANTS
    ) {
      return {
        success: false,
        code: "ROOM_FULL",
        message:
          "The room has reached its participant limit.",
      };
    }

    const now = new Date().toISOString();

    const participant: Participant = {
      id: randomUUID(),
      socketId: input.socketId,
      displayName: input.displayName,
      role: PARTICIPANT_ROLES.PARTICIPANT,
      joinedAt: now,
      disconnectedAt: null,
    };

    room.participants.set(
      participant.id,
      participant,
    );

    room.roomVersion += 1;
    room.updatedAt = now;

    this.roomRepository.save(room);

    return {
      success: true,
      room,
      participant,
    };
  }

  public play(
    input: UpdatePlaybackInput,
  ): UpdatePlaybackResult {
    return this.updatePlayback(input, {
      status: PLAYBACK_STATUSES.PLAYING,
      positionSeconds: input.positionSeconds,
    });
  }

  public pause(
    input: UpdatePlaybackInput,
  ): UpdatePlaybackResult {
    return this.updatePlayback(input, {
      status: PLAYBACK_STATUSES.PAUSED,
      positionSeconds: input.positionSeconds,
    });
  }

  public seek(
    input: UpdatePlaybackInput,
  ): UpdatePlaybackResult {
    return this.updatePlayback(input, {
      positionSeconds: input.positionSeconds,
    });
  }

  public assignParticipantRole(
    input: AssignParticipantRoleInput,
  ): AssignParticipantRoleResult {
    const room = this.roomRepository.findById(
      input.roomId,
    );

    if (room === null) {
      return {
        success: false,
        code: "ROOM_NOT_FOUND",
        message:
          "The requested room does not exist.",
      };
    }

    const actor = room.participants.get(
      input.actorParticipantId,
    );

    const target = room.participants.get(
      input.targetParticipantId,
    );

    if (
      actor === undefined ||
      target === undefined
    ) {
      return {
        success: false,
        code: "PARTICIPANT_NOT_FOUND",
        message:
          "The acting or target participant does not belong to this room.",
      };
    }

    if (
      actor.id !== room.hostParticipantId ||
      actor.socketId !== input.actorSocketId
    ) {
      return {
        success: false,
        code: "ROLE_FORBIDDEN",
        message:
          "Only the connected room host can assign participant roles.",
      };
    }

    if (
      target.id === room.hostParticipantId ||
      target.role === PARTICIPANT_ROLES.HOST
    ) {
      return {
        success: false,
        code: "INVALID_ROLE_TARGET",
        message:
          "The room host role cannot be changed through role assignment.",
      };
    }

    if (target.role === input.role) {
      return {
        success: true,
        room,
        participant: target,
      };
    }

    const now = new Date().toISOString();

    target.role = input.role;
    room.roomVersion += 1;
    room.updatedAt = now;

    this.roomRepository.save(room);

    return {
      success: true,
      room,
      participant: target,
    };
  }

  public disconnectParticipant(
    input: DisconnectParticipantInput,
  ): DisconnectParticipantResult {
    const updatedRooms: ParticipantDisconnectedRoomUpdate[] =
      [];

    const deletedRoomIds: string[] = [];

    const rooms = this.roomRepository.findAll();

    for (const room of rooms) {
      const disconnectedParticipant =
        this.findParticipantBySocketId(
          room,
          input.socketId,
        );

      if (disconnectedParticipant === null) {
        continue;
      }

      const previousHostParticipantId =
        room.hostParticipantId;

      room.participants.delete(
        disconnectedParticipant.id,
      );

      if (room.participants.size === 0) {
        this.roomRepository.deleteById(room.id);
        deletedRoomIds.push(room.id);

        continue;
      }

      const now = new Date().toISOString();

      disconnectedParticipant.disconnectedAt =
        now;

      let newHost: Participant | null = null;

      if (
        disconnectedParticipant.id ===
        previousHostParticipantId
      ) {
        newHost = this.selectNextHost(room);

        if (newHost !== null) {
          newHost.role =
            PARTICIPANT_ROLES.HOST;

          room.hostParticipantId =
            newHost.id;
        }
      }

      room.roomVersion += 1;
      room.updatedAt = now;

      this.roomRepository.save(room);

      updatedRooms.push({
        room,
        participant:
          disconnectedParticipant,
        previousHostParticipantId,
        newHost,
      });
    }

    return {
      updatedRooms,
      deletedRoomIds,
    };
  }

  private updatePlayback(
    input: UpdatePlaybackInput,
    mutation: PlaybackMutation,
  ): UpdatePlaybackResult {
    const room = this.roomRepository.findById(
      input.roomId,
    );

    if (room === null) {
      return {
        success: false,
        code: "ROOM_NOT_FOUND",
        message:
          "The requested room does not exist.",
      };
    }

    const participant =
      room.participants.get(
        input.participantId,
      );

    if (participant === undefined) {
      return {
        success: false,
        code: "PARTICIPANT_NOT_FOUND",
        message:
          "The participant does not belong to this room.",
      };
    }

    const canControlPlayback =
      participant.id ===
        room.hostParticipantId ||
      participant.role ===
        PARTICIPANT_ROLES.MODERATOR;

    if (!canControlPlayback) {
      return {
        success: false,
        code: "PLAYBACK_FORBIDDEN",
        message:
          "Only the room host or a moderator can control playback.",
      };
    }

    const now = new Date().toISOString();

    if (mutation.status !== undefined) {
      room.playback.status =
        mutation.status;
    }

    room.playback.positionSeconds =
      Math.max(
        0,
        mutation.positionSeconds,
      );

    room.playback.updatedAt = now;
    room.playback.updatedByParticipantId =
      participant.id;

    room.roomVersion += 1;
    room.updatedAt = now;

    this.roomRepository.save(room);

    return {
      success: true,
      room,
    };
  }

  private findParticipantBySocketId(
    room: Room,
    socketId: string,
  ): Participant | null {
    for (const participant of room.participants.values()) {
      if (
        participant.socketId ===
        socketId
      ) {
        return participant;
      }
    }

    return null;
  }

  private selectNextHost(
    room: Room,
  ): Participant | null {
    const participants = Array.from(
      room.participants.values(),
    );

    const moderators = participants
      .filter(
        (participant) =>
          participant.role ===
          PARTICIPANT_ROLES.MODERATOR,
      )
      .sort(compareParticipantsByJoinTime);

    if (moderators.length > 0) {
      return moderators[0] ?? null;
    }

    const remainingParticipants =
      participants.sort(
        compareParticipantsByJoinTime,
      );

    return (
      remainingParticipants[0] ?? null
    );
  }
}

function compareParticipantsByJoinTime(
  first: Participant,
  second: Participant,
): number {
  const joinedAtDifference =
    new Date(first.joinedAt).getTime() -
    new Date(second.joinedAt).getTime();

  if (joinedAtDifference !== 0) {
    return joinedAtDifference;
  }

  return first.id.localeCompare(second.id);
}