import type { Socket } from "socket.io";
import { z } from "zod";

import type { PlaybackState } from "../../modules/rooms/domain/index.js";
import { roomService } from "../../modules/rooms/room-container.js";

const playbackCommandPayloadSchema = z.object({
  roomId: z.string().trim().min(1),
  participantId: z.string().trim().min(1),
  positionSeconds: z.number().finite().nonnegative(),
});

type PlaybackCommandSuccess = {
  success: true;
  roomId: string;
  roomVersion: number;
  playback: PlaybackState;
};

type PlaybackCommandFailure = {
  success: false;
  code:
    | "INVALID_PAYLOAD"
    | "ROOM_NOT_FOUND"
    | "PARTICIPANT_NOT_FOUND"
    | "PLAYBACK_FORBIDDEN";
  message: string;
};

type PlaybackCommandResponse =
  | PlaybackCommandSuccess
  | PlaybackCommandFailure;

type PlaybackCommandAck = (
  response: PlaybackCommandResponse,
) => void;

type PlaybackCommand = "play" | "pause" | "seek";

type HandlePlaybackCommandInput = {
  socket: Socket;
  payload: unknown;
  ack: unknown;
  command: PlaybackCommand;
};

export function registerPlaybackHandlers(socket: Socket): void {
  socket.on(
    "room:play",
    (payload: unknown, ack: unknown): void => {
      handlePlaybackCommand({
        socket,
        payload,
        ack,
        command: "play",
      });
    },
  );

  socket.on(
    "room:pause",
    (payload: unknown, ack: unknown): void => {
      handlePlaybackCommand({
        socket,
        payload,
        ack,
        command: "pause",
      });
    },
  );

  socket.on(
    "room:seek",
    (payload: unknown, ack: unknown): void => {
      handlePlaybackCommand({
        socket,
        payload,
        ack,
        command: "seek",
      });
    },
  );
}

function handlePlaybackCommand(
  input: HandlePlaybackCommandInput,
): void {
  const { socket, payload, command } = input;

  const ack = getPlaybackCommandAck(input.ack);

  if (!ack) {
    socket.emit("realtime:error", {
      code: "ACK_REQUIRED",
      message:
        "Playback commands require an acknowledgement callback.",
    });

    return;
  }

  const parsedPayload =
    playbackCommandPayloadSchema.safeParse(payload);

  if (!parsedPayload.success) {
    ack({
      success: false,
      code: "INVALID_PAYLOAD",
      message:
        "Room ID, participant ID, and a valid non-negative playback position are required.",
    });

    return;
  }

  const {
    roomId,
    participantId,
    positionSeconds,
  } = parsedPayload.data;

  const result = executePlaybackCommand(command, {
    roomId,
    participantId,
    positionSeconds,
  });

  if (!result.success) {
    ack({
      success: false,
      code: result.code,
      message: result.message,
    });

    return;
  }

  const playbackUpdatedEvent = {
    roomId: result.room.id,
    roomVersion: result.room.roomVersion,
    playback: result.room.playback,
  };

  ack({
    success: true,
    ...playbackUpdatedEvent,
  });

  socket
    .to(result.room.id)
    .emit(
      "playback:updated",
      playbackUpdatedEvent,
    );
}

function executePlaybackCommand(
  command: PlaybackCommand,
  payload: {
    roomId: string;
    participantId: string;
    positionSeconds: number;
  },
) {
  switch (command) {
    case "play":
      return roomService.play(payload);

    case "pause":
      return roomService.pause(payload);

    case "seek":
      return roomService.seek(payload);
  }
}

function getPlaybackCommandAck(
  value: unknown,
): PlaybackCommandAck | null {
  if (typeof value !== "function") {
    return null;
  }

  return value as PlaybackCommandAck;
}