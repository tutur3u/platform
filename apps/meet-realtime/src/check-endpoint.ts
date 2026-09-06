/** Keep signed verification tokens encrypted outside loopback development. */
export function validateMeetCheckEndpoint(value: string): string {
  const url = new URL(value);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'wss:' && !(url.protocol === 'ws:' && loopback)) {
    throw new Error(
      'Meet checks require WSS, except for loopback WS development'
    );
  }
  if (
    value.includes('?') ||
    value.includes('#') ||
    url.username ||
    url.password
  ) {
    throw new Error(
      'Meet check endpoints must not contain credentials, query, or fragment'
    );
  }
  return value;
}
