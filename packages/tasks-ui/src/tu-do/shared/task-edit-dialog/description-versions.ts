import type { JSONContent } from '@tiptap/react';
import {
  getDescriptionContent,
  getTaskDescriptionPreviewText,
  normalizeTaskDescriptionSnapshot,
  serializeTaskDescriptionPersistenceSnapshot,
} from './utils';

export interface TaskDescriptionHistoryUser {
  id: string;
  name: string;
  avatar_url?: string | null;
}

export interface TaskDescriptionHistoryEntryLike {
  id: string;
  changed_at: string;
  change_type?: string | null;
  field_name?: string | null;
  old_value?: unknown;
  new_value?: unknown;
  user?: TaskDescriptionHistoryUser | null;
}

export type TaskDescriptionVersionSource = 'new_value' | 'old_value';
export type TaskDescriptionVersionReason = 'before_clear' | 'tracked';

export interface RecoverableTaskDescriptionVersion {
  id: string;
  historyId: string;
  changedAt: string;
  source: TaskDescriptionVersionSource;
  reason: TaskDescriptionVersionReason;
  description: string;
  content: JSONContent;
  previewText: string;
  user: TaskDescriptionHistoryUser | null;
}

const LEGACY_DESCRIPTION_PLACEHOLDERS = new Set(['has_content']);

function isLegacyDescriptionPlaceholder(value: string) {
  return LEGACY_DESCRIPTION_PLACEHOLDERS.has(value.trim().toLowerCase());
}

function hasObjectShape(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function textToDescriptionContent(text: string): JSONContent {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text }],
      },
    ],
  };
}

function coerceDescriptionValueToContent(value: unknown): JSONContent | null {
  if (value === null || value === undefined) return null;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || isLegacyDescriptionPlaceholder(trimmed)) return null;

    try {
      const parsed = JSON.parse(trimmed) as unknown;

      if (typeof parsed === 'string') {
        const parsedText = parsed.trim();
        if (!parsedText || isLegacyDescriptionPlaceholder(parsedText)) {
          return null;
        }
        return textToDescriptionContent(parsed);
      }

      if (hasObjectShape(parsed)) {
        return getDescriptionContent(parsed);
      }

      return null;
    } catch {
      return textToDescriptionContent(value);
    }
  }

  if (hasObjectShape(value)) {
    return getDescriptionContent(value);
  }

  return null;
}

export function extractRecoverableTaskDescriptionValue(value: unknown): {
  content: JSONContent;
  description: string;
  previewText: string;
} | null {
  const content = normalizeTaskDescriptionSnapshot(
    coerceDescriptionValueToContent(value)
  );
  if (!content) return null;

  const description = serializeTaskDescriptionPersistenceSnapshot(content);
  if (!description) return null;

  return {
    content,
    description,
    previewText: getTaskDescriptionPreviewText(content).trim(),
  };
}

export function isTaskDescriptionHistoryEntry(
  entry: TaskDescriptionHistoryEntryLike
) {
  return (
    entry.change_type === 'field_updated' && entry.field_name === 'description'
  );
}

export function isTaskDescriptionHistoryValueEmpty(value: unknown) {
  return extractRecoverableTaskDescriptionValue(value) === null;
}

function addDescriptionVersion({
  entry,
  reason,
  seenDescriptions,
  source,
  value,
  versions,
}: {
  entry: TaskDescriptionHistoryEntryLike;
  reason: TaskDescriptionVersionReason;
  seenDescriptions: Set<string>;
  source: TaskDescriptionVersionSource;
  value: unknown;
  versions: RecoverableTaskDescriptionVersion[];
}) {
  const recoverableValue = extractRecoverableTaskDescriptionValue(value);
  if (!recoverableValue) return;
  if (seenDescriptions.has(recoverableValue.description)) return;

  seenDescriptions.add(recoverableValue.description);
  versions.push({
    id: `${entry.id}:${source}`,
    historyId: entry.id,
    changedAt: entry.changed_at,
    source,
    reason,
    description: recoverableValue.description,
    content: recoverableValue.content,
    previewText: recoverableValue.previewText,
    user: entry.user ?? null,
  });
}

export function buildRecoverableTaskDescriptionVersions(
  entries: TaskDescriptionHistoryEntryLike[]
) {
  const versions: RecoverableTaskDescriptionVersion[] = [];
  const seenDescriptions = new Set<string>();
  const sortedEntries = [...entries]
    .filter(isTaskDescriptionHistoryEntry)
    .sort(
      (a, b) =>
        new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime()
    );

  for (const entry of sortedEntries) {
    const oldIsRecoverable =
      extractRecoverableTaskDescriptionValue(entry.old_value) !== null;
    const newIsEmpty = isTaskDescriptionHistoryValueEmpty(entry.new_value);

    if (oldIsRecoverable && newIsEmpty) {
      addDescriptionVersion({
        entry,
        reason: 'before_clear',
        seenDescriptions,
        source: 'old_value',
        value: entry.old_value,
        versions,
      });
      continue;
    }

    addDescriptionVersion({
      entry,
      reason: 'tracked',
      seenDescriptions,
      source: 'new_value',
      value: entry.new_value,
      versions,
    });
    addDescriptionVersion({
      entry,
      reason: 'tracked',
      seenDescriptions,
      source: 'old_value',
      value: entry.old_value,
      versions,
    });
  }

  return versions;
}
