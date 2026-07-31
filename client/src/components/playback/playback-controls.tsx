import {
  useEffect,
  useState,
} from "react";

import {
  formatPlaybackTime,
} from "../../utils/room-formatters";

type PlaybackStatus =
  | "playing"
  | "paused";

type PlaybackControlsProps = {
  playbackStatus: PlaybackStatus;
  positionSeconds: number;
  durationSeconds: number;
  canControl: boolean;
  isPending: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (
    positionSeconds: number,
  ) => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
};

export function PlaybackControls({
  playbackStatus,
  positionSeconds,
  durationSeconds,
  canControl,
  isPending,
  onPlay,
  onPause,
  onSeek,
  isFullscreen = false,
  onToggleFullscreen,
}: PlaybackControlsProps) {
  const normalizedDuration = Math.max(
    0,
    durationSeconds,
  );

  const maximumSeekValue = Math.max(
    1,
    normalizedDuration,
  );

  const normalizedPosition = Math.min(
    Math.max(0, positionSeconds),
    maximumSeekValue,
  );

  const [seekValue, setSeekValue] =
    useState(normalizedPosition);

  const [isSeeking, setIsSeeking] =
    useState(false);

  const controlsDisabled =
    !canControl || isPending;

  const seekDisabled =
    controlsDisabled ||
    normalizedDuration <= 0;

  useEffect(() => {
    if (!isSeeking) {
      setSeekValue(normalizedPosition);
    }
  }, [isSeeking, normalizedPosition]);

  function submitSeek(
    requestedPosition: number,
  ): void {
    if (seekDisabled) {
      return;
    }

    const clampedPosition = Math.min(
      Math.max(0, requestedPosition),
      normalizedDuration,
    );

    setSeekValue(clampedPosition);
    onSeek(clampedPosition);
  }

  return (
    <div className="playback-controls">
      <div className="playback-actions">
        <button
          type="button"
          className="control-button"
          disabled={controlsDisabled}
          aria-label={
            playbackStatus === "playing"
              ? "Pause synchronized playback"
              : "Start synchronized playback"
          }
          onClick={
            playbackStatus === "playing"
              ? onPause
              : onPlay
          }
        >
          <span
            className="control-icon"
            aria-hidden="true"
          >
            {playbackStatus === "playing" ? (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </span>

          {playbackStatus === "playing"
            ? "Pause"
            : "Play"}
        </button>

        <div className="playback-right-controls">
          <div className="timeline-status">
            <span>
              Shared playback
            </span>

            <strong>
              {formatPlaybackTime(
                normalizedPosition,
              )}
              {" / "}
              {formatPlaybackTime(
                normalizedDuration,
              )}
            </strong>
          </div>

          {onToggleFullscreen ? (
            <button
              type="button"
              className="secondary-button fullscreen-toggle-button"
              aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen player"}
              onClick={onToggleFullscreen}
            >
              <span className="control-icon" aria-hidden="true">
                {isFullscreen ? (
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
                  </svg>
                )}
              </span>
              <span>{isFullscreen ? "Exit" : "Fullscreen"}</span>
            </button>
          ) : null}
        </div>
      </div>

      <label className="seek-control">
        <span className="seek-label-row">
          <span>
            Video progress
          </span>

          <strong>
            {formatPlaybackTime(
              isSeeking
                ? seekValue
                : normalizedPosition,
            )}
            {" / "}
            {formatPlaybackTime(
              normalizedDuration,
            )}
          </strong>
        </span>

        <input
          type="range"
          min="0"
          max={maximumSeekValue}
          step="0.1"
          value={
            isSeeking
              ? seekValue
              : normalizedPosition
          }
          disabled={seekDisabled}
          aria-label="Synchronized video progress"
          onPointerDown={() => {
            setIsSeeking(true);
          }}
          onChange={(event) => {
            setSeekValue(
              Number(event.target.value),
            );
          }}
          onPointerUp={(event) => {
            const nextPosition =
              Number(
                event.currentTarget.value,
              );

            setIsSeeking(false);
            submitSeek(nextPosition);
          }}
          onPointerCancel={() => {
            setIsSeeking(false);
          }}
          onKeyUp={(event) => {
            if (
              event.key === "Enter" ||
              event.key === " " ||
              event.key === "ArrowLeft" ||
              event.key === "ArrowRight" ||
              event.key === "Home" ||
              event.key === "End"
            ) {
              submitSeek(
                Number(
                  event.currentTarget.value,
                ),
              );
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

      {canControl &&
      normalizedDuration <= 0 ? (
        <p
          className="control-note"
          role="status"
        >
          Loading video duration…
        </p>
      ) : null}

      {isPending && canControl ? (
        <p
          className="control-note"
          role="status"
        >
          Waiting for server confirmation…
        </p>
      ) : null}
    </div>
  );
}