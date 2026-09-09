/** Saved history and current unsaved messages have independent bounded windows. */
export function retainRoomChat<T extends { id: string; retained?: boolean }>(
  messages: T[]
): T[] {
  const unique = [
    ...new Map(messages.map((message) => [message.id, message])).values(),
  ];
  const retained = new Set(
    unique.filter((message) => message.retained !== false).slice(-500)
  );
  const transient = new Set(
    unique.filter((message) => message.retained === false).slice(-500)
  );
  return unique.filter(
    (message) => retained.has(message) || transient.has(message)
  );
}
