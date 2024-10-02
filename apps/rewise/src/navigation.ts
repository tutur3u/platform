import { localePrefix, locales, pathnames } from './config';
import { createLocalizedPathnamesNavigation } from 'next-intl/navigation';

const { Link, getPathname, redirect, usePathname, useRouter } =
  createLocalizedPathnamesNavigation({
    locales,
    pathnames,
    localePrefix,
  }) as any;
//?      ^ `as any` is needed here to avoid the TypeScript error: The inferred type of 'getConfig' cannot be named
//? without a reference to '../node_modules/next-intl/dist/types/src/server/react-server/getRequestConfig'. This is
//? likely not portable. A type annotation is necessary.

export { Link, getPathname, redirect, usePathname, useRouter };
