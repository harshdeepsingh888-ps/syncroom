import type { Socket } from "socket.io";
import { z } from "zod";

import type { PlaybackState } from "../../modules/rooms/domain/index.js";
import { roomService } from "../../modules/rooms/room-container.js";

const playbackCommandPayloadSchema = z.object({
  roomId: z.string().trim().min(1),
  participantId: z.string().trim().min(1),
  positionSeconds: z
    .number()
    .finite()
    .nonnegative(),
});

const changeVideoPayloadSchema = z.object({
  roomId: z.string().trim().min(1),
  participantId: z.string().trim().min(1),
  videoId: z
    .string()
    .trim()
    .regex(
      /^[a-zA-Z0-9_-]{11}$/,
      "A valid 11-character YouTube video ID is required.",
    ),
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

type ChangeVideoSuccess = {
  success: true;
  roomId: string;
  roomVersion: number;
  playback: PlaybackState;
};

type ChangeVideoFailure = {
  success: false;
  code:
    | "INVALID_PAYLOAD"
    | "ROOM_NOT_FOUND"
    | "PARTICIPANT_NOT_FOUND"
    | "PLAYBACK_FORBIDDEN"
    | "INVALID_VIDEO_ID";
  message: string;
};

type ChangeVideoResponse =
  | ChangeVideoSuccess
  | ChangeVideoFailure;

type ChangeVideoAck = (
  response: ChangeVideoResponse,
) => void;

type PlaybackCommand =
  | "play"
  | "pause"
  | "seek";

type HandlePlaybackCommandInput = {
  socket: Socket;
  payload: unknown;
  ack: unknown;
  command: PlaybackCommand;
};

type PlaybackUpdatedEvent = {
  roomId: string;
  roomVersion: number;
  playback: PlaybackState;
};

export function registerPlaybackHandlers(
  socket: Socket,
): void {
  socket.on(
    "room:play",
    (
      payload: unknown,
      ack: unknown,
    ): void => {
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
    (
      payload: unknown,
      ack: unknown,
    ): void => {
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
    (
      payload: unknown,
      ack: unknown,
    ): void => {
      handlePlaybackCommand({
        socket,
        payload,
        ack,
        command: "seek",
      });
    },
  );

  socket.on(
    "room:change-video",
    (
      payload: unknown,
      ack: unknown,
    ): void => {
      handleChangeVideo(
        socket,
        payload,
        ack,
      );
    },
  );
}

function handlePlaybackCommand(
  input: HandlePlaybackCommandInput,
): void {
  const {
    socket,
    payload,
    command,
  } = input;

  const ack =
    getPlaybackCommandAck(input.ack);

  if (ack === null) {
    socket.emit("realtime:error", {
      code: "ACK_REQUIRED",
      message:
        "Playback commands require an acknowledgement callback.",
    });

    return;
  }

  const parsedPayload =
    playbackCommandPayloadSchema.safeParse(
      payload,
    );

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

  const result =
    executePlaybackCommand(command, {
      roomId,
      participantId,
      actorSocketId: socket.id,
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

  const playbackUpdatedEvent:
    PlaybackUpdatedEvent = {
      roomId: result.room.id,
      roomVersion:
        result.room.roomVersion,
      playback: result.room.playback,
    };

  /*
   * The command sender receives the updated
   * state through the acknowledgement.
   */
  ack({
    success: true,
    ...playbackUpdatedEvent,
  });

  /*
   * Every other room member receives the
   * authoritative playback state.
   */
  broadcastPlaybackUpdate(
    socket,
    playbackUpdatedEvent,
  );
}

function handleChangeVideo(
  socket: Socket,
  payload: unknown,
  ackValue: unknown,
): void {
  const ack =
    getChangeVideoAck(ackValue);

  if (ack === null) {
    socket.emit("realtime:error", {
      code: "ACK_REQUIRED",
      message:
        "Changing the shared video requires an acknowledgement callback.",
    });

    return;
  }

  const parsedPayload =
    changeVideoPayloadSchema.safeParse(
      payload,
    );

  if (!parsedPayload.success) {
    ack({
      success: false,
      code: "INVALID_PAYLOAD",
      message:
        "Room ID, participant ID, and a valid YouTube video ID are required.",
    });

    return;
  }

  const result =
    roomService.changeVideo({
      ...parsedPayload.data,
      actorSocketId: socket.id,
    });

  if (!result.success) {
    ack({
      success: false,
      code: result.code,
      message: result.message,
    });

    return;
  }

  const playbackUpdatedEvent:
    PlaybackUpdatedEvent = {
      roomId: result.room.id,
      roomVersion:
        result.room.roomVersion,
      playback: result.room.playback,
    };

  /*
   * The host/moderator who changed the video
   * receives the new state through the ack.
   */
  ack({
    success: true,
    ...playbackUpdatedEvent,
  });

  /*
   * Video changes are playback-state changes.
   * Broadcast the same event that the frontend
   * already handles for play, pause and seek.
   */
  broadcastPlaybackUpdate(
    socket,
    playbackUpdatedEvent,
  );

  /*
   * Keep the specialised event for any future
   * UI that wants to show a video-change notice.
   */
  socket
    .to(result.room.id)
    .emit(
      "video:changed",
      playbackUpdatedEvent,
    );
}

function broadcastPlaybackUpdate(
  socket: Socket,
  event: PlaybackUpdatedEvent,
): void {
  socket
    .to(event.roomId)
    .emit(
      "playback:updated",
      event,
    );
}

function executePlaybackCommand(
  command: PlaybackCommand,
  payload: {
    roomId: string;
    participantId: string;
    actorSocketId: string;
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

function getChangeVideoAck(
  value: unknown,
): ChangeVideoAck | null {
  if (typeof value !== "function") {
    return null;
  }

  return value as ChangeVideoAck;
}