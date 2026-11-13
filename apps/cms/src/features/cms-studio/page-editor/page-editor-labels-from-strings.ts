import type { CmsStrings } from '../cms-strings';
import type { PageEditorLabels } from './page-editor-labels';

/**
 * Fill `%name%` tokens. The CMS messages are read without ICU values, so the
 * page editor's per-section strings carry plain tokens instead of `{name}`.
 */
export function fillTokens(
  template: string,
  values: Record<string, string | number>
) {
  return template.replace(/%([a-z]+)%/g, (token, name: string) =>
    name in values ? String(values[name]) : token
  );
}

/** Page editor labels from the CMS strings (external-projects.epm.*). */
export function pageEditorLabelsFromStrings(
  strings: CmsStrings
): PageEditorLabels {
  const kinds = {
    preview: strings.pageEditorHistoryKindPreview,
    publish: strings.pageEditorHistoryKindPublish,
    unpublish: strings.pageEditorHistoryKindUnpublish,
  } as const;
  return {
    outlineTitle: strings.pageEditorOutlineTitle,
    inspectorTitle: strings.pageEditorInspectorTitle,
    historyTitle: strings.pageEditorHistoryTitle,
    // The toggles reuse the panel titles: no second label for one panel.
    showOutline: strings.pageEditorOutlineTitle,
    showInspector: strings.pageEditorInspectorTitle,
    untitledSection: (n) =>
      fillTokens(strings.pageEditorUntitledSection, { n }),
    sectionType: (blockType) => blockType,
    selectSection: (title) =>
      fillTokens(strings.pageEditorSelectSection, { title }),
    moveSectionUp: (title) =>
      fillTokens(strings.pageEditorMoveSectionUp, { title }),
    moveSectionDown: (title) =>
      fillTokens(strings.pageEditorMoveSectionDown, { title }),
    duplicateSection: (title) =>
      fillTokens(strings.pageEditorDuplicateSection, { title }),
    deleteSection: (title) =>
      fillTokens(strings.pageEditorDeleteSection, { title }),
    addSection: strings.pageEditorAddSection,
    emptyOutline: strings.pageEditorEmptyOutline,
    saveSaved: strings.editorSavedLabel,
    saveSaving: strings.pageEditorSaveSaving,
    saveUnsaved: strings.editorUnsavedLabel,
    saveFailed: strings.pageEditorSaveFailed,
    retrySave: strings.pageEditorRetrySave,
    historyEmpty: strings.pageEditorHistoryEmpty,
    historyKind: (kind) => kinds[kind],
    historyBy: (by) => fillTokens(strings.pageEditorHistoryBy, { by }),
    restoreVersion: (when) =>
      fillTokens(strings.pageEditorRestoreVersion, { when }),
  };
}
