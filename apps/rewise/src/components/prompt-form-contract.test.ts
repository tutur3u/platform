import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Rewise prompt form controls', () => {
  it('renders without depending on the retired main-content shell id', async () => {
    const source = await readFile(
      resolve(process.cwd(), 'src/components/prompt-form.tsx'),
      'utf8'
    );

    expect(source).not.toContain("document.getElementById('main-content')");
    expect(source).not.toContain('if (!element) return null;');
    expect(source).toContain("document.getElementById('main-chat-content')");
  });

  it('keeps toolbar actions from accidentally submitting the prompt', async () => {
    const source = await readFile(
      resolve(process.cwd(), 'src/components/prompt-form.tsx'),
      'utf8'
    );

    expect(source).toContain('onClick={toggleChatFileUpload}');
    expect(source).toContain('onClick={toggleChatVisibility}');
    const buttons = [...source.matchAll(/<Button\b[\s\S]*?>/g)];
    expect(buttons.every(([button]) => button.includes('type='))).toBe(true);
    expect(source.match(/type="submit"/g)).toHaveLength(1);
  });

  it('restores the submitted draft when chat creation fails', async () => {
    const source = await readFile(
      resolve(process.cwd(), 'src/components/prompt-form.tsx'),
      'utf8'
    );

    expect(source).toContain('const submittedInput = input.trim();');
    expect(source.indexOf("setInput('');")).toBeLessThan(
      source.indexOf('await onSubmit(submittedInput);')
    );
    expect(source).toContain('setInput(submittedInput);');
  });

  it('uses a compact always-visible composer without an empty model picker', async () => {
    const [panelSource, promptSource, chatSource] = await Promise.all([
      readFile(resolve(process.cwd(), 'src/components/chat-panel.tsx'), 'utf8'),
      readFile(
        resolve(process.cwd(), 'src/components/prompt-form.tsx'),
        'utf8'
      ),
      readFile(
        resolve(process.cwd(), 'src/app/[locale]/(dashboard)/[wsId]/chat.tsx'),
        'utf8'
      ),
    ]);

    expect(panelSource).not.toContain('ChatModelSelector');
    expect(panelSource).not.toContain('showExtraOptions');
    expect(promptSource).not.toContain('showExtraOptions');
    expect(promptSource).toContain("t('ai_chat.prompt_placeholder')");
    expect(chatSource).toContain('id="main-chat-content"');
  });
});
