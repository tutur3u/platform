import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Tool } from '../data';
import { ToolForm } from './tool-form';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';
const WORKSPACE_SLUG = 'workspace-handle';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

const tool: Tool = {
  category: 'teaching',
  description: 'Create a plan',
  fields: [
    {
      label: 'Topic',
      required: true,
      type: 'text',
      value: 'Photosynthesis',
    },
  ],
  id: 'lesson-plan',
  name: 'Lesson plan',
  tags: ['teaching'],
};

describe('Rewise tool chat workspace propagation', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: vi.fn().mockResolvedValue({ id: 'chat-1' }),
        ok: true,
      })
    );
  });

  it('creates and navigates to the tool chat inside the selected workspace', async () => {
    render(
      <ToolForm
        tool={tool}
        workspaceSlug={WORKSPACE_SLUG}
        wsId={WORKSPACE_ID}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'common.generate' }));

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const [, options] = vi.mocked(fetch).mock.calls[0]!;
    expect(JSON.parse(String(options?.body))).toEqual(
      expect.objectContaining({ wsId: WORKSPACE_ID })
    );
    expect(mocks.push).toHaveBeenCalledWith(`/${WORKSPACE_SLUG}/c/chat-1`);
  });

  it('does not submit when filling example content or resetting the form', () => {
    render(
      <ToolForm
        tool={tool}
        workspaceSlug={WORKSPACE_SLUG}
        wsId={WORKSPACE_ID}
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'common.example_content' })
    );
    fireEvent.click(screen.getByRole('button', { name: 'common.reset' }));

    expect(fetch).not.toHaveBeenCalled();
  });

  it('restores the generate action after a failed request', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      statusText: 'Unavailable',
    } as Response);
    render(
      <ToolForm
        tool={tool}
        workspaceSlug={WORKSPACE_SLUG}
        wsId={WORKSPACE_ID}
      />
    );

    const generate = screen.getByRole('button', { name: 'common.generate' });
    fireEvent.click(generate);

    await waitFor(() => expect(generate.hasAttribute('disabled')).toBe(false));
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('recovers from a network failure without navigating', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network unavailable'));
    render(
      <ToolForm
        tool={tool}
        workspaceSlug={WORKSPACE_SLUG}
        wsId={WORKSPACE_ID}
      />
    );

    const generate = screen.getByRole('button', { name: 'common.generate' });
    fireEvent.click(generate);

    await waitFor(() => expect(generate.hasAttribute('disabled')).toBe(false));
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
