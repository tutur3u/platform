import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../messages/en.json';
import { PitchDeck } from './pitch-deck';
import type { PitchCopy } from './pitch-model';

vi.mock('next-intl', () => ({ useLocale: () => 'en' }));

const copy = messages.pitch as PitchCopy;
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
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(window.location.hash).toBe('#trust');
  });

  it('navigates from the overview and exposes the selected presenter notes', () => {
    render(<PitchDeck copy={copy} />);
    fireEvent.click(screen.getByRole('button', { name: copy.overview }));
    const overview = screen.getByRole('navigation', { name: copy.overview });
    fireEvent.click(
      within(overview).getByRole('button', { name: /Pricing proposal/ })
    );
    expect(window.location.hash).toBe('#pricing');
    expect(
      screen.queryByRole('navigation', { name: copy.overview })
    ).toBeNull();
    const notes = screen.getByRole('button', { name: copy.notes });
    fireEvent.click(notes);
    expect(screen.getByText(copy.slides.pricing.note)).toBeDefined();
    fireEvent.keyDown(notes, { key: 'Escape' });
    expect(screen.queryByText(copy.slides.pricing.note)).toBeNull();
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
