import {
  io,
  type Socket,
} from "socket.io-client";

import type {
  AssignRolePayload,
  AssignRoleResponse,
  ChangeVideoPayload,
  ChangeVideoResponse,
  CreateRoomPayload,
  CreateRoomResponse,
  HostTransferredEvent,
  JoinRoomPayload,
  JoinRoomResponse,
  ParticipantJoinedEvent,
  ParticipantLeftEvent,
  ParticipantRemovedEvent,
  ParticipantRoleUpdatedEvent,
  PlaybackCommandPayload,
  PlaybackCommandResponse,
  PlaybackUpdatedEvent,
  RealtimeErrorEvent,
  RemoveParticipantPayload,
  RemoveParticipantResponse,
  VideoChangedEvent,
} from "../types/realtime";

type ClientToServerEvents = {
  "room:create": (
    payload: CreateRoomPayload,
    acknowledge: (
      response: CreateRoomResponse,
    ) => void,
  ) => void;

  "room:join": (
    payload: JoinRoomPayload,
    acknowledge: (
      response: JoinRoomResponse,
    ) => void,
  ) => void;

  "room:play": (
    payload: PlaybackCommandPayload,
    acknowledge: (
      response: PlaybackCommandResponse,
    ) => void,
  ) => void;

  "room:pause": (
    payload: PlaybackCommandPayload,
    acknowledge: (
      response: PlaybackCommandResponse,
    ) => void,
  ) => void;

  "room:seek": (
    payload: PlaybackCommandPayload,
    acknowledge: (
      response: PlaybackCommandResponse,
    ) => void,
  ) => void;

  "room:change-video": (
    payload: ChangeVideoPayload,
    acknowledge: (
      response: ChangeVideoResponse,
    ) => void,
  ) => void;

  "room:assign-role": (
    payload: AssignRolePayload,
    acknowledge: (
      response: AssignRoleResponse,
    ) => void,
  ) => void;

  "room:remove-participant": (
    payload: RemoveParticipantPayload,
    acknowledge: (
      response: RemoveParticipantResponse,
    ) => void,
  ) => void;
};

type ServerToClientEvents = {
  "participant:joined": (
    payload: ParticipantJoinedEvent,
  ) => void;

  "participant:left": (
    payload: ParticipantLeftEvent,
  ) => void;

  "participant:role-updated": (
    payload: ParticipantRoleUpdatedEvent,
  ) => void;

  "participant:removed": (
    payload: ParticipantRemovedEvent,
  ) => void;

  "host:transferred": (
    payload: HostTransferredEvent,
  ) => void;

  "playback:updated": (
    payload: PlaybackUpdatedEvent,
  ) => void;

  "video:changed": (
    payload: VideoChangedEvent,
  ) => void;

  "realtime:error": (
    payload: RealtimeErrorEvent,
  ) => void;
};

const serverUrl =
  import.meta.env.VITE_SERVER_URL ??
  "http://localhost:3000";

export const socket: Socket<
  ServerToClientEvents,
  ClientToServerEvents
> = io(serverUrl, {
  autoConnect: false,
  transports: ["websocket"],
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 750,
  timeout: 5_000,
});

export function connectSocket(): void {
  if (!socket.connected) {
    socket.connect();
  }
}

export function disconnectSocket(): void {
  if (socket.connected) {
    socket.disconnect();
  }
}