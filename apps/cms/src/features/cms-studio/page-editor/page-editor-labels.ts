/**
 * Every visible or accessible string the page editor renders. The caller
 * supplies them from the CMS messages (external-projects.epm.page_editor_*).
 * Functions take values that vary per section.
 */
export type PageEditorLabels = {
  outlineTitle: string;
  inspectorTitle: string;
  historyTitle: string;
  showOutline: string;
  showInspector: string;
  untitledSection: (position: number) => string;
  sectionType: (blockType: string) => string;
  selectSection: (title: string) => string;
  moveSectionUp: (title: string) => string;
  moveSectionDown: (title: string) => string;
  duplicateSection: (title: string) => string;
  deleteSection: (title: string) => string;
  addSection: string;
  emptyOutline: string;
  saveSaved: string;
  saveSaving: string;
  saveUnsaved: string;
  saveFailed: string;
  retrySave: string;
  historyEmpty: string;
  historyKind: (kind: 'publish' | 'preview' | 'unpublish') => string;
  historyBy: (by: string) => string;
  restoreVersion: (when: string) => string;
};
