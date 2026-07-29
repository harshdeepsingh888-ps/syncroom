export const PARTICIPANT_ROLES = {
  HOST: "host",
  MODERATOR: "moderator",
  PARTICIPANT: "participant",
} as const;

export type ParticipantRole =
  (typeof PARTICIPANT_ROLES)[keyof typeof PARTICIPANT_ROLES];

export type Participant = {
  id: string;
  socketId: string;
  displayName: string;
  role: ParticipantRole;
  joinedAt: string;
  disconnectedAt: string | null;
};