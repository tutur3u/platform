import { describe, expect, it } from 'vitest';
import {
  authorizeMemoryRequest,
  isPeopleNamespaceTag,
  parsePeopleContainerTag,
  parsePeopleCustomId,
  PEOPLE_ISOLATION_CASES,
  peopleContainerTag,
  peopleCustomId,
} from './people-namespace';

const WS = '11111111-1111-4111-8111-111111111111';
const PERSON = '33333333-3333-4333-8333-333333333333';

describe('people memory namespace', () => {
  it.each(PEOPLE_ISOLATION_CASES.map((entry) => [entry.name, entry]))(
    '%s',
    (_name, entry) => {
      const decision = authorizeMemoryRequest(entry.caller, entry.request);
      expect(decision.ok ? true : decision.reason).toBe(entry.expect);
    }
  );

  it('builds and parses tags without the compact ID rewrite', () => {
    const tag = peopleContainerTag({
      wsId: WS,
      kind: 'conversation',
      id: PERSON,
    });
    expect(tag).toBe(`tuturuuu.people.${WS}.conversation.${PERSON}`);
    expect(tag.length).toBeGreaterThan(100);
    expect(parsePeopleContainerTag(tag)).toEqual({
      wsId: WS,
      kind: 'conversation',
      id: PERSON,
    });
    expect(parsePeopleContainerTag(`${tag}.extra`)).toBeNull();
    expect(() =>
      peopleContainerTag({
        wsId: 'ABCDEF00-1111-4111-8111-111111111111',
        kind: 'person',
        id: PERSON,
      })
    ).toThrow();
  });

  it('matches the ledger custom ID format', () => {
    const customId = peopleCustomId(WS, PERSON);
    expect(customId).toMatch(/^people\.[0-9a-f-]{36}\.[0-9a-f-]{36}$/);
    expect(parsePeopleCustomId(customId)).toEqual({
      wsId: WS,
      ledgerId: PERSON,
    });
    expect(parsePeopleCustomId(`${customId}x`)).toBeNull();
  });

  it('treats every lenient spelling of the prefix as the people namespace', () => {
    for (const tag of [
      'tuturuuu.people',
      'Tuturuuu.People.x',
      '\ttuturuuu.people.\n',
      'ｔｕｔｕｒｕｕｕ.people.x',
    ])
      expect(isPeopleNamespaceTag(tag)).toBe(true);
    for (const tag of [
      'tuturuuu.peoplex',
      'tuturuuu.user.1.workspace.2',
      'people.x',
    ])
      expect(isPeopleNamespaceTag(tag)).toBe(false);
  });
});
