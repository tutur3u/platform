// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { edufestHall } from '@tuturuuu/worlds/edufest-hall';
import { expect, it, vi } from 'vitest';
import { WorldEditor } from './world-editor';

const { saveWorldDraft } = vi.hoisted(() => ({ saveWorldDraft: vi.fn() }));
vi.mock('./draft-actions', () => ({ saveWorldDraft }));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

it('retains a stale edit until the user loads the saved draft and then submits its revision', async () => {
  const workspace = 'workspace';
  const [booth, ...objects] = edufestHall.objects;
  const latest = {
    revision: 2,
    world: { ...edufestHall, objects: [{ ...booth!, x: 8 }, ...objects] },
  };
  saveWorldDraft
    .mockResolvedValueOnce({ status: 'stale', draft: latest })
    .mockResolvedValueOnce({
      status: 'ok',
      draft: {
        revision: 3,
        world: { ...latest.world, objects: [{ ...booth!, x: 9 }, ...objects] },
      },
    });

  render(
    <WorldEditor
      wsId={workspace}
      initial={{ revision: 1, world: edufestHall }}
    />
  );
  const xField = () => screen.getByRole('spinbutton', { name: 'x' });
  const save = () => screen.getByRole('button', { name: 'save' });
  fireEvent.change(xField(), { target: { value: '10' } });
  fireEvent.click(save());

  expect(await screen.findByRole('alert')).toHaveTextContent('stale');
  expect(xField()).toHaveValue(10);
  expect(save()).toBeDisabled();
  expect(saveWorldDraft).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole('button', { name: 'load_latest' }));
  expect(xField()).toHaveValue(8);
  fireEvent.change(xField(), { target: { value: '9' } });
  fireEvent.click(save());

  await waitFor(() => expect(screen.getByText('saved')).toBeInTheDocument());
  expect(saveWorldDraft).toHaveBeenLastCalledWith(workspace, {
    revision: 2,
    geometry: [{ ...booth, x: 9 }, ...objects],
  });
});
