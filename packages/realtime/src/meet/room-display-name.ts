export function lobbyDisplayName(value: string): string {
  const clean = value.replace(/[\p{Cc}\p{Cf}]/gu, '').trim();
  const suffix = ' (guest)';
  let name = '';
  for (const character of clean || 'Participant') {
    if (name.length + character.length + suffix.length > 120) break;
    name += character;
  }
  return name + suffix;
}
