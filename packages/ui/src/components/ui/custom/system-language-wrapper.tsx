import { SystemLanguageDropdownItem } from './system-language-dropdown-item';

interface Props {
  currentLocale: string | undefined;
  onResetLocale?: () => Promise<void> | void;
}

export function SystemLanguageWrapper({ currentLocale, onResetLocale }: Props) {
  return (
    <SystemLanguageDropdownItem
      selected={!currentLocale}
      onResetLocale={onResetLocale}
    />
  );
}
