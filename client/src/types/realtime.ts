export type ParticipantRole =
  | "host"
  | "moderator"
  | "participant";

export type PlaybackStatus =
  | "playing"
  | "paused";

export type Participant = {
  id: string;
  displayName: string;
  role: ParticipantRole;
};

export type PlaybackSnapshot = {
  videoId: string | null;
  status: PlaybackStatus;
  positionSeconds: number;
  playbackRate: number;
  updatedAt: string;
};

export type ActiveRoom = {
  roomId: string;
  participantId: string;
  role: ParticipantRole;
  roomVersion: number;
  playback: PlaybackSnapshot;
  participants: Participant[];
};

export type CreateRoomPayload = {
  displayName: string;
};

export type CreateRoomResponse =
  | {
      success: true;
      roomId: string;
      participantId: string;
      roomVersion: number;
    }
  | {
      success: false;
      code: string;
      message: string;
    };

export type JoinRoomPayload = {
  roomId: string;
  displayName: string;
};

export type JoinRoomResponse =
  | {
      success: true;
      roomId: string;
      participantId: string;
      role: ParticipantRole;
      roomVersion: number;
      playback: PlaybackSnapshot;
      participants: Participant[];
    }
  | {
      success: false;
      code: string;
      message: string;
    };

export type PlaybackCommandPayload = {
  roomId: string;
  participantId: string;
  positionSeconds: number;
};

export type PlaybackCommandResponse =
  | {
      success: true;
      roomId: string;
      roomVersion: number;
      playback: PlaybackSnapshot;
    }
  | {
      success: false;
      code: string;
      message: string;
    };

export type ChangeVideoPayload = {
  roomId: string;
  participantId: string;
  videoId: string;
};

export type ChangeVideoResponse =
  | {
      success: true;
      roomId: string;
      roomVersion: number;
      playback: PlaybackSnapshot;
    }
  | {
      success: false;
      code: string;
      message: string;
    };

export type AssignRolePayload = {
  roomId: string;
  actorParticipantId: string;
  targetParticipantId: string;
  role: Extract<
    ParticipantRole,
    "moderator" | "participant"
  >;
};

export type AssignRoleResponse =
  | {
      success: true;
      roomId: string;
      roomVersion: number;
      participant: Participant;
    }
  | {
      success: false;
      code: string;
      message: string;
    };

export type RemoveParticipantPayload = {
  roomId: string;
  actorParticipantId: string;
  targetParticipantId: string;
};

export type RemoveParticipantResponse =
  | {
      success: true;
      roomId: string;
      roomVersion: number;
      removedParticipant: Participant;
    }
  | {
      success: false;
      code: string;
      message: string;
    };

export type PlaybackUpdatedEvent = {
  roomId: string;
  roomVersion: number;
  playback: PlaybackSnapshot;
};

export type VideoChangedEvent = {
  roomId: string;
  roomVersion: number;
  playback: PlaybackSnapshot;
};

export type ParticipantJoinedEvent = {
  roomId: string;
  roomVersion: number;
  participant: Participant;
};

export type ParticipantLeftEvent = {
  roomId: string;
  roomVersion: number;
  participant: Participant;
  disconnectedAt: string | null;
};

export type ParticipantRoleUpdatedEvent = {
  roomId: string;
  roomVersion: number;
  participant: Participant;
};

export type ParticipantRemovedEvent = {
  roomId: string;
  roomVersion: number;
  participant: Participant;
};

export type HostTransferredEvent = {
  roomId: string;
  roomVersion: number;
  previousHostParticipantId: string;
  newHost: Participant;
};

export type RealtimeErrorEvent = {
  code: string;
  message: string;
};
