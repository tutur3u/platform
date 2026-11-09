// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import { PIP_STORAGE_KEY } from '../lib/pip-layout';
import { SelfPreviewPip } from './self-preview-pip';

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderPip(storage: MemoryStorage | null) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SelfPreviewPip label="You" storage={storage}>
        <div>camera</div>
      </SelfPreviewPip>
    </NextIntlClientProvider>
  );
}

it('docks bottom-right by default and moves between corners with arrow keys', () => {
  const storage = new MemoryStorage();
  renderPip(storage);
  const card = screen.getByTestId('self-preview-card');
  expect(card.getAttribute('data-corner')).toBe('bottom-right');
  fireEvent.keyDown(card, { key: 'ArrowUp' });
  expect(card.getAttribute('data-corner')).toBe('top-right');
  fireEvent.keyDown(card, { key: 'ArrowLeft' });
  expect(card.getAttribute('data-corner')).toBe('top-left');
  expect(JSON.parse(storage.getItem(PIP_STORAGE_KEY) ?? '{}').corner).toBe(
    'top-left'
  );
});

it('cycles size presets from the resize control', () => {
  renderPip(new MemoryStorage());
  const card = screen.getByTestId('self-preview-card');
  expect(card.getAttribute('data-size')).toBe('m');
  fireEvent.click(screen.getByTestId('self-preview-resize'));
  expect(card.getAttribute('data-size')).toBe('l');
  fireEvent.click(screen.getByTestId('self-preview-resize'));
  expect(card.getAttribute('data-size')).toBe('s');
});

it('collapses into a restore pill and brings the card back', () => {
  const storage = new MemoryStorage();
  renderPip(storage);
  fireEvent.click(screen.getByTestId('self-preview-hide'));
  expect(screen.queryByTestId('self-preview-card')).toBeNull();
  expect(JSON.parse(storage.getItem(PIP_STORAGE_KEY) ?? '{}').hidden).toBe(
    true
  );
  fireEvent.click(screen.getByTestId('self-preview-restore'));
  expect(screen.getByTestId('self-preview-card')).toBeTruthy();
});

it('restores saved preferences and survives unavailable storage', () => {
  const storage = new MemoryStorage();
  storage.setItem(
    PIP_STORAGE_KEY,
    JSON.stringify({ corner: 'top-left', size: 's', hidden: false })
  );
  renderPip(storage);
  const card = screen.getByTestId('self-preview-card');
  expect(card.getAttribute('data-corner')).toBe('top-left');
  expect(card.getAttribute('data-size')).toBe('s');
  cleanup();
  renderPip(null);
  expect(
    screen.getByTestId('self-preview-card').getAttribute('data-corner')
  ).toBe('bottom-right');
});

it('moves focus to the restore pill after hiding and back to the card after restoring', () => {
  renderPip(new MemoryStorage());
  fireEvent.click(screen.getByTestId('self-preview-hide'));
  expect(document.activeElement).toBe(
    screen.getByTestId('self-preview-restore')
  );
  fireEvent.click(screen.getByTestId('self-preview-restore'));
  expect(document.activeElement).toBe(screen.getByTestId('self-preview-card'));
});

it('announces corner moves politely', () => {
  renderPip(new MemoryStorage());
  fireEvent.keyDown(screen.getByTestId('self-preview-card'), {
    key: 'ArrowLeft',
  });
  expect(screen.getByRole('status').textContent).toBe(
    'Camera preview moved to bottom left'
  );
});
