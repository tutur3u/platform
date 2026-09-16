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
vi.mock('framer-motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('framer-motion')>()),
  useReducedMotion: () => true,
}));
afterEach(() => vi.useRealTimers());

const props = {
  assistantName: 'Mira',
  attachedFiles: [],
  bottomBarVisible: true,
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

it('retains the panel and prompt after idle time', () => {
  vi.useFakeTimers();
  render(<MiraChatBottomBar {...props} />);
  const input = screen.getByRole('textbox');
  act(() => input.focus());
  act(() => vi.advanceTimersByTime(COMPOSER_IDLE_MS * 2));
  expect(input).toBeVisible();
  expect(input).toHaveFocus();
  expect(screen.getByRole('button', { name: 'Model control' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Live' }));
  expect(props.onVoiceToggle).toHaveBeenCalled();
});

it('swaps Live tools for Chat tools without replacing the panel or draft', () => {
  const { container, rerender } = render(
    <MiraChatBottomBar
      {...props}
      voiceActive
      liveInputOpen
      input="Draft"
      liveControls={<button type="button">Microphone</button>}
    />
  );
  const panel = container.querySelector('[data-mira-toolset]');
  const composer = container.querySelector('[data-mira-composer]');
  const input = screen.getByRole('textbox');
  rerender(<MiraChatBottomBar {...props} input="Draft" />);
  expect(container.querySelector('[data-mira-toolset]')).toBe(panel);
  expect(container.querySelector('[data-mira-composer]')).toBe(composer);
  expect(composer).not.toHaveClass('absolute');
  expect(
    screen.queryByRole('button', { name: 'Microphone' })
  ).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Model control' })).toBeVisible();
  expect(screen.getByRole('textbox')).toBe(input);
  expect(input).toHaveValue('Draft');
});

it('reveals settings when composing from view-only mode', () => {
  const { rerender } = render(
    <MiraChatBottomBar {...props} bottomBarVisible={false} />
  );
  expect(
    screen
      .getByRole('button', { name: 'Model control', hidden: true })
      .closest('[hidden]')
  ).not.toBeNull();
  rerender(
    <MiraChatBottomBar {...props} bottomBarVisible={false} input="New draft" />
  );
  expect(
    screen.getByRole('button', { name: 'Model control' }).closest('[hidden]')
  ).toBeNull();
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
    screen.getByRole('button', { name: 'Model control' }).closest('[hidden]')
  ).toBeNull();
});

it('reserves layout space for Live controls and preserves the prompt when toggled', () => {
  const { container, rerender } = render(
    <MiraChatBottomBar
      {...props}
      voiceActive
      liveInputOpen
      input="Draft"
      liveControls={<button type="button">Microphone</button>}
    />
  );
  const composer = container.querySelector('[data-mira-composer]');
  expect(composer).toHaveClass('relative', 'shrink-0', 'gap-2');
  expect(composer).not.toHaveClass('absolute');
  const input = screen.getByRole('textbox');
  expect(input).toHaveValue('Draft');
  rerender(
    <MiraChatBottomBar
      {...props}
      voiceActive
      liveInputOpen={false}
      input="Draft"
    />
  );
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  rerender(
    <MiraChatBottomBar {...props} voiceActive liveInputOpen input="Draft" />
  );
  expect(screen.getByRole('textbox')).toBe(input);
  expect(input).toHaveValue('Draft');
});
