import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";

import "../../App.css";

import {
  YouTubePlayer,
  type YouTubePlayerHandle,
} from "../player/youtube-player";

import { YouTubeBrowser } from "../../components/youtube/youtube-browser";

import {
  connectSocket,
  disconnectSocket,
  socket,
} from "../../lib/socket";

import {
  getInitials,
  shortenRoomId,
} from "../../utils/room-formatters";

import type {
  ActiveRoom,
  AssignRoleResponse,
  CreateRoomResponse,
  HostTransferredEvent,
  JoinRoomResponse,
  Participant,
  ParticipantJoinedEvent,
  ParticipantLeftEvent,
  ParticipantRemovedEvent,
  ParticipantRoleUpdatedEvent,
  PlaybackCommandResponse,
  PlaybackUpdatedEvent,
  RealtimeErrorEvent,
  RemoveParticipantResponse,
} from "../../types/realtime";

import { RoleBadge } from "../../components/common/role-badge";
import { PlaybackControls } from "../../components/playback/playback-controls";

type EntryMode = "create" | "join";

type ConnectionStatus =
  | "connecting"
  | "connected"
  | "disconnected";

type AcknowledgementEventName =
  | "room:create"
  | "room:join"
  | "room:play"
  | "room:pause"
  | "room:seek"
  | "room:change-video"
  | "room:assign-role"
  | "room:remove-participant";

type RuntimeAcknowledgementSocket = {
  emit: (
    eventName: AcknowledgementEventName,
    payload: unknown,
    acknowledge: (response: unknown) => void,
  ) => void;
};

const acknowledgementTimeoutMilliseconds = 5_000;

function App() {
  const [entryMode, setEntryMode] =
    useState<EntryMode>("create");

  const [displayName, setDisplayName] =
    useState("");

  const [roomCode, setRoomCode] =
    useState("");

  const [activeRoom, setActiveRoom] =
    useState<ActiveRoom | null>(null);

  const [
    connectionStatus,
    setConnectionStatus,
  ] = useState<ConnectionStatus>(
    socket.connected
      ? "connected"
      : "connecting",
  );

  const [formError, setFormError] =
    useState<string | null>(null);

  const [roomNotice, setRoomNotice] =
    useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] =
    useState(false);

  const [
    isPlaybackCommandPending,
    setIsPlaybackCommandPending,
  ] = useState(false);

  const [
    isVideoCommandPending,
    setIsVideoCommandPending,
  ] = useState(false);

  useEffect(() => {
    function handleConnect(): void {
      setConnectionStatus("connected");
      setFormError(null);
    }

    function handleDisconnect(): void {
      setConnectionStatus("disconnected");
    }

    function handleConnectError(): void {
      setConnectionStatus("disconnected");

      setFormError(
        "Could not connect to the SyncRoom server. Confirm that the backend is running.",
      );
    }

    function handleParticipantJoined(
      event: ParticipantJoinedEvent,
    ): void {
      setActiveRoom((currentRoom) => {
        if (
          !currentRoom ||
          currentRoom.roomId !== event.roomId
        ) {
          return currentRoom;
        }

        const participantAlreadyExists =
          currentRoom.participants.some(
            (participant) =>
              participant.id ===
              event.participant.id,
          );

        return {
          ...currentRoom,
          roomVersion: event.roomVersion,
          participants:
            participantAlreadyExists
              ? currentRoom.participants
              : [
                  ...currentRoom.participants,
                  event.participant,
                ],
        };
      });

      setRoomNotice(
        `${event.participant.displayName} joined the room.`,
      );
    }

    function handleParticipantLeft(
      event: ParticipantLeftEvent,
    ): void {
      setActiveRoom((currentRoom) => {
        if (
          !currentRoom ||
          currentRoom.roomId !== event.roomId
        ) {
          return currentRoom;
        }

        return {
          ...currentRoom,
          roomVersion: event.roomVersion,
          participants:
            currentRoom.participants.filter(
              (participant) =>
                participant.id !==
                event.participant.id,
            ),
        };
      });

      setRoomNotice(
        `${event.participant.displayName} left the room.`,
      );
    }

    function handleHostTransferred(
      event: HostTransferredEvent,
    ): void {
      setActiveRoom((currentRoom) => {
        if (
          !currentRoom ||
          currentRoom.roomId !== event.roomId
        ) {
          return currentRoom;
        }

        const participants =
          currentRoom.participants.map(
            (participant) => {
              if (
                participant.id ===
                event.newHost.id
              ) {
                return {
                  ...participant,
                  role: "host" as const,
                };
              }

              if (
                participant.id ===
                event.previousHostParticipantId
              ) {
                return {
                  ...participant,
                  role: "participant" as const,
                };
              }

              return participant;
            },
          );

        return {
          ...currentRoom,
          role:
            currentRoom.participantId ===
            event.newHost.id
              ? "host"
              : currentRoom.role,
          roomVersion: event.roomVersion,
          participants,
        };
      });

      setRoomNotice(
        `${event.newHost.displayName} is now the room host.`,
      );
    }

    function handleParticipantRoleUpdated(
      event: ParticipantRoleUpdatedEvent,
    ): void {
      setActiveRoom((currentRoom) => {
        if (
          !currentRoom ||
          currentRoom.roomId !== event.roomId
        ) {
          return currentRoom;
        }

        const isCurrentUser =
          currentRoom.participantId ===
          event.participant.id;

        const updatedParticipants =
          currentRoom.participants.map(
            (participant) =>
              participant.id ===
              event.participant.id
                ? {
                    ...participant,
                    role: event.participant.role,
                  }
                : participant,
          );

        return {
          ...currentRoom,
          role: isCurrentUser
            ? event.participant.role
            : currentRoom.role,
          roomVersion: event.roomVersion,
          participants: updatedParticipants,
        };
      });

      setRoomNotice(
        `${event.participant.displayName}'s role was updated to ${event.participant.role}.`,
      );
    }

    function handleParticipantRemoved(
      event: ParticipantRemovedEvent,
    ): void {
      setActiveRoom((currentRoom) => {
        if (
          !currentRoom ||
          currentRoom.roomId !== event.roomId
        ) {
          return currentRoom;
        }

        if (currentRoom.participantId === event.participant.id) {
          setFormError(
            "You were removed from the room by the host.",
          );
          setRoomNotice(null);
          return null;
        }

        setRoomNotice(
          `${event.participant.displayName} was removed from the room.`,
        );

        return {
          ...currentRoom,
          roomVersion: event.roomVersion,
          participants: currentRoom.participants.filter(
            (participant) =>
              participant.id !== event.participant.id,
          ),
        };
      });
    }

    function handlePlaybackUpdated(
      event: PlaybackUpdatedEvent,
    ): void {
      setActiveRoom((currentRoom) => {
        if (
          !currentRoom ||
          currentRoom.roomId !== event.roomId
        ) {
          return currentRoom;
        }

        if (
          event.roomVersion <
          currentRoom.roomVersion
        ) {
          return currentRoom;
        }

        return {
          ...currentRoom,
          roomVersion: event.roomVersion,
          playback: event.playback,
        };
      });
    }

    function handleRealtimeError(
      event: RealtimeErrorEvent,
    ): void {
      setFormError(event.message);
    }

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);

    socket.on(
      "connect_error",
      handleConnectError,
    );

    socket.on(
      "participant:joined",
      handleParticipantJoined,
    );

    socket.on(
      "participant:left",
      handleParticipantLeft,
    );

    socket.on(
      "participant:role-updated",
      handleParticipantRoleUpdated,
    );

    socket.on(
      "participant:removed",
      handleParticipantRemoved,
    );

    socket.on(
      "host:transferred",
      handleHostTransferred,
    );

    socket.on(
      "playback:updated",
      handlePlaybackUpdated,
    );

    socket.on(
      "realtime:error",
      handleRealtimeError,
    );

    connectSocket();

    return () => {
      socket.off("connect", handleConnect);

      socket.off(
        "disconnect",
        handleDisconnect,
      );

      socket.off(
        "connect_error",
        handleConnectError,
      );

      socket.off(
        "participant:joined",
        handleParticipantJoined,
      );

      socket.off(
        "participant:left",
        handleParticipantLeft,
      );

      socket.off(
        "participant:role-updated",
        handleParticipantRoleUpdated,
      );

      socket.off(
        "participant:removed",
        handleParticipantRemoved,
      );

      socket.off(
        "host:transferred",
        handleHostTransferred,
      );

      socket.off(
        "playback:updated",
        handlePlaybackUpdated,
      );

      socket.off(
        "realtime:error",
        handleRealtimeError,
      );

      disconnectSocket();
    };
  }, []);

  useEffect(() => {
    if (!roomNotice) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setRoomNotice(null);
    }, 4_000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [roomNotice]);

  const currentParticipant =
    useMemo(() => {
      if (!activeRoom) {
        return null;
      }

      return (
        activeRoom.participants.find(
          (participant) =>
            participant.id ===
            activeRoom.participantId,
        ) ?? null
      );
    }, [activeRoom]);

  const canControlPlayback =
    currentParticipant?.role === "host" ||
    currentParticipant?.role ===
      "moderator";

  async function handleEntrySubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    setFormError(null);
    setRoomNotice(null);

    const normalizedDisplayName =
      displayName.trim();

    const normalizedRoomCode =
      roomCode.trim();

    if (!normalizedDisplayName) {
      setFormError(
        "Enter a display name before continuing.",
      );

      return;
    }

    if (
      entryMode === "join" &&
      !normalizedRoomCode
    ) {
      setFormError(
        "Enter the room ID you want to join.",
      );

      return;
    }

    if (!socket.connected) {
      connectSocket();

      setFormError(
        "The realtime connection is not ready yet. Try again in a moment.",
      );

      return;
    }

    setIsSubmitting(true);

    try {
      if (entryMode === "create") {
        const response =
          await emitWithAcknowledgement<CreateRoomResponse>(
            "room:create",
            {
              displayName:
                normalizedDisplayName,
            },
          );

        if (!response.success) {
          setFormError(response.message);
          return;
        }

        setActiveRoom({
          roomId: response.roomId,
          participantId:
            response.participantId,
          role: "host",
          roomVersion:
            response.roomVersion,
          playback: {
            videoId: null,
            status: "paused",
            positionSeconds: 0,
            playbackRate: 1,
            updatedAt: new Date().toISOString(),
          },
          participants: [
            {
              id: response.participantId,
              displayName:
                normalizedDisplayName,
              role: "host",
            },
          ],
        });

        return;
      }

      const response =
        await emitWithAcknowledgement<JoinRoomResponse>(
          "room:join",
          {
            roomId: normalizedRoomCode,
            displayName:
              normalizedDisplayName,
          },
        );

      if (!response.success) {
        setFormError(response.message);
        return;
      }

      setActiveRoom({
        roomId: response.roomId,
        participantId:
          response.participantId,
        role: response.role,
        roomVersion: response.roomVersion,
        playback: response.playback,
        participants:
          response.participants,
      });
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "The room request failed.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function executePlaybackCommand(
    command:
      | "room:play"
      | "room:pause"
      | "room:seek",
    positionSeconds: number,
  ): Promise<void> {
    if (!activeRoom) {
      return;
    }

    if (!canControlPlayback) {
      setFormError(
        "Only the host or a moderator can control playback.",
      );

      return;
    }

    setFormError(null);
    setIsPlaybackCommandPending(true);

    try {
      const response =
        await emitWithAcknowledgement<PlaybackCommandResponse>(
          command,
          {
            roomId: activeRoom.roomId,
            participantId:
              activeRoom.participantId,
            positionSeconds,
          },
        );

      if (!response.success) {
        setFormError(response.message);
        return;
      }

      setActiveRoom((currentRoom) => {
        if (
          !currentRoom ||
          currentRoom.roomId !==
            response.roomId
        ) {
          return currentRoom;
        }

        return {
          ...currentRoom,
          roomVersion:
            response.roomVersion,
          playback: response.playback,
        };
      });
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "The playback command failed.",
      );
    } finally {
      setIsPlaybackCommandPending(false);
    }
  }

  async function handleChangeVideo(
    videoId: string,
  ): Promise<void> {
    if (!activeRoom) {
      return;
    }

    if (!canControlPlayback) {
      setFormError(
        "Only the host or a moderator can change the shared video.",
      );

      return;
    }

    setFormError(null);
    setRoomNotice(null);
    setIsVideoCommandPending(true);

    try {
      const response =
        await emitWithAcknowledgement<PlaybackCommandResponse>(
          "room:change-video",
          {
            roomId: activeRoom.roomId,
            participantId:
              activeRoom.participantId,
            videoId,
          },
        );

      if (!response.success) {
        setFormError(response.message);
        return;
      }

      setActiveRoom((currentRoom) => {
        if (
          !currentRoom ||
          currentRoom.roomId !==
            response.roomId
        ) {
          return currentRoom;
        }

        return {
          ...currentRoom,
          roomVersion:
            response.roomVersion,
          playback: response.playback,
        };
      });

      setRoomNotice(
        "The shared video was changed successfully.",
      );
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "The video change request failed.",
      );
    } finally {
      setIsVideoCommandPending(false);
    }
  }

  async function handleAssignRole(
    targetParticipantId: string,
    role: "moderator" | "participant",
  ): Promise<void> {
    if (!activeRoom) {
      return;
    }

    setFormError(null);
    setRoomNotice(null);

    const response =
      await emitWithAcknowledgement<AssignRoleResponse>(
        "room:assign-role",
        {
          roomId: activeRoom.roomId,
          actorParticipantId: activeRoom.participantId,
          targetParticipantId,
          role,
        },
      );

    if (!response.success) {
      setFormError(response.message);
      return;
    }

    setActiveRoom((currentRoom) => {
      if (
        !currentRoom ||
        currentRoom.roomId !== response.roomId
      ) {
        return currentRoom;
      }

      const updatedParticipants = currentRoom.participants.map(
        (participant) =>
          participant.id === response.participant.id
            ? {
                ...participant,
                role: response.participant.role,
              }
            : participant,
      );

      return {
        ...currentRoom,
        roomVersion: response.roomVersion,
        participants: updatedParticipants,
      };
    });

    setRoomNotice(
      `${response.participant.displayName}'s role is now ${response.participant.role}.`,
    );
  }

  async function handleRemoveParticipant(
    targetParticipantId: string,
  ): Promise<void> {
    if (!activeRoom) {
      return;
    }

    setFormError(null);
    setRoomNotice(null);

    const response =
      await emitWithAcknowledgement<RemoveParticipantResponse>(
        "room:remove-participant",
        {
          roomId: activeRoom.roomId,
          actorParticipantId: activeRoom.participantId,
          targetParticipantId,
        },
      );

    if (!response.success) {
      setFormError(response.message);
    }
  }

  async function handleCopyRoomId(): Promise<void> {
    if (!activeRoom) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        activeRoom.roomId,
      );

      setRoomNotice(
        "Room ID copied to clipboard.",
      );
    } catch {
      setFormError(
        "Could not copy the room ID automatically.",
      );
    }
  }

  function handleLeaveRoom(): void {
    disconnectSocket();

    setActiveRoom(null);
    setRoomCode("");
    setFormError(null);
    setRoomNotice(null);
    setConnectionStatus("disconnected");

    window.setTimeout(() => {
      setConnectionStatus("connecting");
      connectSocket();
    }, 100);
  }

  return (
    <main className="app-shell">
      <AppHeader
        connectionStatus={connectionStatus}
      />

      {activeRoom ? (
        <RoomWorkspace
          room={activeRoom}
          canControlPlayback={
            canControlPlayback
          }
          isPlaybackCommandPending={
            isPlaybackCommandPending
          }
          isVideoCommandPending={
            isVideoCommandPending
          }
          error={formError}
          notice={roomNotice}
          onCopyRoomId={
            handleCopyRoomId
          }
          onLeaveRoom={
            handleLeaveRoom
          }
          onChangeVideo={
            handleChangeVideo
          }
          onPlay={(positionSeconds) =>
            executePlaybackCommand(
              "room:play",
              positionSeconds,
            )
          }
          onPause={(positionSeconds) =>
            executePlaybackCommand(
              "room:pause",
              positionSeconds,
            )
          }
          onSeek={(positionSeconds) =>
            executePlaybackCommand(
              "room:seek",
              positionSeconds,
            )
          }
          onAssignRole={handleAssignRole}
          onRemoveParticipant={handleRemoveParticipant}
        />
      ) : (
        <LandingView
          entryMode={entryMode}
          displayName={displayName}
          roomCode={roomCode}
          connectionStatus={
            connectionStatus
          }
          error={formError}
          isSubmitting={isSubmitting}
          onEntryModeChange={
            setEntryMode
          }
          onDisplayNameChange={
            setDisplayName
          }
          onRoomCodeChange={
            setRoomCode
          }
          onSubmit={
            handleEntrySubmit
          }
        />
      )}
    </main>
  );
}

type AppHeaderProps = {
  connectionStatus: ConnectionStatus;
};

function AppHeader({
  connectionStatus,
}: AppHeaderProps) {
  return (
    <header className="site-header">
      <a
        className="brand"
        href="/"
        aria-label="SyncRoom home"
      >
        <span className="brand-mark">
          <span />
          <span />
          <span />
        </span>

        <span className="brand-copy">
          <strong>SyncRoom</strong>

          <small>
            Watch together, in sync
          </small>
        </span>
      </a>

      <ConnectionBadge
        status={connectionStatus}
      />
    </header>
  );
}

type ConnectionBadgeProps = {
  status: ConnectionStatus;
};

function ConnectionBadge({
  status,
}: ConnectionBadgeProps) {
  const label =
    status === "connected"
      ? "Realtime connected"
      : status === "connecting"
        ? "Connecting"
        : "Disconnected";

  return (
    <div
      className={`connection-badge connection-badge--${status}`}
    >
      <span className="connection-dot" />
      {label}
    </div>
  );
}

type LandingViewProps = {
  entryMode: EntryMode;
  displayName: string;
  roomCode: string;
  connectionStatus: ConnectionStatus;
  error: string | null;
  isSubmitting: boolean;
  onEntryModeChange: (
    mode: EntryMode,
  ) => void;
  onDisplayNameChange: (
    value: string,
  ) => void;
  onRoomCodeChange: (
    value: string,
  ) => void;
  onSubmit: (
    event: FormEvent<HTMLFormElement>,
  ) => void;
};

function AbstractSyncGraphic() {
  return (
    <div className="abstract-sync-illustration" aria-hidden="true">
      <svg
        className="abstract-sync-svg"
        viewBox="0 0 500 220"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <circle cx="250" cy="110" r="100" fill="url(#sync-emerald-glow)" opacity="0.15" />
        <circle cx="250" cy="110" r="60" fill="url(#sync-amber-glow)" opacity="0.08" />

        <circle cx="250" cy="110" r="95" stroke="#10b981" strokeWidth="1.5" strokeDasharray="6 6" opacity="0.35" />
        <circle cx="250" cy="110" r="70" stroke="#f59e0b" strokeWidth="1" strokeDasharray="4 4" opacity="0.3" />
        <circle cx="250" cy="110" r="45" stroke="#10b981" strokeWidth="1.5" opacity="0.5" />

        <line x1="140" y1="110" x2="360" y2="110" stroke="#10b981" strokeWidth="1.5" opacity="0.45" />
        <line x1="250" y1="15" x2="250" y2="205" stroke="#10b981" strokeWidth="1" strokeDasharray="3 3" opacity="0.25" />

        <circle cx="140" cy="110" r="6" fill="#10b981" />
        <circle cx="140" cy="110" r="12" stroke="#10b981" strokeWidth="1" opacity="0.4" />

        <circle cx="250" cy="110" r="8" fill="#f59e0b" />
        <circle cx="250" cy="110" r="16" stroke="#f59e0b" strokeWidth="1.5" opacity="0.5" />

        <circle cx="360" cy="110" r="6" fill="#10b981" />
        <circle cx="360" cy="110" r="12" stroke="#10b981" strokeWidth="1" opacity="0.4" />

        <path d="M 60 170 Q 120 145 180 170 T 300 170 T 420 170" stroke="#10b981" strokeWidth="1.5" opacity="0.3" fill="none" />
        <path d="M 60 185 Q 130 205 200 185 T 340 185 T 440 185" stroke="#f59e0b" strokeWidth="1" opacity="0.2" fill="none" />

        <defs>
          <radialGradient id="sync-emerald-glow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(250 110) scale(100)">
            <stop stopColor="#10b981" stopOpacity="0.8" />
            <stop offset="1" stopColor="#10b981" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="sync-amber-glow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(250 110) scale(60)">
            <stop stopColor="#f59e0b" stopOpacity="0.8" />
            <stop offset="1" stopColor="#f59e0b" stopOpacity="0" />
          </radialGradient>
        </defs>
      </svg>
    </div>
  );
}

type FeatureCardProps = {
  icon: "play" | "users" | "shield";
  accentColor: "emerald" | "amber";
  title: string;
  description: string;
};

function FeatureCard({ icon, accentColor, title, description }: FeatureCardProps) {
  return (
    <div className={`feature-card feature-card--${accentColor}`}>
      <div className="feature-icon" aria-hidden="true">
        {icon === "play" && (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
        {icon === "users" && (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
          </svg>
        )}
        {icon === "shield" && (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" />
          </svg>
        )}
      </div>
      <div className="feature-text">
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </div>
  );
}

function LandingView({
  entryMode,
  displayName,
  roomCode,
  connectionStatus,
  error,
  isSubmitting,
  onEntryModeChange,
  onDisplayNameChange,
  onRoomCodeChange,
  onSubmit,
}: LandingViewProps) {
  return (
    <section className="landing">
      <div className="landing-copy">
        <div className="eyebrow-pill">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
            <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>
          </svg>
          <span>SERVER-AUTHORITATIVE WATCH PARTIES</span>
        </div>

        <h1 className="hero-title">
          Watch together.<br />
          <span className="hero-highlight">Stay perfectly in sync.</span>
        </h1>

        <p className="landing-description">
          Private rooms, role-based control, and real-time synchronization. One room. One timeline.
        </p>

        <div className="feature-cards-row">
          <FeatureCard
            icon="play"
            accentColor="emerald"
            title="Shared playback"
            description="Everyone stays in sync"
          />
          <FeatureCard
            icon="users"
            accentColor="amber"
            title="Role-based control"
            description="Host controls playback"
          />
          <FeatureCard
            icon="shield"
            accentColor="emerald"
            title="Server authoritative"
            description="Consistent for everyone"
          />
        </div>

        <AbstractSyncGraphic />

        <div className="trust-footer">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
            <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
          </svg>
          <span>No account required • Temporary rooms • Built for small groups</span>
        </div>
      </div>

      <div className="entry-card">
        <div className="entry-tabs" role="tablist" aria-label="Room entry mode">
          <button
            type="button"
            role="tab"
            aria-selected={entryMode === "create"}
            className={`tab-toggle ${entryMode === "create" ? "tab-toggle--active" : ""}`}
            onClick={() => onEntryModeChange("create")}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
            </svg>
            <span>Create room</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={entryMode === "join"}
            className={`tab-toggle ${entryMode === "join" ? "tab-toggle--active" : ""}`}
            onClick={() => onEntryModeChange("join")}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
              <path d="M11 7L9.6 8.4l2.6 2.6H2v2h10.2l-2.6 2.6L11 17l5-5-5-5zm9 12h-8v2h8c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-8v2h8v14z"/>
            </svg>
            <span>Join room</span>
          </button>
        </div>

        <div className="entry-card-header">
          <h2>Enter SyncRoom</h2>
          <p>Create a new room or join an existing one to start watching together.</p>
        </div>

        <form className="entry-form" onSubmit={onSubmit}>
          <label className="field">
            <span className="field-label">Display name</span>
            <div className="input-wrapper">
              <span className="input-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                </svg>
              </span>
              <input
                type="text"
                value={displayName}
                maxLength={40}
                autoComplete="name"
                placeholder="How others will see you"
                onChange={(event) => onDisplayNameChange(event.target.value)}
              />
            </div>
          </label>

          {entryMode === "join" ? (
            <label className="field">
              <span className="field-label">Room ID</span>
              <div className="input-wrapper">
                <span className="input-icon" aria-hidden="true">#</span>
                <input
                  type="text"
                  value={roomCode}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Paste the room ID"
                  onChange={(event) => onRoomCodeChange(event.target.value)}
                />
              </div>
            </label>
          ) : (
            <label className="field">
              <span className="field-label">Room ID (optional)</span>
              <div className="input-wrapper">
                <span className="input-icon" aria-hidden="true">#</span>
                <input
                  type="text"
                  value={roomCode}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Paste the room ID"
                  onChange={(event) => onRoomCodeChange(event.target.value)}
                />
              </div>
            </label>
          )}

          {error ? (
            <InlineMessage variant="error" message={error} />
          ) : null}

          <button
            className="primary-button submit-button"
            type="submit"
            disabled={isSubmitting || connectionStatus !== "connected"}
          >
            <span>
              {isSubmitting
                ? "Preparing room…"
                : entryMode === "create"
                  ? "Create Room"
                  : "Join Room"}
            </span>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
              <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/>
            </svg>
          </button>

          <div className="form-divider" aria-hidden="true">
            <span>or</span>
          </div>

          <button
            type="button"
            className="secondary-action-button"
            onClick={() => onEntryModeChange(entryMode === "create" ? "join" : "create")}
          >
            <span>{entryMode === "create" ? "Join Existing Room" : "Create New Room"}</span>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
              <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
            </svg>
          </button>
        </form>

        <div className="privacy-info-box">
          <span className="info-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
              <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>
            </svg>
          </span>
          <div className="info-text">
            <strong>Rooms live only while participants remain connected.</strong>
            <p>No sign-up required.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

type RoomWorkspaceProps = {
  room: ActiveRoom;
  canControlPlayback: boolean;
  isPlaybackCommandPending: boolean;
  isVideoCommandPending: boolean;
  error: string | null;
  notice: string | null;
  onCopyRoomId: () => void;
  onLeaveRoom: () => void;
  onChangeVideo: (
    videoId: string,
  ) => void;
  onPlay: (
    positionSeconds: number,
  ) => void;
  onPause: (
    positionSeconds: number,
  ) => void;
  onSeek: (
    positionSeconds: number,
  ) => void;
  onAssignRole: (
    targetParticipantId: string,
    role: "moderator" | "participant",
  ) => Promise<void>;
  onRemoveParticipant: (
    targetParticipantId: string,
  ) => Promise<void>;
};

function RoomWorkspace({
  room,
  canControlPlayback,
  isPlaybackCommandPending,
  isVideoCommandPending,
  error,
  notice,
  onCopyRoomId,
  onLeaveRoom,
  onChangeVideo,
  onPlay,
  onPause,
  onSeek,
  onAssignRole,
  onRemoveParticipant,
}: RoomWorkspaceProps) {
  const playerRef =
    useRef<YouTubePlayerHandle>(null);

  const [isPlayerReady, setIsPlayerReady] =
    useState(false);

  const [videoDuration, setVideoDuration] =
    useState(0);

  const [
    displayedPositionSeconds,
    setDisplayedPositionSeconds,
  ] = useState(
    room.playback.positionSeconds,
  );

  const [videoInput, setVideoInput] =
    useState("");

  const [videoInputError, setVideoInputError] =
    useState<string | null>(null);

  const [showUrlFallback, setShowUrlFallback] =
    useState(false);

  const [isDiscoveryOpen, setIsDiscoveryOpen] =
    useState(false);

  const [
    pendingAssignTargetId,
    setPendingAssignTargetId,
  ] = useState<string | null>(null);

  const [
    pendingRemoveTargetId,
    setPendingRemoveTargetId,
  ] = useState<string | null>(null);

  async function handleRoleAssign(
    targetParticipantId: string,
    role: "moderator" | "participant",
  ): Promise<void> {
    if (pendingAssignTargetId !== null) {
      return;
    }

    setPendingAssignTargetId(targetParticipantId);

    try {
      await onAssignRole(
        targetParticipantId,
        role,
      );
    } finally {
      setPendingAssignTargetId(null);
    }
  }

  async function handleParticipantRemoval(
    targetParticipantId: string,
    displayName: string,
  ): Promise<void> {
    if (pendingRemoveTargetId !== null) {
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to remove ${displayName} from the room?`,
    );

    if (!confirmed) {
      return;
    }

    setPendingRemoveTargetId(targetParticipantId);

    try {
      await onRemoveParticipant(targetParticipantId);
    } finally {
      setPendingRemoveTargetId(null);
    }
  }

  const activeVideoId =
    room.playback.videoId;

  useEffect(() => {
    setIsPlayerReady(false);
    setVideoDuration(0);
    setDisplayedPositionSeconds(
      room.playback.positionSeconds,
    );
  }, [activeVideoId]);

  useEffect(() => {
    if (
      !isPlayerReady ||
      !activeVideoId
    ) {
      return;
    }

    function updatePlayerProgress(): void {
      const player = playerRef.current;

      if (!player) {
        return;
      }

      const currentTime =
        player.getCurrentTime();

      if (Number.isFinite(currentTime)) {
        setDisplayedPositionSeconds(
          Math.max(0, currentTime),
        );
      }

      const duration =
        player.getDuration();

      if (
        Number.isFinite(duration) &&
        duration > 0
      ) {
        setVideoDuration(duration);
      }
    }

    updatePlayerProgress();

    const progressInterval =
      window.setInterval(
        updatePlayerProgress,
        250,
      );

    return () => {
      window.clearInterval(
        progressInterval,
      );
    };
  }, [activeVideoId, isPlayerReady]);

  useEffect(() => {
    if (
      !isPlayerReady ||
      !activeVideoId
    ) {
      return;
    }

    const player = playerRef.current;

    if (!player) {
      return;
    }

    const storedPosition = Math.max(
      0,
      room.playback.positionSeconds,
    );

    const updatedAtMilliseconds =
      Date.parse(room.playback.updatedAt);

    const elapsedSeconds =
      room.playback.status === "playing" &&
      Number.isFinite(updatedAtMilliseconds)
        ? Math.max(
            0,
            (Date.now() -
              updatedAtMilliseconds) /
              1_000,
          )
        : 0;

    const playbackRate =
      Number.isFinite(
        room.playback.playbackRate,
      ) &&
      room.playback.playbackRate > 0
        ? room.playback.playbackRate
        : 1;

    const authoritativePosition =
      storedPosition +
      elapsedSeconds * playbackRate;

    const currentPosition =
      player.getCurrentTime();

    const driftSeconds = Math.abs(
      currentPosition -
        authoritativePosition,
    );

    if (driftSeconds > 0.75) {
      player.seekTo(
        authoritativePosition,
      );

      setDisplayedPositionSeconds(
        authoritativePosition,
      );
    }

    if (
      room.playback.status === "playing"
    ) {
      player.play();
      return;
    }

    player.pause();

    setDisplayedPositionSeconds(
      authoritativePosition,
    );
  }, [
    activeVideoId,
    isPlayerReady,
    room.playback.positionSeconds,
    room.playback.status,
    room.playback.playbackRate,
    room.playback.updatedAt,
  ]);

  function handleVideoSubmit(
    event: FormEvent<HTMLFormElement>,
  ): void {
    event.preventDefault();

    setVideoInputError(null);

    const extractedVideoId =
      extractYouTubeVideoId(videoInput);

    if (!extractedVideoId) {
      setVideoInputError(
        "Enter a valid YouTube URL or an 11-character YouTube video ID.",
      );

      return;
    }

    if (
      extractedVideoId ===
      room.playback.videoId
    ) {
      setVideoInputError(
        "That video is already selected.",
      );

      return;
    }

    onChangeVideo(extractedVideoId);
    setVideoInput("");
  }

  return (
    <section className="room-workspace">
      <div className="room-toolbar">
        <div>
          <span className="toolbar-label">
            Active room
          </span>

          <div className="room-code-row">
            <strong>
              {shortenRoomId(room.roomId)}
            </strong>

            <button
              type="button"
              className="text-button"
              onClick={onCopyRoomId}
            >
              Copy full ID
            </button>
          </div>
        </div>

        <div className="toolbar-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={onLeaveRoom}
          >
            Leave room
          </button>
        </div>
      </div>

      {notice ? (
        <InlineMessage
          variant="notice"
          message={notice}
        />
      ) : null}

      {error ? (
        <InlineMessage
          variant="error"
          message={error}
        />
      ) : null}

      <div className="room-grid">
        <div className="player-column">
          {activeVideoId ? (
            <>
              <div className="active-player-header">
                <div className="active-player-title">
                  <span>Now Playing</span>
                  <strong>Synchronized Room Playback</strong>
                </div>

                <div className="active-player-actions">
                  {showUrlFallback ? (
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setShowUrlFallback(false)}
                    >
                      Browse YouTube
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="secondary-button browse-videos-button"
                      onClick={() => setIsDiscoveryOpen((prev) => !prev)}
                    >
                      {isDiscoveryOpen ? "Hide Search" : "Browse Videos"}
                    </button>
                  )}
                </div>
              </div>

              {showUrlFallback ? (
                <form
                  className="video-selector active-mode-form"
                  onSubmit={handleVideoSubmit}
                >
                  <div className="video-selector-controls">
                    <input
                      type="text"
                      value={videoInput}
                      disabled={
                        !canControlPlayback ||
                        isVideoCommandPending
                      }
                      placeholder="Paste a YouTube URL or video ID"
                      autoComplete="off"
                      spellCheck={false}
                      onChange={(event) => {
                        setVideoInput(
                          event.target.value,
                        );

                        setVideoInputError(null);
                      }}
                    />

                    <button
                      type="submit"
                      className="primary-button video-selector-button"
                      disabled={
                        !canControlPlayback ||
                        isVideoCommandPending ||
                        !videoInput.trim()
                      }
                    >
                      {isVideoCommandPending
                        ? "Changing…"
                        : "Change video"}
                    </button>
                  </div>

                  {videoInputError ? (
                    <p className="video-selector-error">
                      {videoInputError}
                    </p>
                  ) : null}
                </form>
              ) : isDiscoveryOpen ? (
                <div className="collapsible-discovery-wrapper">
                  <YouTubeBrowser
                    canControlPlayback={canControlPlayback}
                    isVideoCommandPending={isVideoCommandPending}
                    activeVideoId={activeVideoId}
                    onSelectVideo={(selectedVideoId) => {
                      setIsDiscoveryOpen(false);
                      onChangeVideo(selectedVideoId);
                    }}
                    onToggleUrlFallback={() => setShowUrlFallback(true)}
                    onCloseDiscovery={() => setIsDiscoveryOpen(false)}
                  />
                </div>
              ) : null}

              <div className="player-shell">
                <div
                  className="youtube-player-container"
                  style={{
                    position: "relative",
                  }}
                >
                  <YouTubePlayer
                    key={activeVideoId}
                    ref={playerRef}
                    className="youtube-player"
                    videoId={activeVideoId}
                    startSeconds={
                      room.playback
                        .positionSeconds
                    }
                    controls={false}
                    onReady={() => {
                      setIsPlayerReady(true);

                      const player =
                        playerRef.current;

                      if (!player) {
                        return;
                      }

                      setDisplayedPositionSeconds(
                        Math.max(
                          0,
                          player.getCurrentTime(),
                        ),
                      );

                      setVideoDuration(
                        Math.max(
                          0,
                          player.getDuration(),
                        ),
                      );
                    }}
                    onError={() => {
                      setIsPlayerReady(false);
                      setVideoDuration(0);
                    }}
                  />

                  {room.playback.status === "paused" ? (
                    canControlPlayback ? (
                      <button
                        type="button"
                        className="play-overlay-button"
                        aria-label="Play the synchronized video"
                        title="Play for everyone"
                        disabled={
                          !isPlayerReady ||
                          isPlaybackCommandPending
                        }
                        onClick={() => {
                          const currentTime =
                            playerRef.current?.getCurrentTime();

                          const positionSeconds =
                            typeof currentTime === "number" &&
                            Number.isFinite(currentTime)
                              ? Math.max(0, currentTime)
                              : displayedPositionSeconds;

                          onPlay(positionSeconds);
                        }}
                        style={{
                          backgroundImage: `linear-gradient(
                            rgba(0, 0, 0, 0.25),
                            rgba(0, 0, 0, 0.55)
                          ), url("https://i.ytimg.com/vi/${activeVideoId}/hqdefault.jpg")`,
                        }}
                      >
                        <span className="play-overlay-badge" aria-hidden="true">
                          <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </span>
                      </button>
                    ) : (
                      <div
                        className="youtube-player-lock"
                        aria-label="Use the synchronized controls below the video"
                        title="Use the synchronized room controls below"
                        style={{
                          backgroundImage: `linear-gradient(
                            rgba(0, 0, 0, 0.18),
                            rgba(0, 0, 0, 0.38)
                          ), url("https://i.ytimg.com/vi/${activeVideoId}/hqdefault.jpg")`,
                        }}
                      >
                        <span className="player-lock-chip">
                          Use the controls below
                        </span>
                      </div>
                    )
                  ) : (
                    <div
                      className="youtube-player-lock"
                      aria-label="Use the synchronized controls below the video"
                      title="Use the synchronized room controls below"
                      style={{
                        position: "absolute",
                        inset: 0,
                        zIndex: 10,
                        pointerEvents: "auto",
                        cursor: "default",
                        background: "transparent",
                      }}
                    />
                  )}
                </div>

                <PlaybackControls
                  playbackStatus={
                    room.playback.status
                  }
                  positionSeconds={
                    displayedPositionSeconds
                  }
                  durationSeconds={
                    videoDuration
                  }
                  canControl={
                    canControlPlayback
                  }
                  isPending={
                    isPlaybackCommandPending
                  }
                  onPlay={() => {
                    const currentTime =
                      playerRef.current?.getCurrentTime();

                    onPlay(
                      currentTime !== undefined &&
                      Number.isFinite(currentTime)
                        ? Math.max(
                            0,
                            currentTime,
                          )
                        : displayedPositionSeconds,
                    );
                  }}
                  onPause={() => {
                    const currentTime =
                      playerRef.current?.getCurrentTime();

                    onPause(
                      currentTime !== undefined &&
                      Number.isFinite(currentTime)
                        ? Math.max(
                            0,
                            currentTime,
                          )
                        : displayedPositionSeconds,
                    );
                  }}
                  onSeek={(positionSeconds) => {
                    playerRef.current?.seekTo(
                      positionSeconds,
                    );

                    setDisplayedPositionSeconds(
                      positionSeconds,
                    );

                    onSeek(positionSeconds);
                  }}
                />

                <div className="live-sync-bar" role="status">
                  <span className="sync-pulse" aria-hidden="true" />
                  <span className="sync-status-text">Live Sync</span>
                  <span className="sync-divider">•</span>
                  <span className="sync-meta-text">Server Authoritative Playback</span>
                </div>
              </div>
            </>
          ) : (
            <>
              {showUrlFallback ? (
                <form
                  className="video-selector"
                  onSubmit={handleVideoSubmit}
                >
                  <div className="video-selector-copy">
                    <span>Direct Media Link</span>

                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setShowUrlFallback(false)}
                    >
                      Back to YouTube Search
                    </button>
                  </div>

                  <div className="video-selector-controls">
                    <input
                      type="text"
                      value={videoInput}
                      disabled={
                        !canControlPlayback ||
                        isVideoCommandPending
                      }
                      placeholder="Paste a YouTube URL or video ID"
                      autoComplete="off"
                      spellCheck={false}
                      onChange={(event) => {
                        setVideoInput(
                          event.target.value,
                        );

                        setVideoInputError(null);
                      }}
                    />

                    <button
                      type="submit"
                      className="primary-button video-selector-button"
                      disabled={
                        !canControlPlayback ||
                        isVideoCommandPending ||
                        !videoInput.trim()
                      }
                    >
                      {isVideoCommandPending
                        ? "Changing…"
                        : "Change video"}
                    </button>
                  </div>

                  {videoInputError ? (
                    <p className="video-selector-error">
                      {videoInputError}
                    </p>
                  ) : null}

                  {!canControlPlayback ? (
                    <p className="video-selector-note">
                      Only the host or a moderator
                      can change the shared video.
                    </p>
                  ) : null}
                </form>
              ) : (
                <YouTubeBrowser
                  canControlPlayback={canControlPlayback}
                  isVideoCommandPending={isVideoCommandPending}
                  activeVideoId={activeVideoId}
                  onSelectVideo={(selectedVideoId) => onChangeVideo(selectedVideoId)}
                  onToggleUrlFallback={() => setShowUrlFallback(true)}
                />
              )}
            </>
          )}

          <div className="authority-card">
            <div>
              <span className="authority-label">
                Your authority
              </span>

              <h3>
                {canControlPlayback
                  ? "Playback controls enabled"
                  : "Following the host timeline"}
              </h3>

              <p>
                {canControlPlayback
                  ? "Use the synchronized controls below the video. Direct YouTube controls are intentionally disabled."
                  : "Playback changes arrive automatically from the authoritative server."}
              </p>
            </div>

            <RoleBadge role={room.role} />
          </div>
        </div>

        <ParticipantsPanel
          room={room}
          isHost={room.role === "host"}
          pendingAssignTargetId={pendingAssignTargetId}
          pendingRemoveTargetId={pendingRemoveTargetId}
          onAssignRole={handleRoleAssign}
          onRemoveParticipant={handleParticipantRemoval}
        />
      </div>
    </section>
  );
}

function extractYouTubeVideoId(
  input: string,
): string | null {
  const normalizedInput = input.trim();

  const videoIdPattern =
    /^[a-zA-Z0-9_-]{11}$/;

  if (
    videoIdPattern.test(normalizedInput)
  ) {
    return normalizedInput;
  }

  try {
    const url = new URL(normalizedInput);

    const hostname =
      url.hostname.replace(/^www\./, "");

    if (hostname === "youtu.be") {
      const videoId =
        url.pathname
          .split("/")
          .filter(Boolean)[0] ?? "";

      return videoIdPattern.test(videoId)
        ? videoId
        : null;
    }

    if (
      hostname === "youtube.com" ||
      hostname === "m.youtube.com" ||
      hostname === "music.youtube.com"
    ) {
      const queryVideoId =
        url.searchParams.get("v");

      if (
        queryVideoId &&
        videoIdPattern.test(queryVideoId)
      ) {
        return queryVideoId;
      }

      const pathParts =
        url.pathname
          .split("/")
          .filter(Boolean);

      if (
        pathParts[0] === "shorts" ||
        pathParts[0] === "embed" ||
        pathParts[0] === "live"
      ) {
        const pathVideoId =
          pathParts[1] ?? "";

        return videoIdPattern.test(
          pathVideoId,
        )
          ? pathVideoId
          : null;
      }
    }
  } catch {
    return null;
  }

  return null;
}


type ParticipantActionMenuProps = {
  triggerRect: DOMRect;
  participant: Participant;
  isPendingAssign: boolean;
  isPendingRemove: boolean;
  onAssignRole: () => void;
  onRemoveParticipant: () => void;
  onClose: () => void;
};

function ParticipantActionMenu({
  triggerRect,
  participant,
  isPendingAssign,
  isPendingRemove,
  onAssignRole,
  onRemoveParticipant,
  onClose,
}: ParticipantActionMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
  }>(() => {
    const menuWidth = 180;
    const menuHeight = 96;
    const gap = 8;

    const hasSpaceBelow =
      window.innerHeight - triggerRect.bottom >= menuHeight + gap;

    const top = hasSpaceBelow
      ? triggerRect.bottom + gap
      : Math.max(gap, triggerRect.top - menuHeight - gap);

    const left = Math.min(
      window.innerWidth - menuWidth - gap,
      Math.max(gap, triggerRect.right - menuWidth),
    );

    return { top, left };
  });

  useLayoutEffect(() => {
    if (!menuRef.current) {
      return;
    }

    const rect = menuRef.current.getBoundingClientRect();
    const menuWidth = rect.width || 180;
    const menuHeight = rect.height || 96;
    const gap = 8;

    const hasSpaceBelow =
      window.innerHeight - triggerRect.bottom >= menuHeight + gap;

    const top = hasSpaceBelow
      ? triggerRect.bottom + gap
      : Math.max(gap, triggerRect.top - menuHeight - gap);

    const left = Math.min(
      window.innerWidth - menuWidth - gap,
      Math.max(gap, triggerRect.right - menuWidth),
    );

    setMenuPosition({ top, left });
  }, [triggerRect]);

  useEffect(() => {
    function handleScrollOrResize(): void {
      onClose();
    }

    window.addEventListener("resize", handleScrollOrResize);
    window.addEventListener("scroll", handleScrollOrResize, true);

    return () => {
      window.removeEventListener("resize", handleScrollOrResize);
      window.removeEventListener("scroll", handleScrollOrResize, true);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={menuRef}
      className="participant-menu-dropdown"
      role="menu"
      style={{
        position: "fixed",
        top: `${menuPosition.top}px`,
        left: `${menuPosition.left}px`,
        width: "180px",
        zIndex: 1000,
      }}
    >
      <button
        type="button"
        className="menu-item"
        role="menuitem"
        disabled={isPendingAssign || isPendingRemove}
        onClick={onAssignRole}
      >
        {isPendingAssign
          ? "Updating…"
          : participant.role === "moderator"
            ? "Make Participant"
            : "Make Moderator"}
      </button>

      <button
        type="button"
        className="menu-item menu-item--danger"
        role="menuitem"
        disabled={isPendingAssign || isPendingRemove}
        onClick={onRemoveParticipant}
      >
        {isPendingRemove ? "Removing…" : "Remove Member"}
      </button>
    </div>,
    document.body,
  );
}

type ParticipantsPanelProps = {
  room: ActiveRoom;
  isHost: boolean;
  pendingAssignTargetId: string | null;
  pendingRemoveTargetId: string | null;
  onAssignRole: (
    targetParticipantId: string,
    role: "moderator" | "participant",
  ) => void;
  onRemoveParticipant: (
    targetParticipantId: string,
    displayName: string,
  ) => void;
};

function ParticipantsPanel({
  room,
  isHost,
  pendingAssignTargetId,
  pendingRemoveTargetId,
  onAssignRole,
  onRemoveParticipant,
}: ParticipantsPanelProps) {
  const [activeMenuState, setActiveMenuState] = useState<{
    participantId: string;
    triggerRect: DOMRect;
  } | null>(null);

  useEffect(() => {
    if (activeMenuState === null) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setActiveMenuState(null);
      }
    }

    function handlePointerDown(event: PointerEvent): void {
      const target = event.target as Node | null;
      if (
        target &&
        !target.parentElement?.closest(".participant-card-menu-container") &&
        !target.parentElement?.closest(".participant-menu-dropdown")
      ) {
        setActiveMenuState(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("pointerdown", handlePointerDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [activeMenuState]);

  return (
    <aside className="participants-panel">
      <div className="panel-header">
        <div>
          <span>Room members</span>

          <h2>Participants</h2>
        </div>

        <strong className="participant-count">
          {room.participants.length}
        </strong>
      </div>

      <div className="participant-list">
        {room.participants.map(
          (participant) => {
            const isCurrentUser =
              participant.id ===
              room.participantId;

            const canManageRoles =
              isHost &&
              !isCurrentUser &&
              participant.role !== "host";

            const isPendingAssignThisParticipant =
              pendingAssignTargetId === participant.id;

            const isPendingRemoveThisParticipant =
              pendingRemoveTargetId === participant.id;

            const isMenuOpen =
              activeMenuState?.participantId === participant.id;

            return (
              <article
                className="participant-card"
                key={participant.id}
              >
                <div className="avatar">
                  {getInitials(
                    participant.displayName,
                  )}
                </div>

                <div className="participant-copy">
                  <strong>
                    {participant.displayName}
                  </strong>

                  <span>
                    {isCurrentUser
                      ? "You"
                      : "Connected"}
                  </span>
                </div>

                <div className="participant-card-actions">
                  <RoleBadge
                    role={participant.role}
                  />

                  {canManageRoles ? (
                    <div className="participant-card-menu-container">
                      <button
                        type="button"
                        className="menu-trigger-button"
                        aria-label={`Actions for ${participant.displayName}`}
                        aria-expanded={isMenuOpen}
                        aria-haspopup="true"
                        disabled={
                          pendingAssignTargetId !== null ||
                          pendingRemoveTargetId !== null
                        }
                        onClick={(event) => {
                          const rect =
                            event.currentTarget.getBoundingClientRect();

                          setActiveMenuState((current) =>
                            current?.participantId === participant.id
                              ? null
                              : {
                                  participantId: participant.id,
                                  triggerRect: rect,
                                },
                          );
                        }}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          width="18"
                          height="18"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                        </svg>
                      </button>

                      {isMenuOpen && activeMenuState ? (
                        <ParticipantActionMenu
                          triggerRect={activeMenuState.triggerRect}
                          participant={participant}
                          isPendingAssign={
                            isPendingAssignThisParticipant
                          }
                          isPendingRemove={
                            isPendingRemoveThisParticipant
                          }
                          onAssignRole={() => {
                            setActiveMenuState(null);
                            onAssignRole(
                              participant.id,
                              participant.role === "moderator"
                                ? "participant"
                                : "moderator",
                            );
                          }}
                          onRemoveParticipant={() => {
                            setActiveMenuState(null);
                            onRemoveParticipant(
                              participant.id,
                              participant.displayName,
                            );
                          }}
                          onClose={() => setActiveMenuState(null)}
                        />
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </article>
            );
          },
        )}
      </div>

      <div className="panel-footer">
        <span className="live-indicator">
          <span />
          Live presence
        </span>

        <p>
          Membership and role changes are
          synchronized by the server.
        </p>
      </div>
    </aside>
  );
}


type InlineMessageProps = {
  variant:
    | "error"
    | "notice";
  message: string;
};

function InlineMessage({
  variant,
  message,
}: InlineMessageProps) {
  return (
    <div
      className={`inline-message inline-message--${variant}`}
      role={
        variant === "error"
          ? "alert"
          : "status"
      }
    >
      <span aria-hidden="true">
        {variant === "error"
          ? "!"
          : "✓"}
      </span>

      <p>{message}</p>
    </div>
  );
}

function emitWithAcknowledgement<
  TResponse,
>(
  eventName: AcknowledgementEventName,
  payload: unknown,
): Promise<TResponse> {
  return new Promise<TResponse>(
    (resolve, reject) => {
      const timeout =
        window.setTimeout(() => {
          reject(
            new Error(
              `The server did not acknowledge "${eventName}".`,
            ),
          );
        }, acknowledgementTimeoutMilliseconds);

      const runtimeSocket =
        socket as unknown as RuntimeAcknowledgementSocket;

      runtimeSocket.emit(
        eventName,
        payload,
        (response: unknown) => {
          window.clearTimeout(timeout);
          resolve(response as TResponse);
        },
      );
    },
  );
}

export default App;