import { APP_VERSION } from '../../src/core/constants';
import { version } from '../../src/core/version';

describe('version', () => {
  it('returns the correct version', () => {
    expect(version).toBe(APP_VERSION);
  });
});
