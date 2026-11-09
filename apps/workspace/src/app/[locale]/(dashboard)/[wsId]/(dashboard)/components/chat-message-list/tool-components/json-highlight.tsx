import type { ReactNode } from 'react';

type JsonToken =
  | { t: 'key'; v: string }
  | { t: 'string'; v: string }
  | { t: 'number'; v: string }
  | { t: 'keyword'; v: string }
  | { t: 'punct'; v: string }
  | { t: 'plain'; v: string };

function tokenizeJson(line: string): JsonToken[] {
  const tokens: JsonToken[] = [];
  let i = 0;
  const n = line.length;
  const skipWs = () => {
    const start = i;
    while (i < n && /[\s]/.test(line[i]!)) i++;
    if (i > start) tokens.push({ t: 'plain', v: line.slice(start, i) });
  };
  while (i < n) {
    skipWs();
    if (i >= n) break;
    const c = line[i];
    if (c === '"') {
      const start = i;
      i++;
      while (i < n) {
        if (line[i] === '\\') i += 2;
        else if (line[i] === '"') {
          i++;
          break;
        } else i++;
      }
      const value = line.slice(start, i);
      const rest = line.slice(i);
      const isKey = /^\s*:/.test(rest);
      tokens.push(isKey ? { t: 'key', v: value } : { t: 'string', v: value });
      continue;
    }
    if (/[{}[\],:]/.test(c!)) {
      tokens.push({ t: 'punct', v: c! });
      i++;
      continue;
    }
    const numMatch = line.slice(i).match(/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (numMatch) {
      tokens.push({ t: 'number', v: numMatch[0]! });
      i += numMatch[0]!.length;
      continue;
    }
    if (line.slice(i).startsWith('true')) {
      tokens.push({ t: 'keyword', v: 'true' });
      i += 4;
      continue;
    }
    if (line.slice(i).startsWith('false')) {
      tokens.push({ t: 'keyword', v: 'false' });
      i += 5;
      continue;
    }
    if (line.slice(i).startsWith('null')) {
      tokens.push({ t: 'keyword', v: 'null' });
      i += 4;
      continue;
    }
    tokens.push({ t: 'plain', v: line[i]! });
    i++;
  }
  return tokens;
}

export function JsonHighlight({
  text,
  isError,
}: {
  text: string;
  isError?: boolean;
}): ReactNode {
  const trimmed = text.trim();
  const looksLikeJson = trimmed.startsWith('{') || trimmed.startsWith('[');
  if (isError || !looksLikeJson) {
    return (
      <span className="wrap-break-word whitespace-pre-wrap text-muted-foreground">
        {text}
      </span>
    );
  }
  const lines = text.split('\n');
  return (
    <>
      {lines.map((line, idx) => (
        <span key={idx} className="block">
          {tokenizeJson(line).map((tok, i) => {
            const key = `${idx}-${i}`;
            if (tok.t === 'plain') return <span key={key}>{tok.v}</span>;
            if (tok.t === 'key')
              return (
                <span key={key} className="text-dynamic-blue">
                  {tok.v}
                </span>
              );
            if (tok.t === 'string')
              return (
                <span key={key} className="text-dynamic-green">
                  {tok.v}
                </span>
              );
            if (tok.t === 'number')
              return (
                <span key={key} className="text-dynamic-orange">
                  {tok.v}
                </span>
              );
            if (tok.t === 'keyword')
              return (
                <span key={key} className="text-dynamic-purple">
                  {tok.v}
                </span>
              );
            return (
              <span key={key} className="text-muted-foreground">
                {tok.v}
              </span>
            );
          })}
          {idx < lines.length - 1 ? '\n' : null}
        </span>
      ))}
    </>
  );
}
