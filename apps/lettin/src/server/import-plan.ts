import { markdownToJSON } from '@tuturuuu/editor';
import type {
  LettinDraft,
  LettinNode,
  LettinRelationshipKind,
} from '@tuturuuu/internal-api/lettin';
import { exocorpseWikiCollections } from '@tuturuuu/internal-api/lettin';
import { LettinError } from './context';
import { type ImportSourceEntry, parseExocorpseExport } from './import-schema';
import { safeImage, safeLink } from './rich-text-schema';
import { lettinDraftSchema } from './schema';
export type ImportPlan = {
  source?: 'cms' | 'file' | 'notebook';
  provenance?: {
    worldId: string;
    scope: 'published' | 'draft';
    exportedAt: string;
  };
  world: LettinDraft;
  entries: { id: string; sourceId: string; draft: LettinDraft }[];
  blacklist: {
    id: string;
    sourceId: string;
    displayName: string;
    reason: string;
    referenceUrl: string;
  }[];
  skipped: number;
};
const kinds: Record<string, LettinDraft['kind']> = {
  stories: 'story',
  worlds: 'world',
  characters: 'character',
  locations: 'location',
  factions: 'organization',
  events: 'event',
  roles: 'role',
  timelines: 'lore',
  'event-types': 'role',
  'outfit-types': 'role',
  'relationship-types': 'role',
};
const relations: Record<string, LettinRelationshipKind> = {
  world: 'part',
  worlds: 'part',
  story: 'appears',
  character: 'appears',
  'character-a': 'related',
  'character-b': 'related',
  faction: 'member',
  location: 'located',
  parent: 'part',
  role: 'role',
};
function text(value: unknown) {
  return typeof value === 'string'
    ? value
    : typeof value === 'number' || typeof value === 'boolean'
      ? String(value)
      : Array.isArray(value)
        ? value.filter((v) => typeof v === 'string').join(', ')
        : '';
}
function richNode(node: ReturnType<typeof markdownToJSON>): LettinNode {
  const mapped = {
    collapsible: 'details',
    collapsibleSummary: 'detailsSummary',
    collapsibleContent: 'detailsContent',
  };
  const type =
    mapped[node.type as keyof typeof mapped] ?? node.type ?? 'paragraph';
  if (type === 'image' && !safeImage(String(node.attrs?.src ?? '')))
    return {
      type: 'paragraph',
      content: [{ type: 'text', text: String(node.attrs?.alt ?? '') }],
    };
  return {
    ...node,
    type,
    marks: node.marks?.filter(
      (mark) =>
        mark.type !== 'link' ||
        (typeof mark.attrs?.href === 'string' && safeLink(mark.attrs.href))
    ),
    content: node.content?.map(richNode),
  };
}
function makeDraft(source: ImportSourceEntry): LettinDraft {
  const markdown = [
    source.bodyMarkdown,
    ...(source.blocks ?? [])
      .filter((b) => b.blockType === 'markdown')
      .map((b) =>
        [
          b.title ? `## ${b.title}` : '',
          text(b.content.markdown ?? b.content.body ?? b.content.text),
        ]
          .filter(Boolean)
          .join('\n\n')
      ),
  ]
    .filter(Boolean)
    .join('\n\n');
  const profile = source.profileData ?? {};
  const images = (source.assets ?? []).filter(
    (asset) =>
      ['image', 'inline-image', 'gallery-image'].includes(asset.assetType) &&
      !!asset.sourceUrl &&
      safeImage(asset.sourceUrl)
  );
  const content = richNode(markdownToJSON(markdown));
  const gallery = images.slice(1, 30).map((image) => ({
    type: 'image',
    attrs: { src: image.sourceUrl, alt: image.altText ?? '' },
  }));
  if (gallery.length)
    content.content = [...(content.content ?? []), ...gallery];
  return lettinDraftSchema.parse({
    title: source.title,
    description: source.summary ?? '',
    image: images[0]?.sourceUrl ?? '',
    credit: 'Imported from Exocorpse',
    kind: kinds[source.collectionSlug] ?? 'page',
    tags: ['exocorpse'],
    links: [],
    content,
    wiki: {
      aliases: [text(profile.nickname)]
        .filter(Boolean)
        .map((alias) => alias.slice(0, 100)),
      facts: Object.entries(profile)
        .filter(([, v]) => text(v))
        .slice(0, 39)
        .map(([key, value]) => ({
          label: key.slice(0, 80),
          value: text(value).slice(0, 1000),
        })),
      relationships: [],
      ...(source.collectionSlug === 'events' &&
      Number.isFinite(Number(profile.dateYear)) &&
      profile.dateYear != null
        ? {
            chronology: {
              order: Number(profile.dateYear),
              label: text(profile.date || profile.dateYear).slice(0, 100),
              era: text(profile.eraName).slice(0, 100),
            },
          }
        : {}),
    },
  });
}
export function buildImportPlan(payload: unknown, title: string): ImportPlan {
  let sources: ImportSourceEntry[];
  try {
    sources = parseExocorpseExport(payload);
  } catch {
    throw new LettinError(400, 'Invalid Exocorpse export');
  }
  const allowed = sources.filter((source) =>
    exocorpseWikiCollections.includes(source.collectionSlug)
  );
  const content = allowed.filter(
    (source) => source.collectionSlug !== 'commission-blacklist'
  );
  const identities = sources.map(
    (source) => source.stableSourceId ?? source.id
  );
  if (
    identities.some((id) => !id) ||
    new Set(identities).size !== identities.length
  )
    throw new LettinError(400, 'Source IDs must be unique');
  const idMap = new Map<string, string>();
  const entries = content.map((source) => {
    const id = crypto.randomUUID();
    for (const key of [source.id, source.stableSourceId])
      if (key) idMap.set(key, id);
    try {
      return {
        id,
        sourceId: source.stableSourceId ?? source.id!,
        draft: makeDraft(source),
      };
    } catch {
      throw new LettinError(400, 'Source content exceeds supported limits');
    }
  });
  content.forEach((source, index) => {
    const seen = new Set<string>();
    entries[index]!.draft.wiki!.relationships = (
      source.relations ?? []
    ).flatMap((relation) => {
      const targetId = idMap.get(
        relation.targetStableSourceId ?? relation.targetEntryId ?? ''
      );
      const kind = relations[relation.definitionKey] ?? 'related';
      if (
        !targetId ||
        targetId === entries[index]!.id ||
        seen.has(`${targetId}:${kind}`)
      )
        return [];
      seen.add(`${targetId}:${kind}`);
      return [
        {
          targetId,
          kind,
          label: text(relation.metadata?.label ?? relation.definitionKey).slice(
            0,
            160
          ),
        },
      ];
    });
  });
  const blacklist = allowed
    .filter((source) => source.collectionSlug === 'commission-blacklist')
    .map((source) => ({
      id: crypto.randomUUID(),
      sourceId: source.stableSourceId ?? source.id!,
      displayName: (text(source.profileData?.username) || source.title).slice(
        0,
        160
      ),
      reason: (
        source.summary ||
        text(source.profileData?.reasoning ?? source.profileData?.reason)
      ).slice(0, 4000),
      referenceUrl: (() => {
        const url = text(source.profileData?.url ?? source.profileData?.link);
        return url.length <= 2000 && url.startsWith('https://') && safeLink(url)
          ? url
          : '';
      })(),
    }));
  if (!entries.length && !blacklist.length)
    throw new LettinError(400, 'No supported Exocorpse content');
  return {
    world: lettinDraftSchema.parse({
      title,
      description: 'Imported Exocorpse collection',
      image: '',
      credit: 'Exocorpse',
      kind: 'world',
      tags: ['exocorpse'],
      links: [],
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
    }),
    entries,
    blacklist,
    skipped: sources.length - allowed.length,
  };
}
