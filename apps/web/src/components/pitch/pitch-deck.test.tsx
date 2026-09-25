import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../messages/en.json';
import { PitchDeck } from './pitch-deck';
import type { PitchCopy } from './pitch-model';

vi.mock('@tuturuuu/ui/public-workspace-prices', () => ({
  usePublicWorkspacePrices: () => ({
    data: {
      currency: 'usd',
      prices: {
        plus: { monthly: 800, annual: 8000 },
        pro: { monthly: 1500, annual: 15000 },
      },
    },
    isPending: false,
    isError: false,
  }),
}));

vi.mock('next-intl', () => ({ useLocale: () => 'en' }));

const copy = {
  ...messages.pitch,
  capabilities: messages.capabilities,
} as PitchCopy;
const visibleSlide = () =>
  document.querySelector('section[aria-hidden="false"]') as HTMLElement;

afterEach(() => {
  window.history.replaceState(null, '', '/');
  vi.useRealTimers();
});

describe('pitch presentation controls', () => {
  it('restores a shared slide and preserves range-input keyboard control', () => {
    window.history.replaceState(null, '', '#calculator');
    render(<PitchDeck copy={copy} />);
    expect(visibleSlide().textContent).toContain(copy.slides.calculator.kicker);
    fireEvent.keyDown(screen.getByLabelText(copy.members), {
      key: 'ArrowRight',
    });
    expect(window.location.hash).toBe('#calculator');
    expect(visibleSlide().textContent).toContain('$80');
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(window.location.hash).toBe('#openness');
  });

  it('navigates from the overview and exposes the selected presenter notes', () => {
    render(<PitchDeck copy={copy} />);
    fireEvent.click(screen.getByRole('button', { name: copy.overview }));
    const overview = screen.getByRole('navigation', { name: copy.overview });
    fireEvent.click(
      within(overview).getByRole('button', {
        name: new RegExp(copy.slides.calculator.kicker),
      })
    );
    expect(window.location.hash).toBe('#calculator');
    expect(
      screen.queryByRole('navigation', { name: copy.overview })
    ).toBeNull();
    const notes = screen.getByRole('button', { name: copy.notes });
    fireEvent.click(notes);
    expect(screen.getByText(copy.slides.calculator.note)).toBeDefined();
    fireEvent.keyDown(notes, { key: 'Escape' });
    expect(screen.queryByText(copy.slides.calculator.note)).toBeNull();
  });

  it('pauses autoplay for manual navigation and bounds the final slide', () => {
    vi.useFakeTimers();
    render(<PitchDeck copy={copy} />);
    fireEvent.click(screen.getByRole('button', { name: copy.play }));
    fireEvent.click(screen.getByRole('button', { name: copy.next }));
    expect(screen.getByRole('button', { name: copy.play })).toBeDefined();
    fireEvent.keyDown(document.body, { key: 'End' });
    expect(window.location.hash).toBe('#closing');
    expect(
      screen.getByRole('button', { name: copy.next }).hasAttribute('disabled')
    ).toBe(true);
  });
});

it('labels printed slides independently of the selected slide', () => {
  render(<PitchDeck copy={copy} />);
  expect(screen.getAllByText(copy.livePricingProposal)).toHaveLength(1);
  expect(screen.getAllByText(copy.slides.vision.status).length).toBeGreaterThan(
    0
  );
});

it('changes the synthetic scenario without navigating or invoking AI', () => {
  window.history.replaceState(null, '', '#simulation');
  render(<PitchDeck copy={copy} />);
  const input = screen.getByRole('slider', {
    name: new RegExp(copy.simulation.people),
  });
  fireEvent.change(input, { target: { value: '10' } });
  fireEvent.keyDown(input, { key: 'ArrowRight' });
  expect(window.location.hash).toBe('#simulation');
  expect(visibleSlide().textContent).toContain('240');
  expect(visibleSlide().textContent).toContain(copy.simulation.headroom);
  fireEvent.keyDown(screen.getByText(copy.simulation.baseline), {
    key: ' ',
    code: 'Space',
  });
  expect(screen.getByRole('button', { name: copy.play })).toBeDefined();
});
