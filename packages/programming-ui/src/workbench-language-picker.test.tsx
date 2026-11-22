// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../apps/meet/messages/en.json';
import { WorkbenchLanguagePicker } from './workbench-language-picker';

afterEach(cleanup);
const t = messages.programmingPlayground;
const languages = ['python', 'javascript', 'typescript', 'go', 'rust'] as const;
function mount(onChange?: (value: string) => void, language = 'python') {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <WorkbenchLanguagePicker
        language={language as (typeof languages)[number]}
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

it('marks only the active runtime as a filled pill with a check', () => {
  mount(vi.fn());
  const radios = screen.getAllByRole('radio');
  const checked = radios.filter(
    (radio) => radio.getAttribute('aria-checked') === 'true'
  );
  expect(checked.map((radio) => radio.textContent)).toEqual(['Python']);
  expect(checked[0]!.className).toContain('bg-primary');
  expect(checked[0]!.querySelector('svg')).toBeTruthy();
  for (const radio of radios.filter((item) => !checked.includes(item)))
    expect(radio.className).not.toContain('bg-primary');
});

it('names a runtime chosen from More on its checked trigger', () => {
  mount(vi.fn(), 'go');
  const more = screen.getByRole('radio', { name: `Go, ${t.moreLanguages}` });
  expect(more.getAttribute('aria-checked')).toBe('true');
  expect(more.textContent).toContain('Go');
  expect(
    screen.getByRole('radio', { name: 'Python' }).getAttribute('aria-checked')
  ).toBe('false');
});

it('shows a read-only chip to people who cannot switch the runtime', () => {
  mount();
  expect(screen.queryByRole('radiogroup')).toBeNull();
  const chip = screen.getByTitle(t.languageHostOnly);
  expect(chip.textContent).toBe(`${t.language}: Python`);
  expect(chip.getAttribute('data-language')).toBe('python');
});
