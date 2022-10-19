import { APP_VERSION } from '../../src/constants/common';
import { version } from '../../src/core/version';

describe('version', () => {
  it('returns the correct version', () => {
    expect(version).toBe(APP_VERSION);
  });
});
