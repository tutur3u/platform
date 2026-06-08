export const categoryIds = [
  'actions',
  'inputs',
  'overlays',
  'navigation',
  'feedback',
  'data',
  'layout',
  'typography',
  'advanced',
] as const;

export type ShowcaseCategory = (typeof categoryIds)[number];

export type PreviewKind =
  | 'accordion'
  | 'alert'
  | 'alert-dialog'
  | 'aspect-ratio'
  | 'avatar'
  | 'badge'
  | 'breadcrumb'
  | 'button'
  | 'calendar'
  | 'card'
  | 'carousel'
  | 'chart'
  | 'checkbox'
  | 'codeblock'
  | 'collapsible'
  | 'color-picker'
  | 'command'
  | 'context-menu'
  | 'currency-input'
  | 'date-time-picker'
  | 'dialog'
  | 'diff-viewer'
  | 'drawer'
  | 'dropdown-menu'
  | 'form'
  | 'form-required-indicator'
  | 'hover-card'
  | 'input'
  | 'input-otp'
  | 'kbd'
  | 'label'
  | 'markdown'
  | 'menubar'
  | 'navbar'
  | 'navigation-menu'
  | 'pagination'
  | 'popover'
  | 'progress'
  | 'radio-group'
  | 'report-problem-dialog'
  | 'resizable'
  | 'scroll-area'
  | 'select'
  | 'separator'
  | 'sheet'
  | 'sidebar'
  | 'skeleton'
  | 'slider'
  | 'sonner'
  | 'sticky-bottom-bar'
  | 'switch'
  | 'table'
  | 'tabs'
  | 'textarea'
  | 'time-picker-input'
  | 'toast'
  | 'toaster'
  | 'toggle'
  | 'toggle-group'
  | 'tooltip';

export interface ComponentEntry {
  id: PreviewKind;
  name: string;
  category: ShowcaseCategory;
  importPath: string;
  exports: string[];
  customizationKeys: string[];
  usage: string;
  safePreview?: boolean;
}

export const usage = (importPath: string, names: string[], body: string) =>
  `import { ${names.join(', ')} } from '${importPath}';\n\n${body}`;
