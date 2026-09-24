import { expect, it } from 'vitest';
import { getMediaErrorKey } from './media-error';

it('distinguishes missing input devices from permissions and transmission', () => {
  const missing = new DOMException(
    'Requested device not found',
    'NotFoundError'
  );
  expect(getMediaErrorKey(missing, 'microphone')).toBe('microphone_not_found');
  expect(getMediaErrorKey(missing, 'camera')).toBe('camera_not_found');
  expect(getMediaErrorKey(missing, 'screen')).toBe('screen_not_found');
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

it('reports useful transmission codes without exposing sensitive error text', async () => {
  const { getMediaErrorDiagnostic } = await import('./media-error');
  expect(
    getMediaErrorDiagnostic(
      new Error('cloudflare_sfu_request_failed:406 private SDP and credentials')
    )
  ).toBe('SFU_HTTP_406');
  expect(getMediaErrorDiagnostic(new Error('signaling_timeout'))).toBe(
    'SIGNALING_TIMEOUT'
  );
  expect(
    getMediaErrorDiagnostic(new DOMException('private SDP', 'OperationError'))
  ).toBe('RTC_OPERATION_FAILED');
  for (const error of [
    new Error('https://private.example/?token=secret'),
    new Error('constructor'),
    { name: 'secret', message: 'secret' },
    'secret',
    null,
  ]) {
    expect(getMediaErrorDiagnostic(error)).toBe('MEDIA_UNKNOWN');
  }
});
