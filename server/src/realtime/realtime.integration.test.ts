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

type RemoveParticipantSuccess = {
  success: true;
  roomId: string;
  roomVersion: number;
  removedParticipantId: string;
};

type RemoveParticipantFailure = {
  success: false;
  code: string;
  message: string;
};

type RemoveParticipantResponse =
  | RemoveParticipantSuccess
  | RemoveParticipantFailure;

type TransferHostSuccess = {
  success: true;
  roomId: string;
  roomVersion: number;
  newHost: {
    id: string;
    displayName: string;
    role: ParticipantRole;
  };
};

type TransferHostFailure = {
  success: false;
  code: string;
  message: string;
};

type TransferHostResponse =
  | TransferHostSuccess
  | TransferHostFailure;

type ParticipantRemovedEvent = {
  roomId: string;
  roomVersion: number;
  participant: {
    id: string;
    displayName: string;
    role: ParticipantRole;
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

      // 1. Host promotes Participant to Moderator
      // 2. All connected clients receive participant:role-updated
      const roleUpdatedEventPromise =
        waitForEvent<ParticipantRoleUpdatedEvent>(
          participantSocket,
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

      // 3. Promoted Moderator can control playback
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

      // 4. Moderator cannot assign roles
      const moderatorAssignRoleResponse =
        await emitWithAcknowledgement<AssignRoleResponse>(
          moderatorSocket,
          "room:assign-role",
          {
            roomId,
            actorParticipantId:
              moderatorParticipantId,
            targetParticipantId:
              participantId,
            role: "moderator",
          },
        );

      assert.equal(
        moderatorAssignRoleResponse.success,
        false,
      );
      assert.equal(
        moderatorAssignRoleResponse.code,
        "ROLE_FORBIDDEN",
      );

      // 5. Regular Participant cannot assign roles
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
      assert.equal(
        forbiddenRoleResponse.code,
        "ROLE_FORBIDDEN",
      );

      // 6. Host demotes Moderator to Participant
      const demoteEventPromise =
        waitForEvent<ParticipantRoleUpdatedEvent>(
          moderatorSocket,
          "participant:role-updated",
        );

      const demoteRoleResponse =
        await emitWithAcknowledgement<AssignRoleResponse>(
          hostSocket,
          "room:assign-role",
          {
            roomId,
            actorParticipantId:
              hostParticipantId,
            targetParticipantId:
              moderatorParticipantId,
            role: "participant",
          },
        );

      if (!demoteRoleResponse.success) {
        assert.fail(
          `Demotion failed: ${demoteRoleResponse.message}`,
        );
      }

      assert.equal(
        demoteRoleResponse.participant.role,
        "participant",
      );

      const demotedEvent = await demoteEventPromise;
      assert.equal(
        demotedEvent.participant.role,
        "participant",
      );

      // 7. Demoted participant can no longer control playback
      const demotedPlayResponse =
        await emitWithAcknowledgement<PlaybackCommandResponse>(
          moderatorSocket,
          "room:play",
          {
            roomId,
            participantId:
              moderatorParticipantId,
            positionSeconds: 20,
          },
        );

      assert.equal(
        demotedPlayResponse.success,
        false,
      );
      assert.equal(
        demotedPlayResponse.code,
        "PLAYBACK_FORBIDDEN",
      );

      // 8. Host cannot assign their own role
      const selfRoleResponse =
        await emitWithAcknowledgement<AssignRoleResponse>(
          hostSocket,
          "room:assign-role",
          {
            roomId,
            actorParticipantId:
              hostParticipantId,
            targetParticipantId:
              hostParticipantId,
            role: "participant",
          },
        );

      assert.equal(
        selfRoleResponse.success,
        false,
      );
      assert.equal(
        selfRoleResponse.code,
        "INVALID_ROLE_TARGET",
      );

      // 9. Unknown target participant is rejected
      const unknownTargetResponse =
        await emitWithAcknowledgement<AssignRoleResponse>(
          hostSocket,
          "room:assign-role",
          {
            roomId,
            actorParticipantId:
              hostParticipantId,
            targetParticipantId:
              "non-existent-participant-id",
            role: "moderator",
          },
        );

      assert.equal(
        unknownTargetResponse.success,
        false,
      );
      assert.equal(
        unknownTargetResponse.code,
        "PARTICIPANT_NOT_FOUND",
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

test(
  "realtime room participant removal enforces host authorization, client eviction, and room isolation",
  async () => {
    clearRoomRepository();

    const harness = await startTestServer();

    const hostSocket = await connectClient(harness.serverUrl);
    const moderatorSocket = await connectClient(harness.serverUrl);
    const participantSocket = await connectClient(harness.serverUrl);

    try {
      const createResponse =
        await emitWithAcknowledgement<CreateRoomResponse>(
          hostSocket,
          "room:create",
          { displayName: "Host User" },
        );

      if (!createResponse.success) {
        assert.fail(`Room creation failed: ${createResponse.message}`);
      }

      const { roomId, participantId: hostParticipantId } = createResponse;

      const moderatorJoinResponse =
        await emitWithAcknowledgement<JoinRoomResponse>(
          moderatorSocket,
          "room:join",
          { roomId, displayName: "Moderator User" },
        );

      if (!moderatorJoinResponse.success) {
        assert.fail(`Moderator join failed: ${moderatorJoinResponse.message}`);
      }

      const moderatorParticipantId = moderatorJoinResponse.participantId;

      await emitWithAcknowledgement<AssignRoleResponse>(
        hostSocket,
        "room:assign-role",
        {
          roomId,
          actorParticipantId: hostParticipantId,
          targetParticipantId: moderatorParticipantId,
          role: "moderator",
        },
      );

      const participantJoinResponse =
        await emitWithAcknowledgement<JoinRoomResponse>(
          participantSocket,
          "room:join",
          { roomId, displayName: "Regular Participant" },
        );

      if (!participantJoinResponse.success) {
        assert.fail(`Participant join failed: ${participantJoinResponse.message}`);
      }

      const participantId = participantJoinResponse.participantId;

      // 3. Participant cannot remove anyone
      const participantRemoveResponse =
        await emitWithAcknowledgement<RemoveParticipantResponse>(
          participantSocket,
          "room:remove-participant",
          {
            roomId,
            actorParticipantId: participantId,
            targetParticipantId: moderatorParticipantId,
          },
        );

      assert.equal(participantRemoveResponse.success, false);
      assert.equal(participantRemoveResponse.code, "REMOVE_FORBIDDEN");

      // 4. Moderator cannot remove anyone
      const moderatorRemoveResponse =
        await emitWithAcknowledgement<RemoveParticipantResponse>(
          moderatorSocket,
          "room:remove-participant",
          {
            roomId,
            actorParticipantId: moderatorParticipantId,
            targetParticipantId: participantId,
          },
        );

      assert.equal(moderatorRemoveResponse.success, false);
      assert.equal(moderatorRemoveResponse.code, "REMOVE_FORBIDDEN");

      // 5. Host cannot remove themselves
      const hostSelfRemoveResponse =
        await emitWithAcknowledgement<RemoveParticipantResponse>(
          hostSocket,
          "room:remove-participant",
          {
            roomId,
            actorParticipantId: hostParticipantId,
            targetParticipantId: hostParticipantId,
          },
        );

      assert.equal(hostSelfRemoveResponse.success, false);
      assert.equal(
        hostSelfRemoveResponse.code,
        "HOST_SELF_REMOVAL_FORBIDDEN",
      );

      // 6. Unknown participant is rejected
      const unknownRemoveResponse =
        await emitWithAcknowledgement<RemoveParticipantResponse>(
          hostSocket,
          "room:remove-participant",
          {
            roomId,
            actorParticipantId: hostParticipantId,
            targetParticipantId: "non-existent-participant-id",
          },
        );

      assert.equal(unknownRemoveResponse.success, false);
      assert.equal(
        unknownRemoveResponse.code,
        "PARTICIPANT_NOT_FOUND",
      );

      // 1. Host removes Participant successfully
      // 7. Removed client receives participant:removed
      // 8. Remaining clients receive updated participant list
      // 9. Removed socket leaves the Socket.IO room
      const targetRemovedEventPromise =
        waitForEvent<ParticipantRemovedEvent>(
          participantSocket,
          "participant:removed",
        );

      const roomRemovedEventPromise =
        waitForEvent<ParticipantRemovedEvent>(
          moderatorSocket,
          "participant:removed",
        );

      const hostRemoveParticipantResponse =
        await emitWithAcknowledgement<RemoveParticipantResponse>(
          hostSocket,
          "room:remove-participant",
          {
            roomId,
            actorParticipantId: hostParticipantId,
            targetParticipantId: participantId,
          },
        );

      if (!hostRemoveParticipantResponse.success) {
        assert.fail(
          `Host failed to remove participant: ${hostRemoveParticipantResponse.message}`,
        );
      }

      const targetRemovedEvent = await targetRemovedEventPromise;
      const roomRemovedEvent = await roomRemovedEventPromise;

      assert.equal(targetRemovedEvent.participant.id, participantId);
      assert.equal(roomRemovedEvent.participant.id, participantId);

      // 10. Removed participant cannot control playback afterward
      const removedUserPlayResponse =
        await emitWithAcknowledgement<PlaybackCommandResponse>(
          participantSocket,
          "room:play",
          {
            roomId,
            participantId,
            positionSeconds: 50,
          },
        );

      assert.equal(removedUserPlayResponse.success, false);
      assert.equal(removedUserPlayResponse.code, "PARTICIPANT_NOT_FOUND");

      // 11. Removed participant does not receive later playback broadcasts
      let removedUserReceivedBroadcast = false;
      participantSocket.on("playback:updated", () => {
        removedUserReceivedBroadcast = true;
      });

      const hostPlayAfterRemoval =
        await emitWithAcknowledgement<PlaybackCommandResponse>(
          hostSocket,
          "room:play",
          {
            roomId,
            participantId: hostParticipantId,
            positionSeconds: 100,
          },
        );

      assert.equal(hostPlayAfterRemoval.success, true);
      await delay(100);
      assert.equal(removedUserReceivedBroadcast, false);

      // 2. Host removes Moderator successfully
      const hostRemoveModeratorResponse =
        await emitWithAcknowledgement<RemoveParticipantResponse>(
          hostSocket,
          "room:remove-participant",
          {
            roomId,
            actorParticipantId: hostParticipantId,
            targetParticipantId: moderatorParticipantId,
          },
        );

      if (!hostRemoveModeratorResponse.success) {
        assert.fail(
          `Host failed to remove moderator: ${hostRemoveModeratorResponse.message}`,
        );
      }
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

test(
  "realtime room manual host transfer updates roles, broadcasts events, and rejects unauthorized requests",
  async () => {
    clearRoomRepository();

    const harness = await startTestServer();
    const hostSocket = await connectClient(harness.serverUrl);
    const targetSocket = await connectClient(harness.serverUrl);

    try {
      const createRoomResponse =
        await emitWithAcknowledgement<CreateRoomResponse>(
          hostSocket,
          "room:create",
          { displayName: "HostUser" },
        );

      assert.equal(createRoomResponse.success, true);
      if (!createRoomResponse.success) return;

      const roomId = createRoomResponse.roomId;
      const hostId = createRoomResponse.participantId;

      const joinRoomResponse =
        await emitWithAcknowledgement<JoinRoomSuccess>(
          targetSocket,
          "room:join",
          { roomId, displayName: "TargetUser" },
        );

      assert.equal(joinRoomResponse.success, true);
      if (!joinRoomResponse.success) return;

      const targetId = joinRoomResponse.participantId;

      // 1. Participant attempting transfer should be rejected
      const unauthorizedResponse =
        await emitWithAcknowledgement<TransferHostResponse>(
          targetSocket,
          "room:transfer-host",
          {
            roomId,
            actorParticipantId: targetId,
            targetParticipantId: hostId,
          },
        );

      assert.equal(unauthorizedResponse.success, false);
      if (unauthorizedResponse.success === false) {
        assert.equal(unauthorizedResponse.code, "TRANSFER_FORBIDDEN");
      }

      // 2. Valid Host transfers ownership to Target User
      const hostTransferredPromise =
        waitForEvent<HostTransferredEvent>(
          targetSocket,
          "host:transferred",
        );

      const transferResponse =
        await emitWithAcknowledgement<TransferHostResponse>(
          hostSocket,
          "room:transfer-host",
          {
            roomId,
            actorParticipantId: hostId,
            targetParticipantId: targetId,
          },
        );

      assert.equal(transferResponse.success, true);
      if (!transferResponse.success) return;

      const hostTransferredEvent = await hostTransferredPromise;
      assert.equal(hostTransferredEvent.newHost.id, targetId);
      assert.equal(hostTransferredEvent.newHost.role, "host");
      assert.equal(hostTransferredEvent.previousHostParticipantId, hostId);

      // Verify room state in repository
      const updatedRoom = roomRepository.findById(roomId);
      assert.equal(updatedRoom?.hostParticipantId, targetId);
      assert.equal(updatedRoom?.participants.get(targetId)?.role, "host");
      assert.equal(updatedRoom?.participants.get(hostId)?.role, "moderator");
    } finally {
      if (hostSocket.connected) hostSocket.disconnect();
      if (targetSocket.connected) targetSocket.disconnect();

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