import { expect, it } from 'vitest';
import { getMediaErrorKey } from './media-error';

it('distinguishes missing input devices from permissions and transmission', () => {
  const missing = new DOMException(
    'Requested device not found',
    'NotFoundError'
  );
  expect(getMediaErrorKey(missing, 'microphone')).toBe('microphone_not_found');
  expect(getMediaErrorKey(missing, 'camera')).toBe('camera_not_found');
  expect(getMediaErrorKey({ name: 'NotAllowedError' }, 'camera')).toBe(
    'media_permission_denied'
  );
  expect(getMediaErrorKey({ name: 'NotReadableError' }, 'microphone')).toBe(
    'media_device_busy'
  );
  expect(getMediaErrorKey(new Error('SFU unavailable'), 'microphone')).toBe(
    'media_failed'
  );
});
