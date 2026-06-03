import { describe, expect, it } from 'vitest';
import { escapeTerminalText, renderSelectItemLines } from './select';

describe('CLI selector rendering', () => {
  it('visibly escapes terminal control characters', () => {
    const escaped = escapeTerminalText(
      'Name\u001b]52;c;payload\u0007\nNext\u009b31m'
    );

    expect(escaped).toBe('Name\\x1B]52;c;payload\\x07\\nNext\\x9B31m');
  });

  it('renders untrusted labels and descriptions without raw controls', () => {
    const lines = renderSelectItemLines({
      getDescription: (item) => item.description,
      getLabel: (item) => item.name,
      items: [
        {
          description: 'Hidden\rline\u009b31m',
          name: 'Board\u001b]52;c;payload\u0007\nSpoof',
        },
      ],
      selectedIndex: 0,
      title: 'Select board',
    });
    const itemLine = lines.at(-1) ?? '';

    expect(itemLine).toContain('Board\\x1B]52;c;payload\\x07\\nSpoof');
    expect(itemLine).toContain('Hidden\\rline\\x9B31m');
    expect(itemLine).not.toContain('\u001b');
    expect(itemLine).not.toContain('\u0007');
    expect(itemLine).not.toContain('\u009b');
    expect(itemLine).not.toContain('\n');
  });
});
