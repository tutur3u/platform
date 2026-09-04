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

  it('uses the exact Platform Mira panel composition', async () => {
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
    expect(promptSource).toContain("t('prompt_placeholder'");
    expect(promptSource).toContain(
      "'flex min-w-0 flex-col justify-center rounded-xl border border-border/50 bg-background/80 backdrop-blur-sm'"
    );
    expect(panelSource).toContain('<AssistantHeader');
    expect(panelSource).toContain('<AssistantToolbar');
    expect(panelSource).toContain(
      'absolute right-0 bottom-0 left-0 z-10 flex min-w-0 max-w-full flex-col p-3 sm:p-4'
    );
    expect(chatSource).toContain('id="main-chat-content"');
    expect(chatSource).toContain(
      'relative flex h-[calc(100vh-5rem)] min-h-0 flex-col overflow-hidden md:h-[calc(100vh-2rem)]'
    );
    expect(chatSource).toContain(
      'relative flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-hidden rounded-xl border border-border/60 bg-card/50 p-3 pb-0 shadow-sm backdrop-blur-sm sm:p-4'
    );
  });
});
