export function parseDurationSeconds(value: string | undefined) {
  if (!value) return undefined;
  const match = value.trim().match(/^(\d+)([smh])?$/iu);
  if (!match) {
    throw new Error(`Invalid duration: ${value}`);
  }

  const amount = Number.parseInt(match[1]!, 10);
  const unit = match[2]?.toLowerCase() ?? 's';
  if (unit === 'h') return amount * 3600;
  if (unit === 'm') return amount * 60;
  return amount;
}
