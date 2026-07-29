import { randomUUID } from "node:crypto";

import {
  MAX_ROOM_PARTICIPANTS,
  PARTICIPANT_ROLES,
  PLAYBACK_STATUSES,
  type Participant,
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

export type JoinRoomResult = JoinRoomSuccess | JoinRoomFailure;

export class RoomService {
  public constructor(
    private readonly roomRepository: RoomRepository,
  ) {}

  public createRoom(input: CreateRoomInput): CreateRoomResult {
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

  public joinRoom(input: JoinRoomInput): JoinRoomResult {
    const room = this.roomRepository.findById(input.roomId);

    if (room === null) {
      return {
        success: false,
        code: "ROOM_NOT_FOUND",
        message: "The requested room does not exist.",
      };
    }

    if (room.participants.size >= MAX_ROOM_PARTICIPANTS) {
      return {
        success: false,
        code: "ROOM_FULL",
        message: "The room has reached its participant limit.",
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

    room.participants.set(participant.id, participant);
    room.roomVersion += 1;
    room.updatedAt = now;

    this.roomRepository.save(room);

    return {
      success: true,
      room,
      participant,
    };
  }
}