import { describe, expect, it } from 'vitest';
import { parsePeopleSearch, peopleSearchPattern, projectWorkspacePeople, type PersonCandidate } from './workspace-people';

const contact: PersonCandidate = {
  kind: 'contact', id: 'contact-1', display_name: 'Visible name',
  full_name: 'Private name', email: 'private@example.com', avatar_url: null,
};
const visible = { hideName: false, hideEmail: false, publicContacts: true, privateContacts: true };

describe('workspace people projection', () => {
  it('does not match or return hidden emails', () => {
    expect(projectWorkspacePeople([contact], { ...visible, hideEmail: true }, 'private@', 10)).toEqual([]);
    expect(projectWorkspacePeople([contact], { ...visible, hideEmail: true }, 'Visible', 10)[0]?.email).toBeNull();
  });
  it('does not match hidden names or private contact fields without permission', () => {
    expect(projectWorkspacePeople([contact], { ...visible, hideName: true }, 'Visible', 10)).toEqual([]);
    expect(projectWorkspacePeople([contact], { ...visible, privateContacts: false }, 'private@', 10)).toEqual([]);
  });
  it('keeps a contact distinct from a member and never infers account linkage', () => {
    const result = projectWorkspacePeople([contact, { ...contact, kind: 'member' }], visible, 'Visible', 10);
    expect(result.map(({ kind }) => kind)).toEqual(['contact', 'member']);
    expect(result[0]).toMatchObject({ linkedUserId: null });
    expect(result[1]).not.toHaveProperty('linkedUserId');
  });
  it('caps results and deduplicates only explicit kind/id identity', () => {
    expect(projectWorkspacePeople([contact, contact, { ...contact, id: 'other' }], visible, 'Visible', 1)).toHaveLength(1);
  });
  it('quotes PostgREST syntax and escapes LIKE wildcards', () => {
    expect(peopleSearchPattern('a%,id.eq.x_("')).toBe('"%a\\%,id.eq.x\\_(\\"%"');
  });
  it('allows literal syntax characters but rejects the PostgREST star alias', () => {
    expect(parsePeopleSearch(new URLSearchParams({ q: 'a*,id.eq.x' }))).toBeNull();
    expect(parsePeopleSearch(new URLSearchParams({ q: ' a%,(x)"\\_ ', limit: '20' }))).toEqual({ query: 'a%,(x)"\\_', limit: 20 });
    expect(peopleSearchPattern('a\\b')).toBe('"%a\\\\b%"');
  });
});
