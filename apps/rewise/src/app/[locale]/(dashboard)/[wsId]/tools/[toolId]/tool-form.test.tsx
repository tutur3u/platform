import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Tool } from '../data';
import { ToolForm } from './tool-form';

const WORKSPACE_ID = '11111111-1111-4111-8111-111111111111';

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
    render(<ToolForm tool={tool} wsId={WORKSPACE_ID} />);

    fireEvent.click(screen.getByRole('button', { name: 'common.generate' }));

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const [, options] = vi.mocked(fetch).mock.calls[0]!;
    expect(JSON.parse(String(options?.body))).toEqual(
      expect.objectContaining({ wsId: WORKSPACE_ID })
    );
    expect(mocks.push).toHaveBeenCalledWith(`/${WORKSPACE_ID}/c/chat-1`);
  });
});
