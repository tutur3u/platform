import { act, fireEvent, render, screen } from '@testing-library/react';
import type { AIModelUI } from '@tuturuuu/types';
import { createRef, type RefObject } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { MiraChatBottomBar } from './mira-chat-bottom-bar';
import { COMPOSER_IDLE_MS } from './use-mira-composer-density';

vi.mock('next-intl', () => ({
  useTranslations: (scope: string) => (key: string) => {
    if (scope === 'dashboard.voice_assistant')
      return { chat_mode: 'Chat', live_mode: 'Live' }[key] ?? key;
    return key;
  },
}));
vi.mock('./mira-chat-input-toolbar', () => ({
  default: () => <button type="button">Model control</button>,
}));
vi.mock('./chat-input-bar', () => ({
  default: ({
    inputRef,
    input,
  }: {
    inputRef: RefObject<HTMLTextAreaElement | null>;
    input: string;
  }) => <textarea ref={inputRef} aria-label="Message" value={input} readOnly />,
}));
afterEach(() => vi.useRealTimers());

const props = {
  assistantName: 'Mira',
  attachedFiles: [],
  bottomBarVisible: true,
  floating: true,
  canUploadFiles: false,
  input: '',
  inputRef: createRef<HTMLTextAreaElement>(),
  isBusy: false,
  onFileRemove: vi.fn(),
  onSubmit: vi.fn(),
  onVoiceToggle: vi.fn(),
  setInput: vi.fn(),
  activeCreditSource: 'personal' as const,
  isPersonalWorkspace: true,
  model: {} as AIModelUI,
  modelPickerHotkeySignal: 0,
  onCreditSourceChange: vi.fn(),
  onModelChange: vi.fn(),
  onThinkingModeChange: vi.fn(),
  thinkingMode: 'fast' as const,
  toolbarContentRef: createRef<HTMLDivElement>(),
  workspaceCreditLocked: false,
  wsId: 'personal',
  hotkeyLabels: {
    creditSource: '',
    fastMode: '',
    modelPicker: '',
    thinkingMode: '',
  },
};

it('replaces the idle composer with Chat and Live controls and restores focus on reopen', () => {
  vi.useFakeTimers();
  render(<MiraChatBottomBar {...props} />);
  const input = screen.getByRole('textbox');
  act(() => input.focus());
  act(() => vi.advanceTimersByTime(COMPOSER_IDLE_MS));
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Live' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Chat' })).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: 'Chat' }));
  act(() => vi.advanceTimersByTime(20));
  expect(screen.getByRole('textbox')).toBe(input);
  expect(input).toHaveFocus();
  expect(screen.getByRole('button', { name: 'Model control' })).toBeVisible();
});

it('reveals settings when composing from view-only mode', () => {
  const { rerender } = render(
    <MiraChatBottomBar {...props} bottomBarVisible={false} />
  );
  expect(
    screen
      .getByRole('button', { name: 'Model control', hidden: true })
      .closest('[inert]')
  ).not.toBeNull();
  rerender(
    <MiraChatBottomBar {...props} bottomBarVisible={false} input="New draft" />
  );
  expect(
    screen.getByRole('button', { name: 'Model control' }).closest('[inert]')
  ).toBeNull();
});

it('keeps focused toolbar controls accessible until focus returns to the empty input', () => {
  vi.useFakeTimers();
  render(<MiraChatBottomBar {...props} />);
  const control = screen.getByRole('button', { name: 'Model control' });
  act(() => control.focus());
  act(() => vi.advanceTimersByTime(COMPOSER_IDLE_MS));
  expect(control).toHaveFocus();
  expect(screen.getByRole('textbox')).toBeVisible();
  act(() => screen.getByRole('textbox').focus());
  act(() => vi.advanceTimersByTime(COMPOSER_IDLE_MS));
  expect(screen.getByRole('button', { name: 'Chat' })).toHaveFocus();
});

it('reveals settings for attachment-only drafts in view-only mode', () => {
  render(
    <MiraChatBottomBar
      {...props}
      bottomBarVisible={false}
      attachedFiles={[
        {
          id: 'draft-file',
          file: new File(['draft'], 'draft.txt', { type: 'text/plain' }),
          previewUrl: null,
          storagePath: null,
          signedUrl: null,
          status: 'pending',
        },
      ]}
    />
  );
  expect(
    screen.getByRole('button', { name: 'Model control' }).closest('[inert]')
  ).toBeNull();
});
