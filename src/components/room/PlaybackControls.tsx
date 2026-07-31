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
  canControl,
  isPending,
  onPlay,
  onPause,
  onSeek,
}: PlaybackControlsProps) {
  const [seekValue, setSeekValue] =
    useState(positionSeconds);

  const controlsDisabled =
    !canControl || isPending;

  useEffect(() => {
    setSeekValue(positionSeconds);
  }, [positionSeconds]);

  function submitSeek(): void {
    if (controlsDisabled) {
      return;
    }

    onSeek(seekValue);
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
              ? "Pause shared playback"
              : "Play shared video"
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
            {formatPlaybackTime(
              seekValue,
            )}
          </strong>
        </span>

        <input
          type="range"
          min="0"
          max="7200"
          step="1"
          value={seekValue}
          disabled={controlsDisabled}
          aria-label="Shared playback seek position"
          onChange={(event) => {
            setSeekValue(
              Number(event.target.value),
            );
          }}
          onPointerUp={submitSeek}
          onKeyUp={(event) => {
            if (
              event.key === "Enter" ||
              event.key === " "
            ) {
              submitSeek();
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