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
