/** Parse only literal assignments written by setup; never evaluate shell code. */
export function readPersistedRunnerSetting(content: string, key: string) {
  const values = content
    .split(/\r?\n/u)
    .map((line) => line.trim().replace(/^export\s+/u, ''))
    .filter((line) => line.startsWith(`${key}=`))
    .map((line) => line.slice(key.length + 1));
  if (!values.length) return undefined;
  const invalid = () =>
    new Error(
      `Invalid or duplicate persisted setting ${key}; repair the literal assignment before continuing.`
    );
  if (values.length !== 1) throw invalid();
  const value = values[0]!;
  if (/^[a-zA-Z0-9_./:@+-]+$/u.test(value)) return value;
  if (/^"[^"$`\\]*"$/u.test(value)) return value.slice(1, -1);
  // shellQuote emits adjacent single-quoted fragments and escaped apostrophes.
  if (/^(?:'[^']*'|\\')+$/u.test(value))
    return value.replace(
      /'([^']*)'|\\'/gu,
      (_match, literal: string | undefined) => literal ?? "'"
    );
  throw invalid();
}
