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

type AssignRoleSuccess = {
  success: true;
  roomId: string;
  roomVersion: number;
  participant: {
    id: string;
    displayName: string;
    role: "moderator" | "participant";
  };
};

type AssignRoleFailure = {
  success: false;
  code: string;
  message: string;
};

type AssignRoleResponse =
  | AssignRoleSuccess
  | AssignRoleFailure;

type ParticipantRoleUpdatedEvent = {
  roomId: string;
  roomVersion: number;
  participant: {
    id: string;
    displayName: string;
    role: "moderator" | "participant";
  };
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
  "realtime room lifecycle supports roles, playback authorization, host transfer, and cleanup",
  async () => {
    clearRoomRepository();

    const harness = await startTestServer();

    const hostSocket = await connectClient(
      harness.serverUrl,
    );

    const moderatorSocket = await connectClient(
      harness.serverUrl,
    );

    const participantSocket = await connectClient(
      harness.serverUrl,
    );

    try {
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

      const moderatorJoinResponse =
        await emitWithAcknowledgement<JoinRoomResponse>(
          moderatorSocket,
          "room:join",
          {
            roomId,
            displayName:
              "Moderator Candidate",
          },
        );

      if (!moderatorJoinResponse.success) {
        assert.fail(
          `Moderator candidate join failed: ${moderatorJoinResponse.message}`,
        );
      }

      const moderatorParticipantId =
        moderatorJoinResponse.participantId;

      const participantJoinResponse =
        await emitWithAcknowledgement<JoinRoomResponse>(
          participantSocket,
          "room:join",
          {
            roomId,
            displayName:
              "Regular Participant",
          },
        );

      if (!participantJoinResponse.success) {
        assert.fail(
          `Regular participant join failed: ${participantJoinResponse.message}`,
        );
      }

      const participantId =
        participantJoinResponse.participantId;

      assert.ok(
        participantJoinResponse.roomVersion >
          createRoomVersion,
      );

      const roleUpdatedEventPromise =
        waitForEvent<ParticipantRoleUpdatedEvent>(
          moderatorSocket,
          "participant:role-updated",
        );

      const assignRoleResponse =
        await emitWithAcknowledgement<AssignRoleResponse>(
          hostSocket,
          "room:assign-role",
          {
            roomId,
            actorParticipantId:
              hostParticipantId,
            targetParticipantId:
              moderatorParticipantId,
            role: "moderator",
          },
        );

      if (!assignRoleResponse.success) {
        assert.fail(
          `Role assignment failed: ${assignRoleResponse.message}`,
        );
      }

      assert.equal(
        assignRoleResponse.participant.role,
        "moderator",
      );

      const roleUpdatedEvent =
        await roleUpdatedEventPromise;

      assert.equal(
        roleUpdatedEvent.participant.id,
        moderatorParticipantId,
      );
      assert.equal(
        roleUpdatedEvent.participant.role,
        "moderator",
      );
      assert.equal(
        roomRepository
          .findById(roomId)
          ?.participants.get(
            moderatorParticipantId,
          )?.role,
        "moderator",
      );

      const forbiddenRoleResponse =
        await emitWithAcknowledgement<AssignRoleResponse>(
          participantSocket,
          "room:assign-role",
          {
            roomId,
            actorParticipantId:
              participantId,
            targetParticipantId:
              moderatorParticipantId,
            role: "participant",
          },
        );

      assert.equal(
        forbiddenRoleResponse.success,
        false,
      );

      if (forbiddenRoleResponse.success) {
        assert.fail(
          "A regular participant incorrectly assigned a role.",
        );
      }

      assert.equal(
        forbiddenRoleResponse.code,
        "ROLE_FORBIDDEN",
      );

      const moderatorPlayResponse =
        await emitWithAcknowledgement<PlaybackCommandResponse>(
          moderatorSocket,
          "room:play",
          {
            roomId,
            participantId:
              moderatorParticipantId,
            positionSeconds: 12,
          },
        );

      if (!moderatorPlayResponse.success) {
        assert.fail(
          `Moderator play command failed: ${moderatorPlayResponse.message}`,
        );
      }

      assert.equal(
        moderatorPlayResponse.playback.status,
        "playing",
      );

      const forbiddenPlaybackResponse =
        await emitWithAcknowledgement<PlaybackCommandResponse>(
          participantSocket,
          "room:play",
          {
            roomId,
            participantId,
            positionSeconds: 20,
          },
        );

      assert.equal(
        forbiddenPlaybackResponse.success,
        false,
      );

      if (forbiddenPlaybackResponse.success) {
        assert.fail(
          "A regular participant incorrectly controlled playback.",
        );
      }

      assert.equal(
        forbiddenPlaybackResponse.code,
        "PLAYBACK_FORBIDDEN",
      );

      const hostPauseResponse =
        await emitWithAcknowledgement<PlaybackCommandResponse>(
          hostSocket,
          "room:pause",
          {
            roomId,
            participantId:
              hostParticipantId,
            positionSeconds: 18,
          },
        );

      if (!hostPauseResponse.success) {
        assert.fail(
          `Host pause command failed: ${hostPauseResponse.message}`,
        );
      }

      assert.equal(
        hostPauseResponse.playback.status,
        "paused",
      );

      const participantLeftPromise =
        waitForEvent<ParticipantLeftEvent>(
          moderatorSocket,
          "participant:left",
        );

      const hostTransferredPromise =
        waitForEvent<HostTransferredEvent>(
          moderatorSocket,
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
        participantLeftEvent.participant.id,
        hostParticipantId,
      );

      assert.equal(
        hostTransferredEvent.newHost.id,
        moderatorParticipantId,
      );

      assert.equal(
        hostTransferredEvent.newHost.role,
        "host",
      );

      assert.equal(
        roomRepository
          .findById(roomId)
          ?.hostParticipantId,
        moderatorParticipantId,
      );

      const transferredHostPlayResponse =
        await emitWithAcknowledgement<PlaybackCommandResponse>(
          moderatorSocket,
          "room:play",
          {
            roomId,
            participantId:
              moderatorParticipantId,
            positionSeconds: 90,
          },
        );

      if (!transferredHostPlayResponse.success) {
        assert.fail(
          `Transferred host could not control playback: ${transferredHostPlayResponse.message}`,
        );
      }

      participantSocket.disconnect();
      moderatorSocket.disconnect();

      await waitForCondition(
        () =>
          roomRepository.findById(roomId) ===
          null,
        "The empty room was not deleted after all participants disconnected.",
      );
    } finally {
      if (hostSocket.connected) {
        hostSocket.disconnect();
      }

      if (moderatorSocket.connected) {
        moderatorSocket.disconnect();
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