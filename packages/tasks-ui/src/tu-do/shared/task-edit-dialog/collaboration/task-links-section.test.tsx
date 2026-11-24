/**
 * @vitest-environment jsdom
 */

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from './api';
import { groupTaskLinks, LINK_STATE_CLASS } from './link-groups';
import { TaskLinksSection } from './task-links-section';
import { echoTranslator, renderWithQuery } from './test-utils';
import type { TaskLink } from './types';

vi.mock('next-intl', () => ({
  useTranslations: () => echoTranslator,
  useLocale: () => 'en',
}));
vi.mock('@tuturuuu/ui/sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('./api');

function link(overrides: Partial<TaskLink>): TaskLink {
  return {
    id: 'l1',
    kind: 'url',
    provider: 'web',
    url: 'https://example.com/a',
    external_id: null,
    title: null,
    state: null,
    created_at: '2026-11-20T10:00:00.000Z',
    created_by: 'u1',
    ...overrides,
  };
}

const links: TaskLink[] = [
  link({ id: 'doc', kind: 'doc', title: 'Design doc' }),
  link({
    id: 'pr',
    kind: 'pull_request',
    provider: 'github',
    url: 'https://github.com/o/r/pull/7',
    external_id: '7',
    title: 'Add comments',
    state: 'merged',
  }),
  link({
    id: 'ci',
    kind: 'ci_run',
    provider: 'github',
    url: 'https://github.com/o/r/actions/runs/9',
    external_id: '9',
    state: 'failure',
  }),
  link({
    id: 'sha',
    kind: 'commit',
    provider: 'github',
    url: 'https://github.com/o/r/commit/abcdef1234567',
    external_id: 'abcdef1234567',
  }),
  link({
    id: 'legacy',
    legacy: true,
    url: 'http://legacy.example.com/page',
    title: 'Legacy resource',
  } as Partial<TaskLink>),
  link({ id: null, legacy: true, url: 'https://legacy.example.com/b' }),
];

describe('groupTaskLinks', () => {
  it('orders groups pull requests, commits, CI runs, issues, docs, links', () => {
    const groups = groupTaskLinks(links);
    expect(groups.map((g) => g.kind)).toEqual([
      'pull_request',
      'commit',
      'ci_run',
      'doc',
      'url',
    ]);
    expect(groups.at(-1)?.links).toHaveLength(2);
  });

  it('uses semantic tokens only for every state', () => {
    for (const className of Object.values(LINK_STATE_CLASS)) {
      expect(className).not.toMatch(
        /(?:red|green|blue|yellow|purple|orange|pink|cyan|indigo)-\d{2,3}/
      );
    }
  });
});

describe('TaskLinksSection', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(api.listTaskLinks).mockResolvedValue({ links });
  });

  it('renders rows grouped by kind with state badges', async () => {
    renderWithQuery(<TaskLinksSection taskId="t1" wsId="ws" />);

    await screen.findByText('Add comments');
    const headings = screen
      .getAllByRole('heading', { level: 4 })
      .map((h) => h.textContent);
    expect(headings).toEqual([
      'link_kind.pull_request',
      'link_kind.commit',
      'link_kind.ci_run',
      'link_kind.doc',
      'link_kind.url',
    ]);

    expect(screen.getByText('link_state.merged')).toBeInTheDocument();
    expect(screen.getByText('link_state.failure')).toBeInTheDocument();
    expect(screen.getByText('#9')).toBeInTheDocument();
    expect(screen.getByText('abcdef1')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add comments' })).toHaveAttribute(
      'href',
      'https://github.com/o/r/pull/7'
    );
  });

  it('gives legacy rows a hint and no remove button', async () => {
    renderWithQuery(<TaskLinksSection taskId="t1" wsId="ws" />);
    await screen.findByText('Legacy resource');

    const rows = screen.getAllByTestId('task-link');
    const legacyRows = rows.filter((row) =>
      within(row).queryByText('legacy_link_hint')
    );
    expect(legacyRows).toHaveLength(2);
    for (const row of legacyRows) {
      expect(within(row).queryByRole('button')).toBeNull();
    }
    expect(screen.getAllByRole('button', { name: 'remove_link' })).toHaveLength(
      4
    );
    expect(
      screen.getByRole('link', { name: 'Legacy resource' })
    ).toHaveAttribute('href', 'http://legacy.example.com/page');
  });

  it('removes a link by id', async () => {
    vi.mocked(api.deleteTaskLink).mockResolvedValue({});
    renderWithQuery(<TaskLinksSection taskId="t1" wsId="ws" />);
    await screen.findByText('Add comments');

    const prRow = screen
      .getAllByTestId('task-link')
      .find((row) => within(row).queryByText('Add comments')) as HTMLElement;
    fireEvent.click(within(prRow).getByRole('button', { name: 'remove_link' }));

    await waitFor(() =>
      expect(api.deleteTaskLink).toHaveBeenCalledWith('ws', 't1', 'pr')
    );
  });

  it('adds a pasted https link and rejects other input', async () => {
    vi.mocked(api.createTaskLink).mockResolvedValue({ link: links[0]! });
    renderWithQuery(<TaskLinksSection taskId="t1" wsId="ws" />);
    await screen.findByText('Add comments');

    fireEvent.click(screen.getByRole('button', { name: /add_link/ }));
    const input = await screen.findByLabelText('link_url_label');

    fireEvent.change(input, { target: { value: 'not a url' } });
    expect(screen.getByRole('alert')).toHaveTextContent('link_url_invalid');
    expect(screen.getByRole('button', { name: 'add' })).toBeDisabled();

    fireEvent.change(input, {
      target: { value: 'https://github.com/o/r/pull/12' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'add' }));

    await waitFor(() =>
      expect(api.createTaskLink).toHaveBeenCalledWith(
        'ws',
        't1',
        'https://github.com/o/r/pull/12'
      )
    );
  });

  it('hides add and remove controls when read-only', async () => {
    renderWithQuery(<TaskLinksSection disabled taskId="t1" wsId="ws" />);
    await screen.findByText('Add comments');

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows the empty state', async () => {
    vi.mocked(api.listTaskLinks).mockResolvedValue({ links: [] });
    renderWithQuery(<TaskLinksSection taskId="t1" wsId="ws" />);
    expect(await screen.findByText('no_links')).toBeInTheDocument();
  });
});
