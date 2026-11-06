export function isEducationEnabled(value: string | null | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}
