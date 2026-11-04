import en from '../../messages/en.json';
import vi from '../../messages/vi.json';
import {
  type NativeSecurityKind,
  nativeSecurityPage,
} from '../native-security';
import { publicHead } from './public-head';

export function securityHead(kind: NativeSecurityKind, locale: 'en' | 'vi') {
  return publicHead(
    (locale === 'vi' ? vi : en)[kind].meta,
    nativeSecurityPage(kind).slug,
    locale
  );
}
