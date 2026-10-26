// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../apps/meet/messages/en.json';
import { WorkbenchOutput } from './workbench-output';

afterEach(cleanup);
const t = messages.programmingPlayground;
type Props = Parameters<typeof WorkbenchOutput>[0];
function mount(overrides: Partial<Props> = {}) {
  const props: Props = {
    open: true,
    onToggle: vi.fn(),
    view: { text: '', exitCode: null, running: false },
    save: 'idle',
    failed: false,
    run: {
      command: 'python3 main.py',
      onCommand: vi.fn(),
      stdin: '',
      onStdin: vi.fn(),
      editable: true,
    },
    ...overrides,
  };
  const view = render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <WorkbenchOutput {...props} />
    </NextIntlClientProvider>
  );
  return { ...view, props };
}

it('shows an explicit empty state instead of a blank or broken pane', () => {
  const { container } = mount();
  expect(screen.getByText(t.outputEmpty)).toBeTruthy();
  expect(container.querySelector('iframe')).toBeNull();
  // The retired helper copy must not come back as literal text.
  expect(screen.queryByText(/save in the background/i)).toBeNull();
  expect(screen.queryByText(/Background saves write/i)).toBeNull();
});

it('shows real run output with its exit code and the save state', () => {
  mount({
    view: { text: 'Hello World!\n', exitCode: 0, running: false },
    save: 'saved',
  });
  expect(screen.getByText(/Hello World!/).tagName).toBe('PRE');
  expect(screen.getByText('Exited with code 0')).toBeTruthy();
  expect(screen.getByRole('status').textContent).toBe(t.saved);
});

it('collapses to a single header row and keeps the command editable there', () => {
  const { container, props } = mount({ open: false });
  expect(screen.queryByText(t.outputEmpty)).toBeNull();
  expect(container.querySelector('pre')).toBeNull();
  const toggle = screen.getByRole('button', { name: t.console });
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(toggle);
  expect(props.onToggle).toHaveBeenCalled();
  const command = screen.getByLabelText(t.command) as HTMLInputElement;
  expect(command.value).toBe('python3 main.py');
  fireEvent.change(command, { target: { value: 'python3 app.py' } });
  expect(props.run?.onCommand).toHaveBeenCalledWith('python3 app.py');
});

it('renders the preview frame only for a valid opted-in port', () => {
  const url = vi.fn((port: number) => `/preview/${port}/`);
  const { container, rerender } = mount({
    preview: { port: '80', onPort: vi.fn(), url, onClose: vi.fn() },
  });
  expect(container.querySelector('iframe')).toBeNull();
  rerender(
    <NextIntlClientProvider locale="en" messages={messages}>
      <WorkbenchOutput
        open
        onToggle={vi.fn()}
        view={{ text: '', exitCode: null, running: false }}
        save="idle"
        failed={false}
        preview={{ port: '3000', onPort: vi.fn(), url, onClose: vi.fn() }}
      />
    </NextIntlClientProvider>
  );
  const frame = container.querySelector('iframe');
  expect(frame?.getAttribute('src')).toBe('/preview/3000/');
  expect(frame?.getAttribute('sandbox')).toBe('allow-scripts allow-forms');
  expect(screen.getByRole('button', { name: t.previewClose })).toBeTruthy();
});
