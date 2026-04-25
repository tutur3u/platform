import { describe, expect, it } from 'vitest';
import { stripGeneratedStorageNamePrefix } from './storage-display-name';

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
});
