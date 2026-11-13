import { useTranslations } from 'next-intl';

/**
 * The about page reads a deep, largely data-driven key tree (`coreBeliefs.*`,
 * `timeline.*`, `techStack.*`), so most lookups are composed at render time and
 * cannot be checked against the message tree statically. Parity between the
 * English and Vietnamese bundles is enforced by the repo's i18n gates instead.
 */
export type AboutTranslator = (key: string) => string;

export function useAboutTranslations(): AboutTranslator {
  return useTranslations('about') as unknown as AboutTranslator;
}
