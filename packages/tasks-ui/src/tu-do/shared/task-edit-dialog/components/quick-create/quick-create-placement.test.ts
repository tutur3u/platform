import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createQuickCreateDescription,
  getQuickCreateDescriptionText,
} from './quick-create-description';

const dialogSource = readFileSync(
  resolve(__dirname, '../../../task-edit-dialog.tsx'),
  'utf8'
);

function sliceBetween(source: string, start: string, end: string) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  if (from < 0 || to < 0) throw new Error(`Missing ${start} … ${end}`);
  return source.slice(from, to);
}

// The compact panel is the first branch of the presentation switch; the
// expanded (focused or fullscreen) editor is the second.
const compactBranch = sliceBetween(
  dialogSource,
  '<CompactTaskDialogPanel',
  '<div className={TASK_DIALOG_CONTENT_COLUMN_CLASS_NAME}>'
);
const expandedBranch = sliceBetween(
  dialogSource,
  'TASK_DIALOG_CONTENT_COLUMN_CLASS_NAME}>',
  '<TaskDetailsSection'
);
const expandedPanel = sliceBetween(
  dialogSource,
  '<TaskDetailsSection',
  '</Dialog>'
);

describe('quick-create action placement', () => {
  it('keeps smart suggestions out of the compact dialog', () => {
    expect(compactBranch).not.toContain('smartSuggestionsButton');
    expect(compactBranch).not.toContain('smartSuggestionsPanel');
    expect(compactBranch).not.toMatch(/template/i);
  });

  it('keeps smart suggestions reachable in the expanded editor', () => {
    expect(expandedBranch).toContain('{smartSuggestionsButton}');
    expect(expandedPanel).toContain('{smartSuggestionsPanel}');
  });

  it('expands the compact dialog into the focused editor', () => {
    expect(compactBranch).toContain(
      "onFullscreen={() => setPresentation('focused')}"
    );
  });

  it('renders labeled quick-create chips only when creating', () => {
    expect(compactBranch).toMatch(
      /isCreateMode \? \(\s*<QuickCreatePropertyChips/
    );
  });
});

describe('quick-create description text', () => {
  it('round-trips plain multi-line text', () => {
    const text = 'First line\n\nThird line';
    expect(
      getQuickCreateDescriptionText(createQuickCreateDescription(text))
    ).toBe(text);
  });

  it('clears the description when the field is emptied', () => {
    expect(createQuickCreateDescription('')).toBeNull();
    expect(getQuickCreateDescriptionText(null)).toBe('');
  });

  it('refuses rich content a plain field would lose', () => {
    expect(
      getQuickCreateDescriptionText({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
            ],
          },
        ],
      })
    ).toBeNull();
    expect(
      getQuickCreateDescriptionText({
        type: 'doc',
        content: [{ type: 'bulletList', content: [] }],
      })
    ).toBeNull();
  });
});
