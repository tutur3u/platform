import en from '../../messages/en.json';
import vi from '../../messages/vi.json';
import { type NativeLegalKind, nativeLegalPage } from '../native-legal';
import { publicHead } from './public-head';

export function legalHead(kind: NativeLegalKind, locale: 'en' | 'vi') {
  const page = nativeLegalPage(kind);
  const copy = (locale === 'vi' ? vi : en).marketingSeo[page.seoKey];
  return publicHead(copy, page.slug, locale);
}
