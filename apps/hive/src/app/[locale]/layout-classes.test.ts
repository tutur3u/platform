import { describe, expect, it } from 'vitest';
import { HIVE_BODY_CLASS_NAME } from './layout-classes';

describe('Hive locale layout classes', () => {
  it('does not lock document scrolling globally', () => {
    const classes = HIVE_BODY_CLASS_NAME.split(/\s+/);

    expect(classes).toContain('min-h-dvh');
    expect(classes).not.toContain('overflow-hidden');
  });
});
