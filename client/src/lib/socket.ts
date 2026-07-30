import {
  io,
  type Socket,
} from "socket.io-client";

import type {
  CreateRoomPayload,
  CreateRoomResponse,
  HostTransferredEvent,
  JoinRoomPayload,
  JoinRoomResponse,
  ParticipantJoinedEvent,
  ParticipantLeftEvent,
  PlaybackCommandPayload,
  PlaybackCommandResponse,
  PlaybackUpdatedEvent,
  RealtimeErrorEvent,
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
};

type ServerToClientEvents = {
  "participant:joined": (
    payload: ParticipantJoinedEvent,
  ) => void;

  "participant:left": (
    payload: ParticipantLeftEvent,
  ) => void;

  "host:transferred": (
    payload: HostTransferredEvent,
  ) => void;

  "playback:updated": (
    payload: PlaybackUpdatedEvent,
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