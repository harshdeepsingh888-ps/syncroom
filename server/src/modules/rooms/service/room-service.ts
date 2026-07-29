import { randomUUID } from "node:crypto";

import {
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
}