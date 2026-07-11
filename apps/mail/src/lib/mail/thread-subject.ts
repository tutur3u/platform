export function resolveMailThreadSubject(
  threadSubject: string | null | undefined,
  messageSubject: string | null | undefined
) {
  const threadValue = threadSubject?.trim();
  if (threadValue && threadValue.toLowerCase() !== '(no subject)') {
    return threadValue;
  }
  const messageValue = messageSubject?.trim();
  return messageValue || '(no subject)';
}
