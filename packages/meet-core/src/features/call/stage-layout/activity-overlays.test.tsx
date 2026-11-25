// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import {
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import {
  DocumentAssist,
  type MiraAssistEditor,
} from '../components/document-assist';
import { ActivityDropdownMenu } from './activity-dropdown-menu';
import { ActivityPaneContext } from './activity-pane-context';
import { ActivitySelect } from './activity-select';

vi.mock('../prejoin/use-meet-call-ux', () => ({
  useMeetCallUx: () => true,
}));

afterEach(cleanup);

function pane(visible: boolean, children: ReactNode) {
  return (
    <ActivityPaneContext
      value={{
        activityId: 'document',
        title: 'Document',
        active: visible,
        visible,
        sizeClass: 'medium',
        short: false,
        maximized: false,
        headerSlot: null,
        toggleMaximize: () => {},
        close: () => {},
      }}
    >
      <div hidden={!visible} inert={!visible || undefined}>
        {children}
      </div>
    </ActivityPaneContext>
  );
}

it('closes the activity select when its pane is hidden', () => {
  const select = (
    <ActivitySelect defaultValue="one">
      <SelectTrigger aria-label="Choice">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="one">One</SelectItem>
      </SelectContent>
    </ActivitySelect>
  );
  const { rerender } = render(pane(true, select));
  fireEvent.keyDown(screen.getByRole('combobox', { name: 'Choice' }), {
    key: 'ArrowDown',
  });
  expect(screen.getByRole('option', { name: 'One' })).toBeTruthy();

  rerender(pane(false, select));
  expect(screen.queryByRole('listbox', { hidden: true })).toBeNull();

  rerender(pane(true, select));
  const trigger = screen.getByRole('combobox', { name: 'Choice' });
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByRole('listbox', { hidden: true })).toBeNull();
});

it('closes the activity dropdown when its pane is hidden', () => {
  const menu = (
    <ActivityDropdownMenu>
      <DropdownMenuTrigger>Document options</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>Rename</DropdownMenuItem>
      </DropdownMenuContent>
    </ActivityDropdownMenu>
  );
  const { rerender } = render(pane(true, menu));
  fireEvent.keyDown(screen.getByRole('button', { name: 'Document options' }), {
    key: 'Enter',
  });
  expect(screen.getByRole('menuitem', { name: 'Rename' })).toBeTruthy();

  rerender(pane(false, menu));
  expect(screen.queryByRole('menu', { hidden: true })).toBeNull();

  rerender(pane(true, menu));
  expect(screen.queryByRole('menu', { hidden: true })).toBeNull();
});

it('clears the Document Assist popover and selection when hidden', () => {
  const t = messages.meet.collaboration;
  const client = new QueryClient();
  const editor = vi.fn<() => MiraAssistEditor | null>(() => ({
    state: {
      doc: {
        isText: false,
        isTextblock: false,
        textContent: 'Selected text',
        type: { name: 'doc' },
        descendants: () => {},
        textBetween: () => 'Selected text',
        content: { size: 13 },
      },
      selection: { from: 1, to: 14 },
    },
    chain: () => {
      throw new Error('This test does not submit an edit');
    },
  }));
  const assist = (
    <DocumentAssist
      meetingId="meeting"
      tabId="document"
      editor={editor}
      awareness={null}
      onInserted={vi.fn()}
    />
  );
  const view = (visible: boolean) => (
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={messages}>
        {pane(visible, assist)}
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
  const { rerender } = render(view(true));
  const trigger = () => screen.getByRole('button', { name: t.ask_mira });
  const run = () =>
    within(screen.getByRole('dialog')).getByRole('button', {
      name: t.mira_run,
    });
  fireEvent.click(trigger());
  expect(run().hasAttribute('disabled')).toBe(false);

  rerender(view(false));
  expect(screen.queryByRole('dialog', { hidden: true })).toBeNull();
  editor.mockReturnValue(null);

  rerender(view(true));
  expect(trigger().getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByRole('dialog', { hidden: true })).toBeNull();
  fireEvent.click(trigger());
  expect(run().hasAttribute('disabled')).toBe(true);
  expect(screen.getByRole('alert').textContent).toBe(t.mira_select_text);
});
