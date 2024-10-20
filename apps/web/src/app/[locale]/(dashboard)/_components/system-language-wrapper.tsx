import { SystemLanguageDropdownItem } from './system-language-dropdown-item';

export function SystemLanguageWrapper({
  currentLocale,
}: {
  currentLocale: string | undefined;
}) {
  return <SystemLanguageDropdownItem selected={!currentLocale} />;
}
