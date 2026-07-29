export const PLAYBACK_STATUSES = {
  PLAYING: "playing",
  PAUSED: "paused",
} as const;

export type PlaybackStatus =
  (typeof PLAYBACK_STATUSES)[keyof typeof PLAYBACK_STATUSES];

export type PlaybackState = {
  videoId: string | null;
  status: PlaybackStatus;
  positionSeconds: number;
  playbackRate: number;
  updatedAt: string;
  updatedByParticipantId: string | null;
};