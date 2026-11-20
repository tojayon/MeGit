export function AssistantAvatar({ size }: { size: number }) {
  return (
    <img
      className="assistant-avatar"
      src="/brand/megit-assistant-avatar.svg"
      alt=""
      width={size}
      height={size}
      draggable={false}
    />
  );
}
