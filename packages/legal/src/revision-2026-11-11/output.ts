import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

export async function emitRevisionSources({
  sources,
  directory,
  check,
  formatSource,
}: {
  sources: ReadonlyMap<string, string>;
  directory: URL;
  check: boolean;
  formatSource: (
    name: string,
    source: string
  ) => Promise<{ code: string; errors: readonly unknown[] }>;
}) {
  const formatted = await Promise.all(
    [...sources].map(async ([name, source]) => {
      const result = await formatSource(name, source);
      if (result.errors.length)
        throw new Error(
          `Cannot format ${name}: ${JSON.stringify(result.errors)}`
        );
      return { name, code: result.code };
    })
  );
  if (check) {
    for (const { name, code } of formatted) {
      if (readFileSync(new URL(name, directory), 'utf8') !== code)
        throw new Error(`Generated legal source is stale: ${name}`);
    }
  } else {
    mkdirSync(directory, { recursive: true });
    for (const { name, code } of formatted)
      writeFileSync(new URL(name, directory), code);
  }
}
