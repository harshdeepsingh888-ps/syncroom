export const ROOM_ERROR_CODES = {
  ROOM_NOT_FOUND: "ROOM_NOT_FOUND",
  ROOM_FULL: "ROOM_FULL",
  PARTICIPANT_NOT_FOUND: "PARTICIPANT_NOT_FOUND",
  PARTICIPANT_ALREADY_JOINED: "PARTICIPANT_ALREADY_JOINED",
  PERMISSION_DENIED: "PERMISSION_DENIED",
  INVALID_ROOM_OPERATION: "INVALID_ROOM_OPERATION",
} as const;

export type RoomErrorCode =
  (typeof ROOM_ERROR_CODES)[keyof typeof ROOM_ERROR_CODES];

export class RoomDomainError extends Error {
  public readonly code: RoomErrorCode;

  public constructor(code: RoomErrorCode, message: string) {
    super(message);

    this.name = "RoomDomainError";
    this.code = code;

    Object.setPrototypeOf(this, RoomDomainError.prototype);
  }
}