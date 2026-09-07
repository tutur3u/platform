export function getMediaErrorKey(
  error: unknown,
  device: 'microphone' | 'camera' | 'screen'
) {
  const name =
    error && typeof error === 'object' && 'name' in error ? error.name : '';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    if (device === 'microphone') return 'microphone_not_found';
    if (device === 'camera') return 'camera_not_found';
    return 'screen_not_found';
  }
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError')
    return 'media_permission_denied';
  if (name === 'NotReadableError' || name === 'TrackStartError')
    return 'media_device_busy';
  return 'media_failed';
}

/** Never expose raw provider errors: they may contain SDP, URLs, or tokens. */
export function getMediaErrorDiagnostic(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  const sfuStatus = /^cloudflare_sfu_request_failed:([45]\d{2})(?:\s|$)/.exec(
    message
  );
  if (sfuStatus) return `SFU_HTTP_${sfuStatus[1]}`;

  const knownErrors: Record<string, string> = {
    signaling_closed: 'SIGNALING_CLOSED',
    signaling_timeout: 'SIGNALING_TIMEOUT',
    sfu_connection_failed: 'SFU_CONNECTION_FAILED',
    sfu_connection_timeout: 'SFU_CONNECTION_TIMEOUT',
    sfu_session_failed: 'SFU_SESSION_FAILED',
    sfu_track_close_failed: 'SFU_TRACK_CLOSE_FAILED',
    sfu_track_publish_failed: 'SFU_TRACK_PUBLISH_FAILED',
    sfu_session_replaced: 'SFU_SESSION_REPLACED',
    publish_not_allowed: 'PUBLISH_NOT_ALLOWED',
    permission_denied: 'CALL_PERMISSION_DENIED',
    not_admitted: 'NOT_ADMITTED',
  };
  if (Object.hasOwn(knownErrors, message)) return knownErrors[message]!;

  const name = error instanceof Error ? error.name : '';
  const browserErrors: Record<string, string> = {
    InvalidStateError: 'RTC_INVALID_STATE',
    InvalidModificationError: 'RTC_INVALID_MODIFICATION',
    OperationError: 'RTC_OPERATION_FAILED',
    NotSupportedError: 'RTC_NOT_SUPPORTED',
    TypeError: 'MEDIA_TYPE_ERROR',
    AbortError: 'MEDIA_ABORTED',
  };
  return Object.hasOwn(browserErrors, name)
    ? browserErrors[name]!
    : 'MEDIA_UNKNOWN';
}
