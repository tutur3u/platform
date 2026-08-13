import { describe, expect, it } from 'vitest';
import { isVersionedExternalProjectAssetDeliveryRequest } from './asset-delivery-request';

const ASSET_ID = 'a1709d63-f798-4088-9c77-8a689026d66d';
const ASSET_URL = `https://tuturuuu.com/api/v1/workspaces/ws-1/external-projects/assets/${ASSET_ID}?v=20260813`;

describe('isVersionedExternalProjectAssetDeliveryRequest', () => {
  it.each(['GET', 'HEAD'])('accepts cache-busted %s asset reads', (method) => {
    expect(
      isVersionedExternalProjectAssetDeliveryRequest(method, new URL(ASSET_URL))
    ).toBe(true);
  });

  it.each([
    ['PATCH', ASSET_URL],
    ['DELETE', ASSET_URL],
    [
      'GET',
      `https://tuturuuu.com/api/v1/workspaces/ws-1/external-projects/assets/${ASSET_ID}`,
    ],
    [
      'GET',
      'https://tuturuuu.com/api/v1/workspaces/ws-1/external-projects/assets/upload-url?v=1',
    ],
    [
      'GET',
      `https://tuturuuu.com/api/v1/workspaces/ws-1/external-projects/assets/${ASSET_ID}/webgl/index.html?v=1`,
    ],
  ])('rejects %s %s', (method, url) => {
    expect(
      isVersionedExternalProjectAssetDeliveryRequest(method, new URL(url))
    ).toBe(false);
  });
});
