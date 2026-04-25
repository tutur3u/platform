import { describe, expect, it } from 'vitest';
import { __testUtils } from '../markdown-components';

describe('markdown-components table normalization', () => {
  it('enables Streamdown single-dollar inline math for model-style LaTeX output', () => {
    expect(__testUtils.isSingleDollarMathEnabled()).toBe(true);
  });

  it('unwraps fenced markdown tables with valid separator rows', () => {
    const input = [
      'Before',
      '```markdown',
      '| Name | Value |',
      '| --- | ---: |',
      '| Mira | 42 |',
      '```',
      'After',
    ].join('\n');
    const normalized = __testUtils.normalizeMarkdownTables(input);

    expect(normalized).toContain(
      '| Name | Value |\n| --- | ---: |\n| Mira | 42 |'
    );
    expect(normalized).not.toContain('```markdown');
  });

  it('keeps fenced markdown blocks when separator rows contain non-table characters', () => {
    const body = ['| Name | Value |', '| --- | @@@ |', '| Mira | 42 |'].join(
      '\n'
    );
    const input = ['```markdown', body, '```'].join('\n');

    expect(__testUtils.isMarkdownTableBlock(body)).toBe(false);
    expect(__testUtils.normalizeMarkdownTables(input)).toBe(input);
  });
});
