type InlineMessageProps = {
  variant: "error" | "notice";
  message: string;
};

export function InlineMessage({
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