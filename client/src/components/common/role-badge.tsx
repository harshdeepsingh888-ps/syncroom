import type { ParticipantRole } from "../../types/realtime";

type RoleBadgeProps = {
  role: ParticipantRole;
};

export function RoleBadge({
  role,
}: RoleBadgeProps) {
  return (
    <span
      className={`role-badge role-badge--${role}`}
    >
      <span className="role-dot" aria-hidden="true" />
      {role}
    </span>
  );
}