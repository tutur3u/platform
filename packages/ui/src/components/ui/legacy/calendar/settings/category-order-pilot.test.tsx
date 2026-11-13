import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { StrictMode, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../../../../../../apps/web/messages/en.json';
import type { CategoryColorsData } from './category-color-settings';
import { CategoryOrderPilot } from './category-order-pilot';

const initial: CategoryColorsData = {
  categories: [
    { name: 'Work', color: 'BLUE' },
    { name: 'Personal', color: 'GREEN' },
    { name: 'Family', color: 'RED' },
  ],
};
afterEach(cleanup);
function mount(value = initial, onChange = vi.fn()) {
  function Fixture() {
    const [data, setData] = useState(value);
    return (
      <CategoryOrderPilot
        value={data}
        onChange={(next) => {
          onChange(next);
          setData(next);
        }}
      />
    );
  }
  render(
    <StrictMode>
      <NextIntlClientProvider locale="en" messages={messages}>
        <Fixture />
      </NextIntlClientProvider>
    </StrictMode>
  );
  return onChange;
}
const names = () => screen.getAllByRole('option').map((el) => el.textContent);
const key = (el: HTMLElement, value: string) =>
  fireEvent.keyDown(el, { key: value });

describe('CategoryOrderPilot keyboard contract', () => {
  it('has a named listbox, one tab stop and arrow/Home/End focus order', async () => {
    const changed = mount();
    expect(
      screen.getByRole('listbox', { name: 'Category order' })
    ).toHaveAttribute('aria-orientation', 'vertical');
    const [work, personal, family] = screen.getAllByRole('option') as [
      HTMLElement,
      HTMLElement,
      HTMLElement,
    ];
    await waitFor(() => expect(work.tabIndex).toBe(0));
    expect([personal.tabIndex, family.tabIndex]).toEqual([-1, -1]);
    act(() => work.focus());
    key(work, 'ArrowDown');
    expect(personal).toHaveFocus();
    key(personal, 'End');
    expect(family).toHaveFocus();
    key(family, 'Home');
    expect(work).toHaveFocus();
    expect(changed).not.toHaveBeenCalled();
  });

  it('previews arrows after pickup, commits only on drop, and retains item focus', async () => {
    const changed = mount();
    const work = screen.getByRole('option', { name: 'Work' });
    act(() => work.focus());
    key(work, ' ');
    expect(work).toHaveAttribute('aria-selected', 'true');
    key(work, 'ArrowDown');
    expect(names()).toEqual(['Personal', 'Work', 'Family']);
    expect(changed).not.toHaveBeenCalled();
    await waitFor(() => expect(work).toHaveFocus());
    key(work, 'Enter');
    expect(changed).toHaveBeenCalledTimes(1);
    expect(
      changed.mock.calls[0]?.[0].categories.map((c: { name: string }) => c.name)
    ).toEqual(names());
    await waitFor(() => expect(work).toHaveAttribute('aria-selected', 'false'));
    expect(work).toHaveFocus();
  });

  it('Escape restores the committed order without persisting a draft', async () => {
    const changed = mount();
    const work = screen.getByRole('option', { name: 'Work' });
    act(() => work.focus());
    key(work, 'Enter');
    key(work, 'End');
    key(work, 'Escape');
    expect(names()).toEqual(['Work', 'Personal', 'Family']);
    expect(changed).not.toHaveBeenCalled();
    await waitFor(() => expect(work).toHaveFocus());
    expect(work).toHaveAttribute('aria-selected', 'false');
  });

  it('does not reorder on ungrabbed arrows or modified pickup (negative control)', () => {
    const changed = mount();
    const work = screen.getByRole('option', { name: 'Work' });
    fireEvent.keyDown(work, { key: ' ', ctrlKey: true });
    key(work, 'ArrowDown');
    key(work, 'Escape');
    expect(names()).toEqual(['Work', 'Personal', 'Family']);
    expect(changed).not.toHaveBeenCalled();
  });

  it('Tab cancels a draft and leaves native tab traversal unblocked', () => {
    const changed = mount();
    const work = screen.getByRole('option', { name: 'Work' });
    key(work, ' ');
    key(work, 'ArrowDown');
    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      work.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(false);
    expect(names()).toEqual(['Work', 'Personal', 'Family']);
    expect(changed).not.toHaveBeenCalled();
  });

  it('rejects ambiguous identities instead of committing duplicate categories', () => {
    mount({ categories: [initial.categories[0]!, initial.categories[0]!] });
    expect(
      screen.getByText('Category names must be unique and nonempty to reorder.')
    ).toHaveTextContent('unique and nonempty');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
