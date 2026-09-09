export type MeetCitationSource = {
  id?: string;
  sourceType: 'url';
  url: string;
  title?: string;
};

/** Resolve only exact provider IDs. Never infer a source for an unknown reference. */
export function resolveMeetCitations(
  text: string,
  sources: MeetCitationSource[]
) {
  const byId = new Map(
    sources.filter((source) => source.id).map((source) => [source.id, source])
  );
  const urls = [...new Set(sources.map((source) => source.url))];
  // Preserve code examples verbatim.
  return text
    .split(/(```[\s\S]*?```|`[^`\n]*`)/g)
    .map((part, index) => {
      if (index % 2) return part;
      return part.replace(
        /\[([A-Za-z0-9_-]+)\](?!\()/g,
        (original, id: string) => {
          const source = byId.get(id);
          if (!source) return original;
          try {
            if (!['http:', 'https:'].includes(new URL(source.url).protocol))
              return original;
          } catch {
            return original;
          }
          return `[${urls.indexOf(source.url) + 1}](<${source.url.replace(/[<>\s]/g, encodeURIComponent)}>)`;
        }
      );
    })
    .join('');
}
