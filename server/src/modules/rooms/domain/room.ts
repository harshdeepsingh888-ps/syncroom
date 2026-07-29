import type { Participant } from "./participant.js";
import type { PlaybackState } from "./playback-state.js";

export const MAX_ROOM_PARTICIPANTS = 20;

export type Room = {
  id: string;
  hostParticipantId: string;
  participants: Map<string, Participant>;
  playback: PlaybackState;
  roomVersion: number;
  createdAt: string;
  updatedAt: string;
};