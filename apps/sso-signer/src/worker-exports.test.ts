import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vite-plus/test';

// Every named export of the Worker module is a runtime class: an entry
// point or a Durable Object. A new export is a new callable surface.
const source = readFileSync(new URL('./worker.ts', import.meta.url), 'utf8');

describe('signer Worker exports', () => {
  it('exports only the two entries and the three objects', () => {
    const named = [
      ...source.matchAll(/^export (?:class|const|function|let) (\w+)/gmu),
    ].map((match) => match[1]);
    const reexports = [
      ...source.matchAll(/^export \{([^}]+)\} from/gmu),
    ].flatMap((match) =>
      (match[1] ?? '').split(',').map((name) => name.trim())
    );
    expect([...named, ...reexports].sort()).toEqual([
      'ControlEntry',
      'SignerBudget',
      'SignerControl',
      'SignerEntry',
      'SignerReplay',
    ]);
  });

  it('gives each entry only the designed methods', () => {
    const methods = (name: string) => {
      const start = source.indexOf(`export class ${name}`);
      const body = source.slice(start, source.indexOf('\n}\n', start));
      return [...body.matchAll(/^ {2}(?:async )?(\w+)\(/gmu)].map((m) => m[1]);
    };
    expect(methods('SignerEntry')).toEqual(['fetch']);
    expect(methods('ControlEntry')).toEqual(['readFence', 'setFence']);
  });
});
