import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Rewise prompt form controls', () => {
  it('keeps toolbar actions from accidentally submitting the prompt', async () => {
    const source = await readFile(
      resolve(process.cwd(), 'src/components/prompt-form.tsx'),
      'utf8'
    );

    expect(source).toContain('onClick={toggleChatFileUpload}');
    expect(source).toContain('onClick={toggleChatVisibility}');
    expect(source.match(/type="button"/g)?.length).toBeGreaterThanOrEqual(7);
    expect(source.match(/type="submit"/g)).toHaveLength(1);
  });

  it('restores the submitted draft when chat creation fails', async () => {
    const source = await readFile(
      resolve(process.cwd(), 'src/components/prompt-form.tsx'),
      'utf8'
    );

    expect(source).toContain('const submittedInput = input;');
    expect(source).toContain('setInput(submittedInput);');
  });
});
