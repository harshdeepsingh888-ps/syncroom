export function shortenRoomId(
  roomId: string,
): string {
  if (roomId.length <= 16) {
    return roomId;
  }

  return `${roomId.slice(0, 8)}…${roomId.slice(-6)}`;
}

export function formatPlaybackTime(
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
      minutes.toString().padStart(2, "0"),
      seconds.toString().padStart(2, "0"),
    ].join(":");
  }

  return [
    minutes,
    seconds.toString().padStart(2, "0"),
  ].join(":");
}

export function getInitials(
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