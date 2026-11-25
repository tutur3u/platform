// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import en from '../../../../../../apps/meet/messages/en.json';
import viMessages from '../../../../../../apps/meet/messages/vi.json';
import { meetToolsFor } from '../tools/registry';
import { DefaultActivitySetting } from './default-activity-setting';

const ux = vi.hoisted(() => ({ v2: true }));
vi.mock('../prejoin/prejoin-context', () => ({
  useMeetUxV2: () => ux.v2,
}));

const tools = meetToolsFor({ assessment: true });
const call = en.meet.call;

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
});
afterEach(() => {
  cleanup();
  ux.v2 = true;
});

function mount(value: string | null, locale: 'en' | 'vi' = 'en') {
  const onChange = vi.fn();
  render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === 'en' ? en : viMessages}
      timeZone="UTC"
    >
      <DefaultActivitySetting value={value} tools={tools} onChange={onChange} />
    </NextIntlClientProvider>
  );
  return onChange;
}

async function optionNames() {
  fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' });
  return (await screen.findAllByRole('option')).map(
    (option) => option.textContent
  );
}

it('names the pen board and the private timer Whiteboard and Timer', async () => {
  const onChange = mount(null);
  const names = await optionNames();
  expect(names).toContain(call.activities.merged.whiteboard);
  expect(names).toContain(call.activities.merged.timer);
  expect(names).not.toContain(call.live_activities.penboard.title);
  expect(names).not.toContain(call.tools.timer.title);
  const options = await screen.findAllByRole('option');
  const whiteboard = names.indexOf(call.activities.merged.whiteboard);
  fireEvent.click(options[whiteboard]!);
  // The room keeps accepting the stored pen board id.
  expect(onChange).toHaveBeenCalledWith('tool:pen-whiteboard');
});

it('shows a stored pen board or private timer under the merged name', () => {
  mount('tool:pen-whiteboard');
  expect(screen.getByRole('combobox').textContent).toContain(
    call.activities.merged.whiteboard
  );
  cleanup();
  mount('tool:timers', 'vi');
  expect(screen.getByRole('combobox').textContent).toContain(
    viMessages.meet.call.activities.merged.timer
  );
});

it('keeps the older names without Meet UX v2', () => {
  ux.v2 = false;
  mount('tool:pen-whiteboard');
  expect(screen.getByRole('combobox').textContent).toContain(
    call.live_activities.penboard.title
  );
});
