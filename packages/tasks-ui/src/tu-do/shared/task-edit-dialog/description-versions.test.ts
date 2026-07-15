import { describe, expect, it } from 'vitest';
import {
  buildRecoverableTaskDescriptionVersions,
  extractRecoverableTaskDescriptionValue,
} from './description-versions';

const makeDoc = (text: string) =>
  JSON.stringify({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text }],
      },
    ],
  });

describe('task description tracked versions', () => {
  it('does not treat null, empty docs, or legacy placeholders as recoverable', () => {
    expect(extractRecoverableTaskDescriptionValue(null)).toBeNull();
    expect(extractRecoverableTaskDescriptionValue('')).toBeNull();
    expect(extractRecoverableTaskDescriptionValue('has_content')).toBeNull();
    expect(
      extractRecoverableTaskDescriptionValue(
        JSON.stringify({
          type: 'doc',
          content: [{ type: 'paragraph' }],
        })
      )
    ).toBeNull();
  });

  it('normalizes plain text and serialized TipTap content', () => {
    const plain = extractRecoverableTaskDescriptionValue('Plain description');
    const serialized = extractRecoverableTaskDescriptionValue(
      makeDoc('Serialized description')
    );

    expect(plain?.description).toContain('Plain description');
    expect(plain?.previewText).toBe('Plain description');
    expect(serialized?.description).toContain('Serialized description');
    expect(serialized?.previewText).toBe('Serialized description');
  });

  it('prefers the previous value from the latest wipe entry', () => {
    const versions = buildRecoverableTaskDescriptionVersions([
      {
        id: 'older',
        changed_at: '2026-06-25T10:00:00.000Z',
        change_type: 'field_updated',
        field_name: 'description',
        old_value: makeDoc('Older version'),
        new_value: makeDoc('Intermediate version'),
      },
      {
        id: 'wipe',
        changed_at: '2026-06-26T10:00:00.000Z',
        change_type: 'field_updated',
        field_name: 'description',
        old_value: makeDoc('Latest real version'),
        new_value: null,
      },
    ]);

    expect(versions[0]?.historyId).toBe('wipe');
    expect(versions[0]?.source).toBe('old_value');
    expect(versions[0]?.reason).toBe('before_clear');
    expect(versions[0]?.previewText).toBe('Latest real version');
  });

  it('dedupes identical canonical descriptions while keeping newest first', () => {
    const duplicated = makeDoc('Same description');
    const versions = buildRecoverableTaskDescriptionVersions([
      {
        id: 'newer',
        changed_at: '2026-06-26T10:00:00.000Z',
        change_type: 'field_updated',
        field_name: 'description',
        old_value: makeDoc('Different description'),
        new_value: duplicated,
      },
      {
        id: 'older',
        changed_at: '2026-06-25T10:00:00.000Z',
        change_type: 'field_updated',
        field_name: 'description',
        old_value: duplicated,
        new_value: duplicated,
      },
    ]);

    expect(versions.map((version) => version.previewText)).toEqual([
      'Same description',
      'Different description',
    ]);
  });
});
