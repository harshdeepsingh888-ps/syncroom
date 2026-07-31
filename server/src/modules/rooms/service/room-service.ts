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
  actorSocketId: string;
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

export type ChangeVideoInput = {
  roomId: string;
  participantId: string;
  actorSocketId: string;
  videoId: string;
};

export type ChangeVideoSuccess = {
  success: true;
  room: Room;
};

export type ChangeVideoFailure = {
  success: false;
  code:
    | "ROOM_NOT_FOUND"
    | "PARTICIPANT_NOT_FOUND"
    | "PLAYBACK_FORBIDDEN"
    | "INVALID_VIDEO_ID";
  message: string;
};

export type ChangeVideoResult =
  | ChangeVideoSuccess
  | ChangeVideoFailure;

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

export type RemoveParticipantInput = {
  roomId: string;
  actorParticipantId: string;
  actorSocketId: string;
  targetParticipantId: string;
};

export type RemoveParticipantSuccess = {
  success: true;
  room: Room;
  removedParticipant: Participant;
};

export type RemoveParticipantFailure = {
  success: false;
  code:
    | "ROOM_NOT_FOUND"
    | "PARTICIPANT_NOT_FOUND"
    | "REMOVE_FORBIDDEN"
    | "HOST_SELF_REMOVAL_FORBIDDEN";
  message: string;
};

export type RemoveParticipantResult =
  | RemoveParticipantSuccess
  | RemoveParticipantFailure;

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

    const now = new Date();

    /*
     * Materialise the server-authoritative playback
     * position before returning the room to a late
     * joiner.
     *
     * Example:
     * stored position = 4 seconds
     * updated 30 seconds ago
     * current authoritative position = 34 seconds
     */
    this.materializePlaybackPosition(
      room.playback,
      now,
    );

    const nowIso = now.toISOString();

    const participant: Participant = {
      id: randomUUID(),
      socketId: input.socketId,
      displayName: input.displayName,
      role: PARTICIPANT_ROLES.PARTICIPANT,
      joinedAt: nowIso,
      disconnectedAt: null,
    };

    room.participants.set(
      participant.id,
      participant,
    );

    room.roomVersion += 1;
    room.updatedAt = nowIso;

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

  public changeVideo(
    input: ChangeVideoInput,
  ): ChangeVideoResult {
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

    if (
      participant.socketId !==
      input.actorSocketId
    ) {
      return {
        success: false,
        code: "PLAYBACK_FORBIDDEN",
        message:
          "The connected socket is not authorized to act as this participant.",
      };
    }

    const canChangeVideo =
      participant.id ===
        room.hostParticipantId ||
      participant.role ===
        PARTICIPANT_ROLES.MODERATOR;

    if (!canChangeVideo) {
      return {
        success: false,
        code: "PLAYBACK_FORBIDDEN",
        message:
          "Only the room host or a moderator can change the shared video.",
      };
    }

    const videoId = input.videoId.trim();

    if (videoId.length === 0) {
      return {
        success: false,
        code: "INVALID_VIDEO_ID",
        message: "Video ID is required.",
      };
    }

    const now = new Date().toISOString();

    room.playback.videoId = videoId;
    room.playback.positionSeconds = 0;
    room.playback.status =
      PLAYBACK_STATUSES.PAUSED;
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

  public removeParticipant(
    input: RemoveParticipantInput,
  ): RemoveParticipantResult {
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

    const isConnectedHost =
      actor.id === room.hostParticipantId &&
      actor.socketId === input.actorSocketId;

    if (!isConnectedHost) {
      return {
        success: false,
        code: "REMOVE_FORBIDDEN",
        message:
          "Only the connected room host can remove participants.",
      };
    }

    if (
      target.id === room.hostParticipantId
    ) {
      return {
        success: false,
        code:
          "HOST_SELF_REMOVAL_FORBIDDEN",
        message:
          "The room host cannot remove themselves.",
      };
    }

    room.participants.delete(target.id);

    const now = new Date().toISOString();

    target.disconnectedAt = now;

    room.roomVersion += 1;
    room.updatedAt = now;

    this.roomRepository.save(room);

    return {
      success: true,
      room,
      removedParticipant: target,
    };
  }

  public disconnectParticipant(
    input: DisconnectParticipantInput,
  ): DisconnectParticipantResult {
    const updatedRooms: ParticipantDisconnectedRoomUpdate[] =
      [];

    const deletedRoomIds: string[] = [];

    const rooms =
      this.roomRepository.findAll();

    for (const room of rooms) {
      const disconnectedParticipant =
        this.findParticipantBySocketId(
          room,
          input.socketId,
        );

      if (
        disconnectedParticipant === null
      ) {
        continue;
      }

      const previousHostParticipantId =
        room.hostParticipantId;

      room.participants.delete(
        disconnectedParticipant.id,
      );

      if (
        room.participants.size === 0
      ) {
        this.roomRepository.deleteById(
          room.id,
        );

        deletedRoomIds.push(room.id);

        continue;
      }

      const now = new Date().toISOString();

      disconnectedParticipant.disconnectedAt =
        now;

      let newHost: Participant | null =
        null;

      if (
        disconnectedParticipant.id ===
        previousHostParticipantId
      ) {
        newHost =
          this.selectNextHost(room);

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

    if (
      participant.socketId !==
      input.actorSocketId
    ) {
      return {
        success: false,
        code: "PLAYBACK_FORBIDDEN",
        message:
          "The connected socket is not authorized to act as this participant.",
      };
    }

    const now = new Date();
    const nowIso = now.toISOString();

    /*
     * The command position comes from the active
     * controller's real player and becomes the new
     * authoritative timeline anchor.
     */
    room.playback.positionSeconds =
      sanitizePosition(
        mutation.positionSeconds,
      );

    if (
      mutation.status !== undefined
    ) {
      room.playback.status =
        mutation.status;
    }

    room.playback.updatedAt = nowIso;
    room.playback.updatedByParticipantId =
      participant.id;

    room.roomVersion += 1;
    room.updatedAt = nowIso;

    this.roomRepository.save(room);

    return {
      success: true,
      room,
    };
  }

  /**
   * Converts the stored playback anchor into the
   * current server-authoritative position.
   *
   * We only advance the timeline while playback is
   * marked as playing. Paused playback remains fixed.
   */
  private materializePlaybackPosition(
    playback: PlaybackState,
    now: Date,
  ): void {
    const authoritativePosition =
      calculateAuthoritativePosition(
        playback,
        now,
      );

    playback.positionSeconds =
      authoritativePosition;

    /*
     * Reset the time anchor after materialisation.
     * Future calculations advance from this moment
     * rather than counting the same elapsed period
     * twice.
     */
    playback.updatedAt =
      now.toISOString();
  }

  private findParticipantBySocketId(
    room: Room,
    socketId: string,
  ): Participant | null {
    for (
      const participant of
      room.participants.values()
    ) {
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

/**
 * Computes where the shared timeline should be at
 * the supplied server time.
 *
 * The stored position is an anchor, not a value that
 * must be rewritten every second.
 */
export function calculateAuthoritativePosition(
  playback: PlaybackState,
  now: Date = new Date(),
): number {
  const storedPosition = sanitizePosition(
    playback.positionSeconds,
  );

  if (
    playback.status !==
    PLAYBACK_STATUSES.PLAYING
  ) {
    return storedPosition;
  }

  const updatedAtMilliseconds =
    Date.parse(playback.updatedAt);

  if (
    !Number.isFinite(
      updatedAtMilliseconds,
    )
  ) {
    return storedPosition;
  }

  const elapsedMilliseconds = Math.max(
    0,
    now.getTime() -
      updatedAtMilliseconds,
  );

  const elapsedSeconds =
    elapsedMilliseconds / 1_000;

  const playbackRate =
    Number.isFinite(
      playback.playbackRate,
    ) &&
    playback.playbackRate > 0
      ? playback.playbackRate
      : 1;

  return sanitizePosition(
    storedPosition +
      elapsedSeconds * playbackRate,
  );
}

function sanitizePosition(
  positionSeconds: number,
): number {
  if (
    !Number.isFinite(positionSeconds)
  ) {
    return 0;
  }

  return Math.max(0, positionSeconds);
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

  return first.id.localeCompare(
    second.id,
  );
}