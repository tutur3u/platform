import { describe, expect, it } from 'vitest';
import { safeStackFrames } from './stack-frames';

describe('safeStackFrames', () => {
  it('keeps function, file basename and position only', () => {
    const error = new TypeError('Cannot read person@example.com');
    error.stack = [
      'TypeError: Cannot read person@example.com',
      '    at loadOutbound (file:///srv/app/dist/server/assets/client-NTejWHMP.js:12:345)',
      '    at async sendClaimed (https://tuturuuu.com/mail/assets/index.js:9:10)',
      '    at file:///srv/worker-entry.js:1:2',
    ].join('\n');
    expect(safeStackFrames(error)).toEqual([
      'loadOutbound@client-NTejWHMP.js:12:345',
      'async sendClaimed@index.js:9:10',
      '<anonymous>@worker-entry.js:1:2',
    ]);
    expect(JSON.stringify(safeStackFrames(error))).not.toMatch(
      /@example\.com/u
    );
  });

  it('drops frames that do not match the expected shape', () => {
    const error = new Error('x');
    error.stack =
      'Error: x\n    at eval (eval at person@example.com)\n    at q (a b.js:1:1)';
    expect(safeStackFrames(error)).toEqual([]);
  });

  it('returns nothing for non-errors and throwing stacks', () => {
    expect(safeStackFrames('boom')).toEqual([]);
    const hostile = new Error('x');
    Object.defineProperty(hostile, 'stack', {
      get() {
        throw new Error('no');
      },
    });
    expect(safeStackFrames(hostile)).toEqual([]);
  });
});
