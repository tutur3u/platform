import { MAX_DISPLAY_NAME_LENGTH } from '@tuturuuu/utils/constants';

/** Match the profile API's UTF-16 limit without cutting a code point in half. */
export function prepareParticipantName(value: string): string {
  let name = '';
  for (const character of value.trim()) {
    if (name.length + character.length > MAX_DISPLAY_NAME_LENGTH) break;
    name += character;
  }
  return name;
}
