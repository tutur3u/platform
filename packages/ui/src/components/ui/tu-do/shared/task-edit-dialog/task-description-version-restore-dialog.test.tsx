import '@testing-library/jest-dom/vitest';

import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { RecoverableTaskDescriptionVersion } from './description-versions';
import { TaskDescriptionRestoreBanner } from './task-description-restore-banner';
import { TaskDescriptionVersionRestoreDialog } from './task-description-version-restore-dialog';

vi.mock('./description-diff-viewer', () => ({
  DescriptionDiffViewer: ({ trigger }: { trigger?: ReactNode }) =>
    trigger ?? <button type="button">compare</button>,
}));

const t = (_key: string, options?: { count?: number; defaultValue?: string }) =>
  options?.defaultValue ?? _key;

const makeVersion = (
  overrides: Partial<RecoverableTaskDescriptionVersion> = {}
): RecoverableTaskDescriptionVersion => ({
  id: 'history-1:new_value',
  historyId: 'history-1',
  changedAt: '2026-06-27T00:00:00.000Z',
  source: 'new_value',
  reason: 'tracked',
  description:
    '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Tracked description"}]}]}',
  content: {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Tracked description' }],
      },
    ],
  },
  previewText: 'Tracked description',
  user: { id: 'user-1', name: 'User' },
  ...overrides,
});

describe('task description restore UI', () => {
  it('shows the recovery banner and wires restore/view actions', () => {
    const onRestoreLatest = vi.fn();
    const onViewVersions = vi.fn();

    render(
      <TaskDescriptionRestoreBanner
        isRestoring={false}
        latestVersion={makeVersion()}
        onRestoreLatest={onRestoreLatest}
        onViewVersions={onViewVersions}
        t={t}
        versionCount={1}
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: /restore latest tracked/i })
    );
    fireEvent.click(screen.getByRole('button', { name: /view versions/i }));

    expect(onRestoreLatest).toHaveBeenCalledTimes(1);
    expect(onViewVersions).toHaveBeenCalledTimes(1);
  });

  it('does not show the recovery banner without a newer tracked version', () => {
    const { container } = render(
      <TaskDescriptionRestoreBanner
        isRestoring={false}
        latestVersion={null}
        onRestoreLatest={vi.fn()}
        onViewVersions={vi.fn()}
        t={t}
        versionCount={0}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('shows an empty version picker state when history has no recoverable content', () => {
    render(
      <TaskDescriptionVersionRestoreDialog
        currentDescription={null}
        isOpen
        onClose={vi.fn()}
        onRestoreVersion={vi.fn()}
        t={t}
        versions={[]}
      />
    );

    expect(
      screen.getByText(/no restorable description versions were found/i)
    ).toBeInTheDocument();
  });

  it('restores a selected version from the version picker', () => {
    const onRestoreVersion = vi.fn();
    const version = makeVersion();

    render(
      <TaskDescriptionVersionRestoreDialog
        currentDescription={null}
        isOpen
        onClose={vi.fn()}
        onRestoreVersion={onRestoreVersion}
        t={t}
        versions={[version]}
      />
    );

    expect(screen.getByText('Tracked description')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^restore$/i }));

    expect(onRestoreVersion).toHaveBeenCalledWith(version);
  });
});
