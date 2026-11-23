// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { JigsawCheck, type JigsawCheckLabels } from './jigsaw-check';

const labels: JigsawCheckLabels = {
  start: 'start',
  title: 'title',
  instructions: 'instructions',
  slider: 'slider',
  position: (percent) => `at ${percent}%`,
  loading: 'loading',
  verifying: 'verifying',
  passed: 'passed',
  tryAgain: 'try again',
  newPuzzle: 'new puzzle',
  failed: 'failed',
};

const challenge = {
  token: 'sealed',
  background: 'data:image/png;base64,AA==',
  piece: 'data:image/png;base64,AA==',
  pieceY: 40,
  width: 320,
  height: 160,
  pieceSize: 54,
  expiresAt: Date.now() + 120_000,
};

afterEach(() => cleanup());

async function open(verify = vi.fn()) {
  const onPass = vi.fn();
  render(
    <JigsawCheck
      load={async () => challenge}
      verify={verify}
      onPass={onPass}
      labels={labels}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'start' }));
  await screen.findByRole('slider', { name: 'slider' });
  return { onPass, verify };
}

it('moves the piece with the keyboard, announces it and submits with Enter', async () => {
  const verify = vi.fn().mockResolvedValue({ ok: true, passToken: 'pass' });
  const { onPass } = await open(verify);
  const slider = screen.getByRole('slider');
  fireEvent.keyDown(slider, { key: 'ArrowRight', shiftKey: true });
  fireEvent.keyDown(slider, { key: 'ArrowRight' });
  expect(slider.getAttribute('aria-valuenow')).toBe('12');
  expect(slider.getAttribute('aria-valuetext')).toBe('at 5%');
  fireEvent.keyDown(slider, { key: 'Enter' });
  await waitFor(() => expect(onPass).toHaveBeenCalledWith('pass'));
  expect(verify).toHaveBeenCalledWith(
    expect.objectContaining({ token: 'sealed', x: 12, mode: 'keyboard' })
  );
  expect(verify.mock.calls[0]![0].trajectory.length).toBe(3);
  expect(screen.getByText('passed')).toBeTruthy();
});

it('drags with the pointer and reports the trajectory', async () => {
  const verify = vi.fn().mockResolvedValue({ ok: false, retry: true });
  await open(verify);
  const slider = screen.getByRole('slider');
  act(() => {
    fireEvent.pointerDown(slider, { clientX: 10, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(slider, { clientX: 60, clientY: 51, pointerId: 1 });
    fireEvent.pointerUp(slider, { clientX: 110, clientY: 52, pointerId: 1 });
  });
  await waitFor(() => expect(verify).toHaveBeenCalled());
  const call = verify.mock.calls[0]![0];
  expect(call.mode).toBe('pointer');
  expect(call.x).toBe(100);
  expect(call.trajectory.length).toBeGreaterThanOrEqual(3);
  expect(await screen.findByText('try again')).toBeTruthy();
  expect(slider.getAttribute('aria-valuenow')).toBe('0');
});

it('offers a new puzzle when the challenge is spent', async () => {
  await open(vi.fn().mockResolvedValue({ ok: false, retry: false }));
  fireEvent.keyDown(screen.getByRole('slider'), { key: 'Enter' });
  expect(
    await screen.findByRole('button', { name: 'new puzzle' })
  ).toBeTruthy();
  expect(screen.getByText('failed')).toBeTruthy();
});
