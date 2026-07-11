import { describe, expect, it } from 'vitest';
import { resolveMailThreadSubject } from './thread-subject';

describe('resolveMailThreadSubject', () => {
  it('uses the newest message subject when a legacy draft thread is blank', () => {
    expect(resolveMailThreadSubject('', 'Quarterly update')).toBe(
      'Quarterly update'
    );
    expect(resolveMailThreadSubject('(no subject)', 'Sent proposal')).toBe(
      'Sent proposal'
    );
  });

  it('keeps an authoritative thread subject', () => {
    expect(
      resolveMailThreadSubject('Project launch', 'Re: Project launch')
    ).toBe('Project launch');
  });
});
