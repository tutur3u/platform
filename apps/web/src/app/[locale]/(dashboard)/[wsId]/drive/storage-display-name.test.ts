import { describe, expect, it } from 'vitest';
import {
  getStoragePathSegmentDisplayName,
  stripGeneratedStorageNamePrefix,
} from './storage-display-name';

describe('Drive storage display names', () => {
  it('hides generated single and double UUID prefixes', () => {
    expect(
      stripGeneratedStorageNamePrefix(
        'e602ce48-3fa5-4b07-8508-befb78c41819_Mine Blast WebGL.zip'
      )
    ).toBe('Mine Blast WebGL.zip');
    expect(
      stripGeneratedStorageNamePrefix(
        'e602ce48-3fa5-4b07-8508-befb78c41819-49f380d5-b07d-4fa8-8087-6a5f63d3e5a8_Mine Blast WebGL.zip'
      )
    ).toBe('Mine Blast WebGL.zip');
  });

  it('hides generated UUID prefixes from URL-encoded path segments', () => {
    expect(
      getStoragePathSegmentDisplayName(
        '9ba40a0d-8550-4ef0-8e21-ac333301ec5a-05cbb174-034d-4897-bdb4-3caea67e446b_Mine%20Blast%20WebGL'
      )
    ).toBe('Mine Blast WebGL');
  });
});
