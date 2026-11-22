// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../apps/meet/messages/en.json';
import { WorkbenchLanguagePicker } from './workbench-language-picker';

afterEach(cleanup);
const t = messages.programmingPlayground;
const languages = ['python', 'javascript', 'typescript', 'go', 'rust'] as const;
function mount(onChange?: (value: string) => void) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <WorkbenchLanguagePicker
        language="python"
        languages={languages}
        onChange={onChange}
      />
    </NextIntlClientProvider>
  );
}

it('offers the three common runtimes as one segmented control', () => {
  const onChange = vi.fn();
  mount(onChange);
  const group = screen.getByRole('radiogroup', { name: t.language });
  expect(group).toBeTruthy();
  const python = screen.getByRole('radio', { name: 'Python' });
  expect(python.getAttribute('aria-checked')).toBe('true');
  fireEvent.click(screen.getByRole('radio', { name: 'TypeScript' }));
  expect(onChange).toHaveBeenCalledWith('typescript');
  fireEvent.click(python);
  expect(onChange).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(python, { key: 'ArrowRight' });
  expect(onChange).toHaveBeenLastCalledWith('javascript');
  expect(screen.getByRole('radio', { name: t.moreLanguages })).toBeTruthy();
});

it('shows a read-only chip to people who cannot switch the runtime', () => {
  mount();
  expect(screen.queryByRole('radiogroup')).toBeNull();
  expect(screen.getByText('Python')).toBeTruthy();
});
