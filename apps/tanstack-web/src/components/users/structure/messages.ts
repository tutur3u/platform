import type { AppMessages } from '../../../lib/platform/messages';

export type OrganizationalStructureMessages =
  AppMessages['organizational_structure'];

export function createStructureTranslator(
  messages: OrganizationalStructureMessages
) {
  return (key: keyof OrganizationalStructureMessages) => messages[key];
}
