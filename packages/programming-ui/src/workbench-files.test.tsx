// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../apps/meet/messages/en.json';
import { WorkbenchFiles } from './workbench-files';

afterEach(cleanup);
const t = messages.programmingPlayground;
function mount(onAdd?: (path: string) => void) {
  const onSelect = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <WorkbenchFiles
        files={['main.py', 'util.py']}
        active="main.py"
        onSelect={onSelect}
        onAdd={onAdd}
      />
    </NextIntlClientProvider>
  );
  return onSelect;
}

it('renders files as a tab strip without a heading or helper copy', () => {
  const onSelect = mount();
  const tabs = screen.getAllByRole('tab');
  expect(tabs.map((tab) => tab.textContent)).toEqual(['main.py', 'util.py']);
  expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
  fireEvent.click(tabs[1]!);
  expect(onSelect).toHaveBeenCalledWith('util.py');
  expect(screen.queryByText(t.files)).toBeNull();
  expect(screen.queryByRole('button', { name: t.addFile })).toBeNull();
});

it('adds a file inline from the plus button and rejects duplicates', () => {
  const onAdd = vi.fn();
  mount(onAdd);
  fireEvent.click(screen.getByRole('button', { name: t.addFile }));
  const input = screen.getByLabelText(t.newFile) as HTMLInputElement;
  fireEvent.change(input, { target: { value: 'main.py' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(onAdd).not.toHaveBeenCalled();
  expect(screen.getByRole('alert').textContent).toBe(t.fileExists);
  fireEvent.change(input, { target: { value: 'src/app.py' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(onAdd).toHaveBeenCalledWith('src/app.py');
  expect(screen.queryByLabelText(t.newFile)).toBeNull();
});

it('cancels an empty draft with Escape', () => {
  const onAdd = vi.fn();
  mount(onAdd);
  fireEvent.click(screen.getByRole('button', { name: t.addFile }));
  fireEvent.keyDown(screen.getByLabelText(t.newFile), { key: 'Escape' });
  expect(screen.queryByLabelText(t.newFile)).toBeNull();
  expect(onAdd).not.toHaveBeenCalled();
});
