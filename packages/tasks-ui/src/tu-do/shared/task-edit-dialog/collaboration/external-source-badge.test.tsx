/**
 * @vitest-environment jsdom
 */

import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from './api';
import { ExternalSourceBadge } from './external-source-badge';
import { echoTranslator, renderWithQuery } from './test-utils';

vi.mock('next-intl', () => ({
  useTranslations: () => echoTranslator,
  useLocale: () => 'en',
}));
vi.mock('./api');

describe('ExternalSourceBadge', () => {
  beforeEach(() => vi.resetAllMocks());

  it('links the GitHub issue number with its original author and date', async () => {
    vi.mocked(api.getTaskExternalRef).mockResolvedValue({
      ref: {
        provider: 'github',
        external_url: 'https://github.com/o/r/issues/1234',
        external_repo: 'o/r',
        external_number: 1234,
        external_author: 'octocat',
        external_state: 'open',
        external_state_reason: null,
        external_created_at: '2026-03-04T12:00:00.000Z',
        external_closed_at: null,
        external_labels: [],
      },
    });
    renderWithQuery(<ExternalSourceBadge taskId="t1" wsId="ws" />);

    const link = await screen.findByRole('link');
    expect(link).toHaveTextContent('github #1234');
    expect(link).toHaveAttribute('href', 'https://github.com/o/r/issues/1234');
    expect(screen.getByText('opened_by octocat')).toBeInTheDocument();
    expect(screen.getByRole('time')).toHaveTextContent('Mar 4, 2026');
  });

  it('renders nothing for a task without an external ref', async () => {
    vi.mocked(api.getTaskExternalRef).mockResolvedValue({ ref: null });
    const { container } = renderWithQuery(
      <ExternalSourceBadge taskId="t1" wsId="ws" />
    );

    await vi.waitFor(() => expect(api.getTaskExternalRef).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
