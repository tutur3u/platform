import { LanguageDropdownItem as SharedLanguageItem } from '@tuturuuu/ui/custom/language-dropdown-item';
import { SystemLanguageDropdownItem as SharedSystemItem } from '@tuturuuu/ui/custom/system-language-dropdown-item';
import { expect, it } from 'vitest';
import { LanguageDropdownItem } from './language-dropdown-item';
import { SystemLanguageDropdownItem } from './system-language-dropdown-item';

it('uses the shared language items, which reload under the chosen locale', () => {
  expect(LanguageDropdownItem).toBe(SharedLanguageItem);
  expect(SystemLanguageDropdownItem).toBe(SharedSystemItem);
});
