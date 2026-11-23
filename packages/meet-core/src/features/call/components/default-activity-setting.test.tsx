// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import en from '../../../../../../apps/meet/messages/en.json';
import { toolActivityId } from '../stage-layout/activity-ids';
import { meetToolsFor } from '../tools/registry';
import { DefaultActivitySetting } from './default-activity-setting';

const tools = meetToolsFor({ assessment: true });

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
});
afterEach(cleanup);

function mount(value: string | null, onChange = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <DefaultActivitySetting value={value} tools={tools} onChange={onChange} />
    </NextIntlClientProvider>
  );
  return onChange;
}

it.each(tools.map((tool) => [tool.id] as const))(
  'offers %s with an id the room accepts',
  async (toolId) => {
    const onChange = mount(null);
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' });
    const options = await screen.findAllByRole('option');
    expect(options).toHaveLength(tools.length + 1);
    const index = tools.findIndex((tool) => tool.id === toolId) + 1;
    fireEvent.click(options[index]!);
    expect(onChange).toHaveBeenCalledWith(toolActivityId(toolId));
    expect(toolActivityId(toolId)).toMatch(/^tool:[a-z0-9-]{1,64}$/);
  }
);

it('selects by keyboard and clears with None', async () => {
  const onChange = mount('tool:live-qa');
  const trigger = screen.getByRole('combobox');
  expect(trigger.textContent).toContain('Q&A');
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  const options = await screen.findAllByRole('option');
  fireEvent.keyDown(options[0]!, { key: 'Enter' });
  expect(onChange).toHaveBeenCalledWith(null);
});

it('shows what the room holds, so a change the room did not keep snaps back', () => {
  mount(null);
  expect(screen.getByRole('combobox').textContent).toContain('None');
});
