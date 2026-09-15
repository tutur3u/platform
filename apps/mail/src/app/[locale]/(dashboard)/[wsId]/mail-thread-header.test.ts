// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { MailThreadHeader } from './mail-thread-header';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
afterEach(cleanup);
function header(unread = false) {
  const onRead = vi.fn();
  render(
    createElement(MailThreadHeader, {
      subject: 'Mail',
      messageCount: 1,
      starred: false,
      unread,
      onRead,
      actionPending: false,
      isDraft: false,
      onStar: vi.fn(),
      onArchive: vi.fn(),
      onTrash: vi.fn(),
    })
  );
  return onRead;
}
it('provides a compact unread action for a viewed thread', () => {
  const onRead = header();
  fireEvent.click(screen.getByRole('button', { name: 'mark_unread' }));
  expect(onRead).toHaveBeenCalledOnce();
});
it('offers mark read on an unread thread', () => {
  const onRead = header(true);
  fireEvent.click(screen.getByRole('button', { name: 'mark_read' }));
  expect(onRead).toHaveBeenCalledOnce();
});
it.each(['mark_unread', 'star', 'archive', 'trash'])(
  'shows a keyboard-accessible tooltip for %s',
  async (name) => {
    header();
    fireEvent.focus(screen.getByRole('button', { name }));
    expect((await screen.findByRole('tooltip')).textContent).toBe(name);
  }
);
