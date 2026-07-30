import assert from "node:assert/strict";
import {
  createServer,
  type Server as HttpServer,
} from "node:http";
import test from "node:test";

import {
  io as createSocketClient,
  type Socket as ClientSocket,
} from "socket.io-client";

import { createApp } from "../app.js";
import { roomRepository } from "../modules/rooms/room-container.js";
import { createSocketServer } from "./index.js";
import type { SyncRoomSocketServer } from "./socket-context.js";

type ParticipantRole =
  | "host"
  | "moderator"
  | "participant";

type PlaybackStatus =
  | "playing"
  | "paused";

type PlaybackSnapshot = {
  status: PlaybackStatus;
  positionSeconds: number;
};

type CreateRoomSuccess = {
  success: true;
  roomId: string;
  participantId: string;
  roomVersion: number;
};

type CreateRoomFailure = {
  success: false;
  code: string;
  message: string;
};

type CreateRoomResponse =
  | CreateRoomSuccess
  | CreateRoomFailure;

type JoinRoomSuccess = {
  success: true;
  roomId: string;
  participantId: string;
  role: ParticipantRole;
  roomVersion: number;
  playback: PlaybackSnapshot;
  participants: Array<{
    id: string;
    displayName: string;
    role: ParticipantRole;
  }>;
};

type JoinRoomFailure = {
  success: false;
  code: string;
  message: string;
};

type JoinRoomResponse =
  | JoinRoomSuccess
  | JoinRoomFailure;

type PlaybackCommandSuccess = {
  success: true;
  roomId: string;
  roomVersion: number;
  playback: PlaybackSnapshot;
};

type PlaybackCommandFailure = {
  success: false;
  code: string;
  message: string;
};

type PlaybackCommandResponse =
  | PlaybackCommandSuccess
  | PlaybackCommandFailure;

type PlaybackUpdatedEvent = {
  roomId: string;
  roomVersion: number;
  playback: PlaybackSnapshot;
};

type ParticipantLeftEvent = {
  roomId: string;
  roomVersion: number;
  participant: {
    id: string;
    displayName: string;
    role: ParticipantRole;
  };
  disconnectedAt: string | null;
};

type HostTransferredEvent = {
  roomId: string;
  roomVersion: number;
  previousHostParticipantId: string;
  newHost: {
    id: string;
    displayName: string;
    role: ParticipantRole;
  };
};

type TestHarness = {
  httpServer: HttpServer;
  io: SyncRoomSocketServer;
  serverUrl: string;
};

test(
  "realtime room lifecycle supports playback, authorization, host transfer, and cleanup",
  async () => {
    clearRoomRepository();

    const harness = await startTestServer();

    const hostSocket = await connectClient(
      harness.serverUrl,
    );

    const participantSocket = await connectClient(
      harness.serverUrl,
    );

    try {
      /*
       * Create room.
       */

      const createResponse =
        await emitWithAcknowledgement<CreateRoomResponse>(
          hostSocket,
          "room:create",
          {
            displayName: "Host User",
          },
        );

      if (!createResponse.success) {
        assert.fail(
          `Room creation failed: ${createResponse.message}`,
        );
      }

      const {
        roomId,
        participantId: hostParticipantId,
        roomVersion: createRoomVersion,
      } = createResponse;

      assert.equal(
        roomRepository.findById(roomId)?.participants.size,
        1,
      );

      /*
       * Join room.
       */

      const joinResponse =
        await emitWithAcknowledgement<JoinRoomResponse>(
          participantSocket,
          "room:join",
          {
            roomId,
            displayName: "Participant User",
          },
        );

      if (!joinResponse.success) {
        assert.fail(
          `Room join failed: ${joinResponse.message}`,
        );
      }

      const participantId =
        joinResponse.participantId;

      assert.equal(joinResponse.roomId, roomId);
      assert.equal(
        joinResponse.role,
        "participant",
      );
      assert.equal(
        joinResponse.participants.length,
        2,
      );
      assert.ok(
        joinResponse.roomVersion >
          createRoomVersion,
      );

      assert.equal(
        roomRepository.findById(roomId)?.participants.size,
        2,
      );

      /*
       * Host plays.
       */

      const playEventPromise =
        waitForEvent<PlaybackUpdatedEvent>(
          participantSocket,
          "playback:updated",
        );

      const playResponse =
        await emitWithAcknowledgement<PlaybackCommandResponse>(
          hostSocket,
          "room:play",
          {
            roomId,
            participantId: hostParticipantId,
            positionSeconds: 12,
          },
        );

      if (!playResponse.success) {
        assert.fail(
          `Play command failed: ${playResponse.message}`,
        );
      }

      assert.equal(
        playResponse.playback.status,
        "playing",
      );
      assert.equal(
        playResponse.playback.positionSeconds,
        12,
      );
      assert.ok(
        playResponse.roomVersion >
          joinResponse.roomVersion,
      );

      const playEvent = await playEventPromise;

      assert.deepEqual(
        {
          roomId: playEvent.roomId,
          roomVersion:
            playEvent.roomVersion,
          status:
            playEvent.playback.status,
          positionSeconds:
            playEvent.playback.positionSeconds,
        },
        {
          roomId:
            playResponse.roomId,
          roomVersion:
            playResponse.roomVersion,
          status: "playing",
          positionSeconds: 12,
        },
      );

      /*
       * Host pauses.
       */

      const pauseEventPromise =
        waitForEvent<PlaybackUpdatedEvent>(
          participantSocket,
          "playback:updated",
        );

      const pauseResponse =
        await emitWithAcknowledgement<PlaybackCommandResponse>(
          hostSocket,
          "room:pause",
          {
            roomId,
            participantId: hostParticipantId,
            positionSeconds: 18,
          },
        );

      if (!pauseResponse.success) {
        assert.fail(
          `Pause command failed: ${pauseResponse.message}`,
        );
      }

      assert.equal(
        pauseResponse.playback.status,
        "paused",
      );
      assert.equal(
        pauseResponse.playback.positionSeconds,
        18,
      );
      assert.ok(
        pauseResponse.roomVersion >
          playResponse.roomVersion,
      );

      const pauseEvent =
        await pauseEventPromise;

      assert.equal(
        pauseEvent.playback.status,
        "paused",
      );
      assert.equal(
        pauseEvent.playback.positionSeconds,
        18,
      );
      assert.equal(
        pauseEvent.roomVersion,
        pauseResponse.roomVersion,
      );

      /*
       * Host seeks while playback remains paused.
       */

      const seekEventPromise =
        waitForEvent<PlaybackUpdatedEvent>(
          participantSocket,
          "playback:updated",
        );

      const seekResponse =
        await emitWithAcknowledgement<PlaybackCommandResponse>(
          hostSocket,
          "room:seek",
          {
            roomId,
            participantId: hostParticipantId,
            positionSeconds: 75,
          },
        );

      if (!seekResponse.success) {
        assert.fail(
          `Seek command failed: ${seekResponse.message}`,
        );
      }

      assert.equal(
        seekResponse.playback.status,
        "paused",
      );
      assert.equal(
        seekResponse.playback.positionSeconds,
        75,
      );
      assert.ok(
        seekResponse.roomVersion >
          pauseResponse.roomVersion,
      );

      const seekEvent =
        await seekEventPromise;

      assert.equal(
        seekEvent.playback.status,
        "paused",
      );
      assert.equal(
        seekEvent.playback.positionSeconds,
        75,
      );
      assert.equal(
        seekEvent.roomVersion,
        seekResponse.roomVersion,
      );

      /*
       * A regular participant cannot control playback.
       */

      const forbiddenResponse =
        await emitWithAcknowledgement<PlaybackCommandResponse>(
          participantSocket,
          "room:play",
          {
            roomId,
            participantId,
            positionSeconds: 80,
          },
        );

      assert.equal(
        forbiddenResponse.success,
        false,
      );

      if (forbiddenResponse.success) {
        assert.fail(
          "A regular participant was incorrectly allowed to control playback.",
        );
      }

      assert.equal(
        forbiddenResponse.code,
        "PLAYBACK_FORBIDDEN",
      );

      /*
       * Disconnect the original host.
       *
       * The remaining participant should receive both lifecycle events.
       */

      const participantLeftPromise =
        waitForEvent<ParticipantLeftEvent>(
          participantSocket,
          "participant:left",
        );

      const hostTransferredPromise =
        waitForEvent<HostTransferredEvent>(
          participantSocket,
          "host:transferred",
        );

      hostSocket.disconnect();

      const [
        participantLeftEvent,
        hostTransferredEvent,
      ] = await Promise.all([
        participantLeftPromise,
        hostTransferredPromise,
      ]);

      assert.equal(
        participantLeftEvent.roomId,
        roomId,
      );
      assert.equal(
        participantLeftEvent.participant.id,
        hostParticipantId,
      );
      assert.equal(
        participantLeftEvent.participant.role,
        "host",
      );
      assert.ok(
        participantLeftEvent.disconnectedAt !==
          null,
      );

      assert.equal(
        hostTransferredEvent.roomId,
        roomId,
      );
      assert.equal(
        hostTransferredEvent.previousHostParticipantId,
        hostParticipantId,
      );
      assert.equal(
        hostTransferredEvent.newHost.id,
        participantId,
      );
      assert.equal(
        hostTransferredEvent.newHost.role,
        "host",
      );
      assert.equal(
        hostTransferredEvent.roomVersion,
        participantLeftEvent.roomVersion,
      );

      const roomAfterHostTransfer =
        roomRepository.findById(roomId);

      assert.ok(roomAfterHostTransfer);
      assert.equal(
        roomAfterHostTransfer.hostParticipantId,
        participantId,
      );
      assert.equal(
        roomAfterHostTransfer.participants.size,
        1,
      );
      assert.equal(
        roomAfterHostTransfer.participants.get(
          participantId,
        )?.role,
        "host",
      );
      assert.equal(
        roomAfterHostTransfer.participants.has(
          hostParticipantId,
        ),
        false,
      );

      /*
       * The transferred host can now control playback.
       */

      const transferredHostPlayResponse =
        await emitWithAcknowledgement<PlaybackCommandResponse>(
          participantSocket,
          "room:play",
          {
            roomId,
            participantId,
            positionSeconds: 90,
          },
        );

      if (!transferredHostPlayResponse.success) {
        assert.fail(
          `Transferred host could not control playback: ${transferredHostPlayResponse.message}`,
        );
      }

      assert.equal(
        transferredHostPlayResponse.playback.status,
        "playing",
      );
      assert.equal(
        transferredHostPlayResponse.playback.positionSeconds,
        90,
      );
      assert.ok(
        transferredHostPlayResponse.roomVersion >
          hostTransferredEvent.roomVersion,
      );

      /*
       * The removed original host participant ID is no longer valid.
       */

      const removedHostResponse =
        await emitWithAcknowledgement<PlaybackCommandResponse>(
          participantSocket,
          "room:pause",
          {
            roomId,
            participantId: hostParticipantId,
            positionSeconds: 95,
          },
        );

      assert.equal(
        removedHostResponse.success,
        false,
      );

      if (removedHostResponse.success) {
        assert.fail(
          "The removed original host identity was incorrectly accepted.",
        );
      }

      assert.equal(
        removedHostResponse.code,
        "PARTICIPANT_NOT_FOUND",
      );

      /*
       * Disconnect the final participant.
       *
       * The now-empty room should be deleted.
       */

      participantSocket.disconnect();

      await waitForCondition(
        () =>
          roomRepository.findById(roomId) ===
          null,
        "The empty room was not deleted after the final participant disconnected.",
      );

      assert.equal(
        roomRepository.findById(roomId),
        null,
      );
    } finally {
      if (hostSocket.connected) {
        hostSocket.disconnect();
      }

      if (participantSocket.connected) {
        participantSocket.disconnect();
      }

      await stopTestServer(harness);

      clearRoomRepository();
    }
  },
);

async function startTestServer(): Promise<TestHarness> {
  const app = createApp();
  const httpServer = createServer(app);
  const io = createSocketServer(httpServer);

  await new Promise<void>(
    (resolve, reject) => {
      httpServer.once(
        "error",
        reject,
      );

      httpServer.listen(
        0,
        "127.0.0.1",
        () => {
          httpServer.off(
            "error",
            reject,
          );

          resolve();
        },
      );
    },
  );

  const address =
    httpServer.address();

  if (
    !address ||
    typeof address === "string"
  ) {
    throw new Error(
      "The test server did not expose a TCP port.",
    );
  }

  return {
    httpServer,
    io,
    serverUrl:
      `http://127.0.0.1:${address.port}`,
  };
}

async function stopTestServer(
  harness: TestHarness,
): Promise<void> {
  await new Promise<void>((resolve) => {
    harness.io.close(() => {
      resolve();
    });
  });

  if (!harness.httpServer.listening) {
    return;
  }

  await new Promise<void>(
    (resolve, reject) => {
      harness.httpServer.close(
        (error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        },
      );
    },
  );
}

async function connectClient(
  serverUrl: string,
): Promise<ClientSocket> {
  const socket =
    createSocketClient(
      serverUrl,
      {
        transports: ["websocket"],
        forceNew: true,
        reconnection: false,
      },
    );

  await new Promise<void>(
    (resolve, reject) => {
      const timeout =
        setTimeout(() => {
          socket.disconnect();

          reject(
            new Error(
              "Timed out while connecting the Socket.IO test client.",
            ),
          );
        }, 3_000);

      socket.once(
        "connect",
        () => {
          clearTimeout(timeout);
          resolve();
        },
      );

      socket.once(
        "connect_error",
        (error: Error) => {
          clearTimeout(timeout);
          reject(error);
        },
      );
    },
  );

  return socket;
}

function emitWithAcknowledgement<TResponse>(
  socket: ClientSocket,
  eventName: string,
  payload: unknown,
): Promise<TResponse> {
  return new Promise<TResponse>(
    (resolve, reject) => {
      const timeout =
        setTimeout(() => {
          reject(
            new Error(
              `Timed out waiting for acknowledgement from "${eventName}".`,
            ),
          );
        }, 3_000);

      socket.emit(
        eventName,
        payload,
        (response: TResponse) => {
          clearTimeout(timeout);
          resolve(response);
        },
      );
    },
  );
}

function waitForEvent<TPayload>(
  socket: ClientSocket,
  eventName: string,
): Promise<TPayload> {
  return new Promise<TPayload>(
    (resolve, reject) => {
      const timeout =
        setTimeout(() => {
          socket.off(
            eventName,
            handleEvent,
          );

          reject(
            new Error(
              `Timed out waiting for "${eventName}".`,
            ),
          );
        }, 3_000);

      function handleEvent(
        payload: TPayload,
      ): void {
        clearTimeout(timeout);
        resolve(payload);
      }

      socket.once(
        eventName,
        handleEvent,
      );
    },
  );
}

async function waitForCondition(
  condition: () => boolean,
  timeoutMessage: string,
): Promise<void> {
  const timeoutMilliseconds = 3_000;
  const pollIntervalMilliseconds = 10;
  const startedAt = Date.now();

  while (!condition()) {
    if (
      Date.now() - startedAt >=
      timeoutMilliseconds
    ) {
      throw new Error(timeoutMessage);
    }

    await delay(
      pollIntervalMilliseconds,
    );
  }
}

function delay(
  milliseconds: number,
): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(
      resolve,
      milliseconds,
    );
  });
}

function clearRoomRepository(): void {
  for (
    const room
    of roomRepository.findAll()
  ) {
    roomRepository.deleteById(
      room.id,
    );
  }
}