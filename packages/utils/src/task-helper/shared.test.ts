import { describe, expect, it } from 'vitest';
import { getTaskTicketLabel, getTicketIdentifier } from './shared';

const project = {
  id: 'a',
  name: 'Platform',
  status: 'active',
  ticket_key: 'PLA',
  ticket_number: 12,
  created_at: '2026-01-01T00:00:00Z',
};

describe('getTaskTicketLabel', () => {
  it('omits IDs for tasks without projects, including legacy board numbered tasks', () => {
    expect(getTaskTicketLabel({})).toBeNull();
    expect(getTaskTicketLabel({ projects: [] })).toBeNull();
    expect(getTicketIdentifier('DEV', 248)).toBe('DEV-248');
  });
  it('uses the earliest link regardless of response order without mutating it', () => {
    const projects = [
      { ...project, id: 'b', ticket_key: 'MOB', created_at: '2026-02-01' },
      project,
    ];
    expect(getTaskTicketLabel({ projects })).toBe('PLA-12');
    expect(projects[0]?.id).toBe('b');
  });
  it('breaks timestamp ties by project id and places missing timestamps last', () => {
    expect(
      getTaskTicketLabel({
        projects: [{ ...project, id: 'b', ticket_key: 'MOB' }, project],
      })
    ).toBe('PLA-12');
    expect(
      getTaskTicketLabel({
        projects: [{ ...project, id: '0', created_at: null }, project],
      })
    ).toBe('PLA-12');
  });
  it('does not silently switch to a later project with incomplete data', () => {
    expect(
      getTaskTicketLabel({
        projects: [
          { ...project, ticket_number: undefined },
          { ...project, id: 'b' },
        ],
      })
    ).toBeNull();
  });
  it('retains the source project label under a personal overlay', () => {
    expect(
      getTaskTicketLabel({
        ticket_projects: [project],
        projects: [{ ...project, ticket_key: 'ME' }],
      })
    ).toBe('PLA-12');
  });
  it('relabels after a key edit without changing the number', () => {
    expect(
      getTaskTicketLabel({ projects: [{ ...project, ticket_key: 'CORE' }] })
    ).toBe('CORE-12');
  });
  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid ticket number %s',
    (ticket_number) => {
      expect(
        getTaskTicketLabel({ projects: [{ ...project, ticket_number }] })
      ).toBeNull();
    }
  );
});
