import { advancedComponentEntries } from './component-registry-advanced';
import { foundationComponentEntries } from './component-registry-foundations';

export type {
  ComponentEntry,
  PreviewKind,
  ShowcaseCategory,
} from './component-registry-core';
export { categoryIds } from './component-registry-core';

export const componentEntries = [
  ...foundationComponentEntries,
  ...advancedComponentEntries,
];
