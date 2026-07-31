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