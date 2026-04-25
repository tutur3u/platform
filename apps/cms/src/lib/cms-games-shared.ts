export function isCmsGamesConfigEnabled(value: string | null | undefined) {
  return value?.trim().toLowerCase() === 'true';
}
