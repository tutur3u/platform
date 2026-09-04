import { describe, expect, it } from 'vitest';
import { getRichTextEditorClasses } from '../editor-classes';

describe('rich text editor classes', () => {
  it('keeps regular and checklist nesting visibly indented', () => {
    const classes = getRichTextEditorClasses({ readOnly: false });

    expect(classes).toContain('[&_li_ul]:ml-6');
    expect(classes).toContain('[&_li_ol]:ml-6');
    expect(classes).toContain(
      '[&_ul[data-type="taskList"]_ul[data-type="taskList"]]:ml-6'
    );
    expect(classes).not.toContain(
      '[&_ul[data-type="taskList"]_ul[data-type="taskList"]]:ml-0'
    );
  });

  it('styles toggle summaries by heading level and indents their body', () => {
    const classes = getRichTextEditorClasses({ readOnly: false });

    expect(classes).toContain('[&_summary[data-heading-level="1"]]:text-4xl');
    expect(classes).toContain('[&_summary[data-heading-level="2"]]:text-3xl');
    expect(classes).toContain('[&_summary[data-heading-level="3"]]:text-2xl');
    expect(classes).toContain('[&_div[data-type="detailsContent"]]:border-l');
  });

  it('retains read-only interaction guards and custom classes', () => {
    const classes = getRichTextEditorClasses({
      className: 'task-description-editor',
      readOnly: true,
    });

    expect(classes).toContain('task-description-editor');
    expect(classes).toContain('[&_.task-list-checkbox]:!pointer-events-none');
  });
});
