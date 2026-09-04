import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { StatedFile } from '@tuturuuu/ui/custom/file-uploader';
import { createRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PromptForm } from './prompt-form';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('react-textarea-autosize', () => ({
  default: 'textarea',
}));

function PromptHarness({
  onSubmit,
}: {
  onSubmit: (value: string) => Promise<void>;
}) {
  const [input, setInput] = useState('');
  const [files, setFiles] = useState<StatedFile[]>([]);

  return (
    <>
      <div id="main-chat-content" />
      <PromptForm
        assistantName="Mira"
        files={files}
        setFiles={setFiles}
        input={input}
        inputRef={createRef<HTMLTextAreaElement>()}
        setInput={setInput}
        onSubmit={onSubmit}
        isLoading={false}
        toggleChatFileUpload={vi.fn()}
      />
    </>
  );
}

describe('Rewise prompt form', () => {
  beforeEach(() => {
    Element.prototype.scrollTo = vi.fn();
  });

  afterEach(cleanup);

  it('keeps the composer usable without an undefined model selector', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<PromptHarness onSubmit={onSubmit} />);

    expect(screen.queryByText('undefined/undefined')).toBeNull();
    expect(screen.queryByText('gemini-3-flash')).toBeNull();

    const textbox = screen.getByPlaceholderText('prompt_placeholder');
    const sendButton = screen.getByRole('button', {
      name: 'send_message',
    });

    expect(
      screen.getByRole('button', { name: 'add_attachments' })
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'voice_input' })).toBeTruthy();

    expect((sendButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(textbox, { target: { value: '  Help me plan today  ' } });
    expect((sendButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(sendButton);

    expect(onSubmit).toHaveBeenCalledWith('Help me plan today');
    expect((textbox as HTMLTextAreaElement).value).toBe('');
  });
});
