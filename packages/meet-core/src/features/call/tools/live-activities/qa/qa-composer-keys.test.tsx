// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../../../../../../../../apps/meet/messages/en.json';
import { QaComposer } from './qa-composer';

vi.mock('@tuturuuu/internal-api', () => ({
  uploadMeetChatFile: vi.fn(),
  discardMeetChatFile: vi.fn(async () => ({ ok: true })),
}));
afterEach(cleanup);

function setup() {
  const onSubmit = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <QaComposer
        meetingId="m"
        label="Question"
        placeholder="Ask"
        submitLabel="Ask"
        maxLength={400}
        canAttach={false}
        onUploadError={() => {}}
        onSubmit={onSubmit}
      />
    </NextIntlClientProvider>
  );
  const field = screen.getByLabelText('Question');
  fireEvent.change(field, { target: { value: 'Why?' } });
  return { field, onSubmit };
}

it('asks the question on Enter', async () => {
  const { field, onSubmit } = setup();
  fireEvent.keyDown(field, { key: 'Enter' });
  await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledWith('Why?', []));
});

it('keeps Shift+Enter and IME composition for writing', async () => {
  const { field, onSubmit } = setup();
  fireEvent.keyDown(field, { key: 'Enter', shiftKey: true });
  fireEvent.keyDown(field, { key: 'Enter', isComposing: true });
  fireEvent.keyDown(field, { key: 'Enter', keyCode: 229 });
  await Promise.resolve();
  expect(onSubmit).not.toHaveBeenCalled();
});
