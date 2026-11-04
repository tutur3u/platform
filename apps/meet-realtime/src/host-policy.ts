export function isKnownMeetRealtimeHost(request: Request) {
  const url = new URL(request.url);
  return (
    url.origin === 'https://meet-realtime.tuturuuu.com' ||
    (url.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
  );
}
