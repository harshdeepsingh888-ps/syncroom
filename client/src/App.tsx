import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import "./App.css";

import {
  YouTubePlayer,
  type YouTubePlayerHandle,
} from "./features/player/youtube-player";

import {
  connectSocket,
  disconnectSocket,
  socket,
} from "./lib/socket";

import type {
  ActiveRoom,
  CreateRoomResponse,
  HostTransferredEvent,
  JoinRoomResponse,
  ParticipantJoinedEvent,
  ParticipantLeftEvent,
  PlaybackCommandResponse,
  PlaybackUpdatedEvent,
  RealtimeErrorEvent,
} from "./types/realtime";

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
  | "room:seek";

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
            status: "paused",
            positionSeconds: 0,
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
          error={formError}
          notice={roomNotice}
          onCopyRoomId={
            handleCopyRoomId
          }
          onLeaveRoom={
            handleLeaveRoom
          }
          onPlay={() =>
            executePlaybackCommand(
              "room:play",
              activeRoom.playback
                .positionSeconds,
            )
          }
          onPause={() =>
            executePlaybackCommand(
              "room:pause",
              activeRoom.playback
                .positionSeconds,
            )
          }
          onSeek={(positionSeconds) =>
            executePlaybackCommand(
              "room:seek",
              positionSeconds,
            )
          }
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
        <div className="eyebrow">
          Server-authoritative watch parties
        </div>

        <h1>
          One room.
          <span>
            One shared timeline.
          </span>
        </h1>

        <p className="landing-description">
          Create a private room, invite your
          friends, and keep every participant
          synchronized through a single
          authoritative playback state.
        </p>

        <div className="feature-list">
          <FeatureItem
            number="01"
            title="Shared playback"
            description="Play, pause, and seek updates are distributed in real time."
          />

          <FeatureItem
            number="02"
            title="Role-based control"
            description="Hosts and moderators control the room timeline."
          />

          <FeatureItem
            number="03"
            title="Automatic continuity"
            description="Host authority transfers when the current host leaves."
          />
        </div>
      </div>

      <div className="entry-card">
        <div className="entry-card-header">
          <span className="entry-card-kicker">
            Enter SyncRoom
          </span>

          <h2>
            Start watching together
          </h2>

          <p>
            Choose whether to create a new
            room or enter an existing one.
          </p>
        </div>

        <div
          className="entry-tabs"
          role="tablist"
          aria-label="Room entry mode"
        >
          <button
            type="button"
            role="tab"
            aria-selected={
              entryMode === "create"
            }
            className={
              entryMode === "create"
                ? "entry-tab entry-tab--active"
                : "entry-tab"
            }
            onClick={() =>
              onEntryModeChange("create")
            }
          >
            Create room
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={
              entryMode === "join"
            }
            className={
              entryMode === "join"
                ? "entry-tab entry-tab--active"
                : "entry-tab"
            }
            onClick={() =>
              onEntryModeChange("join")
            }
          >
            Join room
          </button>
        </div>

        <form
          className="entry-form"
          onSubmit={onSubmit}
        >
          <label className="field">
            <span>Display name</span>

            <input
              type="text"
              value={displayName}
              maxLength={40}
              autoComplete="name"
              placeholder="How others will see you"
              onChange={(event) =>
                onDisplayNameChange(
                  event.target.value,
                )
              }
            />
          </label>

          {entryMode === "join" ? (
            <label className="field">
              <span>Room ID</span>

              <input
                type="text"
                value={roomCode}
                autoComplete="off"
                spellCheck={false}
                placeholder="Paste the room ID"
                onChange={(event) =>
                  onRoomCodeChange(
                    event.target.value,
                  )
                }
              />
            </label>
          ) : (
            <div className="creation-summary">
              <span className="summary-icon">
                +
              </span>

              <div>
                <strong>
                  A private room will be
                  created
                </strong>

                <p>
                  You will become the initial
                  host and receive a shareable
                  room ID.
                </p>
              </div>
            </div>
          )}

          {error ? (
            <InlineMessage
              variant="error"
              message={error}
            />
          ) : null}

          <button
            className="primary-button"
            type="submit"
            disabled={
              isSubmitting ||
              connectionStatus !==
                "connected"
            }
          >
            {isSubmitting
              ? "Preparing room…"
              : entryMode === "create"
                ? "Create SyncRoom"
                : "Join SyncRoom"}

            <span aria-hidden="true">
              →
            </span>
          </button>
        </form>

        <p className="entry-footnote">
          No account required. Rooms live only
          while participants remain connected.
        </p>
      </div>
    </section>
  );
}

type FeatureItemProps = {
  number: string;
  title: string;
  description: string;
};

function FeatureItem({
  number,
  title,
  description,
}: FeatureItemProps) {
  return (
    <article className="feature-item">
      <span>{number}</span>

      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </article>
  );
}

type RoomWorkspaceProps = {
  room: ActiveRoom;
  canControlPlayback: boolean;
  isPlaybackCommandPending: boolean;
  error: string | null;
  notice: string | null;
  onCopyRoomId: () => void;
  onLeaveRoom: () => void;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (
    positionSeconds: number,
  ) => void;
};

function RoomWorkspace({
  room,
  canControlPlayback,
  isPlaybackCommandPending,
  error,
  notice,
  onCopyRoomId,
  onLeaveRoom,
  onPlay,
  onPause,
  onSeek,
}: RoomWorkspaceProps) {
  const playerRef =
    useRef<YouTubePlayerHandle>(null);

  const [isPlayerReady, setIsPlayerReady] =
    useState(false);

  useEffect(() => {
    if (!isPlayerReady) {
      return;
    }

    const player = playerRef.current;

    if (!player) {
      return;
    }

    const authoritativePosition =
      room.playback.positionSeconds;

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
    }

    if (
      room.playback.status === "playing"
    ) {
      player.play();
      return;
    }

    player.pause();
  }, [
    isPlayerReady,
    room.playback.positionSeconds,
    room.playback.status,
  ]);

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
          <span className="version-badge">
            Version {room.roomVersion}
          </span>

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
          <div className="player-shell">
            <YouTubePlayer
              ref={playerRef}
              className="youtube-player"
              videoId="dQw4w9WgXcQ"
              startSeconds={0}
              controls={canControlPlayback}
              onReady={() => {
                setIsPlayerReady(true);
              }}
              onError={() => {
                setIsPlayerReady(false);
              }}
            />

            <PlaybackControls
              key={`${room.roomVersion}:${room.playback.positionSeconds}`}
              playbackStatus={
                room.playback.status
              }
              positionSeconds={
                room.playback
                  .positionSeconds
              }
              canControl={
                canControlPlayback
              }
              isPending={
                isPlaybackCommandPending
              }
              onPlay={onPlay}
              onPause={onPause}
              onSeek={onSeek}
            />
          </div>

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
                  ? "Your commands are validated by the server before becoming room state."
                  : "Playback changes will arrive automatically from the authoritative server."}
              </p>
            </div>

            <RoleBadge role={room.role} />
          </div>
        </div>

        <ParticipantsPanel room={room} />
      </div>
    </section>
  );
}

type PlaybackControlsProps = {
  playbackStatus:
    | "playing"
    | "paused";
  positionSeconds: number;
  canControl: boolean;
  isPending: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (
    positionSeconds: number,
  ) => void;
};

function PlaybackControls({
  playbackStatus,
  positionSeconds,
  canControl,
  isPending,
  onPlay,
  onPause,
  onSeek,
}: PlaybackControlsProps) {
  const [seekValue, setSeekValue] =
    useState(positionSeconds);

  return (
    <div className="playback-controls">
      <div className="playback-actions">
        <button
          type="button"
          className="control-button"
          disabled={
            !canControl || isPending
          }
          onClick={
            playbackStatus === "playing"
              ? onPause
              : onPlay
          }
        >
          <span className="control-icon">
            {playbackStatus === "playing"
              ? "Ⅱ"
              : "▶"}
          </span>

          {playbackStatus === "playing"
            ? "Pause"
            : "Play"}
        </button>

        <div className="timeline-status">
          <span>
            Authoritative position
          </span>

          <strong>
            {formatPlaybackTime(
              positionSeconds,
            )}
          </strong>
        </div>
      </div>

      <label className="seek-control">
        <span className="seek-label-row">
          <span>Seek position</span>

          <strong>
            {formatPlaybackTime(seekValue)}
          </strong>
        </span>

        <input
          type="range"
          min="0"
          max="7200"
          step="1"
          value={seekValue}
          disabled={
            !canControl || isPending
          }
          onChange={(event) =>
            setSeekValue(
              Number(event.target.value),
            )
          }
          onPointerUp={() =>
            onSeek(seekValue)
          }
          onKeyUp={(event) => {
            if (
              event.key === "Enter" ||
              event.key === " "
            ) {
              onSeek(seekValue);
            }
          }}
        />
      </label>

      {!canControl ? (
        <p className="control-note">
          Playback controls are available to
          hosts and moderators.
        </p>
      ) : null}
    </div>
  );
}

type ParticipantsPanelProps = {
  room: ActiveRoom;
};

function ParticipantsPanel({
  room,
}: ParticipantsPanelProps) {
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

                <RoleBadge
                  role={participant.role}
                />
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

type RoleBadgeProps = {
  role:
    | "host"
    | "moderator"
    | "participant";
};

function RoleBadge({
  role,
}: RoleBadgeProps) {
  return (
    <span
      className={`role-badge role-badge--${role}`}
    >
      {role}
    </span>
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

function shortenRoomId(
  roomId: string,
): string {
  if (roomId.length <= 16) {
    return roomId;
  }

  return `${roomId.slice(0, 8)}…${roomId.slice(-6)}`;
}

function formatPlaybackTime(
  totalSeconds: number,
): string {
  const normalizedSeconds = Math.max(
    0,
    Math.floor(totalSeconds),
  );

  const hours = Math.floor(
    normalizedSeconds / 3600,
  );

  const minutes = Math.floor(
    (normalizedSeconds % 3600) / 60,
  );

  const seconds =
    normalizedSeconds % 60;

  if (hours > 0) {
    return [
      hours,
      minutes
        .toString()
        .padStart(2, "0"),
      seconds
        .toString()
        .padStart(2, "0"),
    ].join(":");
  }

  return [
    minutes,
    seconds
      .toString()
      .padStart(2, "0"),
  ].join(":");
}

function getInitials(
  displayName: string,
): string {
  const parts = displayName
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return "?";
  }

  if (parts.length === 1) {
    return parts[0]
      .slice(0, 2)
      .toUpperCase();
  }

  return `${parts[0][0]}${parts.at(-1)?.[0] ?? ""}`.toUpperCase();
}

export default App;