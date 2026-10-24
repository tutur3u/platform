export function argumentValue(
  flag: string,
  argv: string[] = process.argv
): string | undefined {
  const index = argv.indexOf(flag);
  if (index < 0) return;
  const value = argv[index + 1];
  if (!value || value.startsWith('--'))
    throw new Error(`${flag} requires a value.`);
  return value;
}
