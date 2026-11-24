import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vite-plus/test';

// Every named export of the Worker module is a runtime class: an entry
// point or a Durable Object. A new export is a new callable surface.
const source = readFileSync(new URL('./worker.ts', import.meta.url), 'utf8');

describe('auth Worker exports', () => {
  it('exports only ControlEntry and the two control objects', () => {
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
      'SessionBudget',
      'SessionControl',
    ]);
  });

  it('gives ControlEntry only the designed methods', () => {
    const body = source.slice(source.indexOf('export class ControlEntry'));
    const methods = [...body.matchAll(/^ {2}(\w+)\(/gmu)].map(
      (match) => match[1]
    );
    expect(methods).toEqual([
      'readFence',
      'setFence',
      'parkBackground',
      'resumeBackground',
    ]);
  });
});
