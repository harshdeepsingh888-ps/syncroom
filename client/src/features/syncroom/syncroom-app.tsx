import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import "../../App.css";

import {
  YouTubePlayer,
  type YouTubePlayerHandle,
} from "../player/youtube-player";

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
  CreateRoomResponse,
  HostTransferredEvent,
  JoinRoomResponse,
  ParticipantJoinedEvent,
  ParticipantLeftEvent,
  PlaybackCommandResponse,
  PlaybackUpdatedEvent,
  RealtimeErrorEvent,
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
  | "room:change-video";

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
          <form
            className="video-selector"
            onSubmit={handleVideoSubmit}
          >
            <div className="video-selector-copy">
              <span>Shared video</span>

              <strong>
                Change the room media
              </strong>
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

          <div className="player-shell">
            {activeVideoId ? (
              <>
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
        position: "absolute",
        inset: 0,
        zIndex: 20,
        display: "grid",
        placeItems: "center",
        width: "100%",
        border: 0,
        padding: 0,
        cursor:
          !isPlayerReady ||
          isPlaybackCommandPending
            ? "not-allowed"
            : "pointer",
        backgroundImage: `linear-gradient(
          rgba(0, 0, 0, 0.2),
          rgba(0, 0, 0, 0.45)
        ), url("https://i.ytimg.com/vi/${activeVideoId}/hqdefault.jpg")`,
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundSize: "cover",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: "grid",
          placeItems: "center",
          width: "72px",
          height: "52px",
          borderRadius: "14px",
          background: "#16a34a",
          color: "#ffffff",
          fontSize: "26px",
          lineHeight: 1,
          boxShadow:
            "0 12px 30px rgba(0, 0, 0, 0.35)",
        }}
      >
        ▶
      </span>
    </button>
  ) : (
    <div
  className="youtube-player-lock"
  aria-label="Use the synchronized controls below the video"
  title="Use the synchronized room controls below"
  style={{
    position: "absolute",
    inset: 0,
    zIndex: 20,
    display: "grid",
    placeItems: "center",
    pointerEvents: "auto",
    cursor: "default",
    backgroundImage: `linear-gradient(
      rgba(0, 0, 0, 0.18),
      rgba(0, 0, 0, 0.38)
    ), url("https://i.ytimg.com/vi/${activeVideoId}/hqdefault.jpg")`,
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    backgroundSize: "cover",
  }}
>
  <span
    style={{
      padding: "10px 16px",
      borderRadius: "999px",
      background: "rgba(0, 0, 0, 0.72)",
      color: "#ffffff",
      fontSize: "14px",
      fontWeight: 700,
    }}
  >
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
              </>
            ) : (
              <div className="empty-player">
                <span className="empty-player-icon">
                  ▶
                </span>

                <h2>
                  No video selected
                </h2>

                <p>
                  Paste a YouTube URL above to
                  begin the shared watch
                  session.
                </p>
              </div>
            )}
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
                  ? "Use the synchronized controls below the video. Direct YouTube controls are intentionally disabled."
                  : "Playback changes arrive automatically from the authoritative server."}
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