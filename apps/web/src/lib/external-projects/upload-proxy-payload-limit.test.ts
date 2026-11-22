import { describe, expect, it } from 'vitest';
import {
  EXTERNAL_PROJECT_UPLOAD_REQUEST_BYTES,
  externalProjectUploadProxyPayloadLimit,
} from './upload-proxy-payload-limit';

const WS = '00000000-0000-4000-8000-000000000001';
const MULTIPART = 'multipart/form-data; boundary=----x';

describe('externalProjectUploadProxyPayloadLimit', () => {
  it.each([
    `/api/v1/workspaces/${WS}/external-projects/assets/upload-url`,
    `/api/v1/workspaces/${WS}/external-projects/storage`,
    '/api/v1/workspaces/personal/external-projects/storage/',
  ])('raises the cap for a multipart POST to %s', (pathname) => {
    expect(
      externalProjectUploadProxyPayloadLimit('POST', pathname, MULTIPART)
    ).toBe(EXTERNAL_PROJECT_UPLOAD_REQUEST_BYTES);
  });

  it.each(['application/json', 'multipart/form-data-extra'])(
    'keeps the default for content type %s on the same routes',
    (contentType) => {
      expect(
        externalProjectUploadProxyPayloadLimit(
          'POST',
          `/api/v1/workspaces/${WS}/external-projects/storage`,
          contentType
        )
      ).toBeUndefined();
    }
  );

  it('keeps the default for other methods and a missing content type', () => {
    const path = `/api/v1/workspaces/${WS}/external-projects/assets/upload-url`;
    expect(
      externalProjectUploadProxyPayloadLimit('PUT', path, MULTIPART)
    ).toBeUndefined();
    expect(
      externalProjectUploadProxyPayloadLimit('POST', path, null)
    ).toBeUndefined();
  });

  it.each([
    `/api/v1/workspaces/${WS}/external-projects/assets`,
    `/api/v1/workspaces/${WS}/external-projects/webgl-packages/upload-url`,
    `/api/v1/workspaces/${WS}/external-projects/storage/extra`,
    `/api/v1/workspaces/${WS}/storage/upload`,
    `/api/v1/workspaces/${WS}/x/external-projects/storage`,
  ])('keeps the default for %s', (pathname) => {
    expect(
      externalProjectUploadProxyPayloadLimit('POST', pathname, MULTIPART)
    ).toBeUndefined();
  });

  it('allows a 10 MiB file with room for multipart encoding', () => {
    expect(EXTERNAL_PROJECT_UPLOAD_REQUEST_BYTES).toBe(12 * 1024 * 1024);
  });
});
