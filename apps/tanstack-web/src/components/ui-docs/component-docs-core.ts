import type {
  ComponentEntry,
  PreviewKind,
  ShowcaseCategory,
} from './component-registry';
import { categoryIds, componentEntries } from './component-registry';

export interface ComponentExample {
  id: string;
  titleKey: 'default' | 'composition' | 'imports';
  descriptionKey: 'default' | 'composition' | 'imports';
  code: string;
  showPreview: boolean;
}

export interface ComponentApiRow {
  name: string;
  kind: 'component' | 'helper' | 'provider' | 'primitive';
}

export interface ComponentApiReference {
  rows: ComponentApiRow[];
}

export interface ComponentDoc {
  id: PreviewKind;
  slug: string;
  name: string;
  category: ShowcaseCategory;
  importPath: string;
  exports: string[];
  customizationKeys: string[];
  status: 'live' | 'pattern';
  installation: {
    command: string;
    manualSteps: string[];
  };
  usage: string;
  examples: ComponentExample[];
  apiReference: ComponentApiReference;
  related: PreviewKind[];
}

const helperNamePatterns = [
  'ensure',
  'toast',
  'Variants',
  'resolver',
  'utils',
] as const;

export function getComponentSlug(id: PreviewKind) {
  return id;
}

export function getComponentById(id: PreviewKind) {
  return componentEntries.find((entry) => entry.id === id);
}

export function getCategoryEntries(category: ShowcaseCategory) {
  return componentEntries.filter((entry) => entry.category === category);
}

export function buildComponentDocsForCategory(category: ShowcaseCategory) {
  return getCategoryEntries(category).map((entry) => buildComponentDoc(entry));
}

export function getRelatedComponentIds(entry: ComponentEntry) {
  const sameCategory = componentEntries
    .filter((candidate) => candidate.category === entry.category)
    .filter((candidate) => candidate.id !== entry.id)
    .map((candidate) => candidate.id);

  if (sameCategory.length >= 3) return sameCategory.slice(0, 3);

  return [
    ...sameCategory,
    ...componentEntries
      .filter((candidate) => candidate.id !== entry.id)
      .filter((candidate) => !sameCategory.includes(candidate.id))
      .map((candidate) => candidate.id),
  ].slice(0, 3);
}

export function buildComponentDoc(entry: ComponentEntry): ComponentDoc {
  return {
    id: entry.id,
    slug: getComponentSlug(entry.id),
    name: entry.name,
    category: entry.category,
    importPath: entry.importPath,
    exports: entry.exports,
    customizationKeys: entry.customizationKeys,
    status: entry.safePreview === false ? 'pattern' : 'live',
    installation: {
      command: `bun add @tuturuuu/ui`,
      manualSteps: [
        `import '@tuturuuu/ui/globals.css';`,
        `import { ${entry.exports.join(', ')} } from '${entry.importPath}';`,
      ],
    },
    usage: entry.usage,
    examples: buildComponentExamples(entry),
    apiReference: {
      rows: entry.exports.map((name) => ({
        name,
        kind: classifyExport(name),
      })),
    },
    related: getRelatedComponentIds(entry),
  };
}

function buildComponentExamples(entry: ComponentEntry): ComponentExample[] {
  const examples: ComponentExample[] = [
    {
      id: `${entry.id}-default`,
      titleKey: 'default',
      descriptionKey: 'default',
      code: entry.usage,
      showPreview: entry.safePreview !== false,
    },
  ];

  if (entry.exports.length > 1) {
    examples.push({
      id: `${entry.id}-composition`,
      titleKey: 'composition',
      descriptionKey: 'composition',
      code: `import {\n  ${entry.exports.join(',\n  ')},\n} from '${entry.importPath}';`,
      showPreview: false,
    });
  }

  examples.push({
    id: `${entry.id}-imports`,
    titleKey: 'imports',
    descriptionKey: 'imports',
    code: `// Public package import\nimport { ${entry.exports[0]} } from '${entry.importPath}';\n\n// Workspace apps should keep importing through the package boundary.`,
    showPreview: false,
  });

  return examples;
}

function classifyExport(name: string): ComponentApiRow['kind'] {
  if (name.endsWith('Provider')) return 'provider';
  if (name.endsWith('Primitive')) return 'primitive';
  if (helperNamePatterns.some((pattern) => name.includes(pattern))) {
    return 'helper';
  }
  return 'component';
}

export const componentCategoryIds = categoryIds;
