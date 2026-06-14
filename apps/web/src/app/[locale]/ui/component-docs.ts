import { actionComponentDocs } from './component-docs-actions';
import { advancedDocs } from './component-docs-advanced';
import type { ComponentDoc } from './component-docs-core';
import { componentCategoryIds } from './component-docs-core';
import { dataComponentDocs } from './component-docs-data';
import { feedbackComponentDocs } from './component-docs-feedback';
import { inputComponentDocs } from './component-docs-inputs';
import { layoutComponentDocs } from './component-docs-layout';
import { navigationComponentDocs } from './component-docs-navigation';
import { overlayComponentDocs } from './component-docs-overlays';
import { typographyComponentDocs } from './component-docs-typography';
import type { ShowcaseCategory } from './component-registry';

export type { ComponentApiRow, ComponentDoc } from './component-docs-core';

export const componentDocs = [
  ...actionComponentDocs,
  ...inputComponentDocs,
  ...overlayComponentDocs,
  ...navigationComponentDocs,
  ...feedbackComponentDocs,
  ...dataComponentDocs,
  ...layoutComponentDocs,
  ...typographyComponentDocs,
  ...advancedDocs,
];

export const componentDocsByCategory = componentCategoryIds.map((category) => ({
  category,
  docs: componentDocs.filter((doc) => doc.category === category),
}));

export function getComponentDoc(slug: string) {
  return componentDocs.find((doc) => doc.slug === slug || doc.id === slug);
}

export function getAdjacentComponentDocs(doc: ComponentDoc) {
  const index = componentDocs.findIndex((candidate) => candidate.id === doc.id);
  return {
    previous: index > 0 ? componentDocs[index - 1] : undefined,
    next: index >= 0 ? componentDocs[index + 1] : undefined,
  };
}

export function getCategoryComponentDocs(category: ShowcaseCategory) {
  return componentDocs.filter((doc) => doc.category === category);
}
