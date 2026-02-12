import Link from 'next/link';
import { Separator } from '../separator';
import { TuturuuLogo } from './tuturuuu-logo';

export function CommonFooter({ t, devMode }: { t: any; devMode: boolean }) {
  const TUTURUUU_URL = devMode
    ? 'http://localhost:7803'
    : 'https://tuturuuu.com';

  return (
    <div className="w-full text-center">
      {/* {pathname.startsWith('/contact') || (
            <>
              <Separator className="bg-foreground/5 mb-8" />
              <div className="flex flex-col items-center">
                <Slogan />
              </div>
            </>
          )} */}

      <Separator className="my-8 bg-foreground/5" />

      <div className="flex flex-col flex-wrap items-center justify-between gap-4 px-4 md:gap-8 md:px-32 lg:flex-row lg:gap-16 xl:px-64">
        <div className="flex flex-col items-center justify-center gap-4">
          <Link
            href={TUTURUUU_URL}
            className="flex items-center gap-4 transition"
            aria-label="Tuturuuu"
          >
            <TuturuuLogo
              width={64}
              height={64}
              alt="logo"
              className="h-12 w-12"
            />
            <div className="font-semibold text-4xl">Tuturuuu</div>
          </Link>

          <div className="flex gap-8">
            <Link
              target="_blank"
              href="https://www.facebook.com/tuturuuu"
              className="fill-foreground/50 transition duration-300 hover:fill-foreground"
              aria-label="Facebook"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 512 512"
                className="w-6"
              >
                <title>Facebook</title>
                <path d="M504 256C504 119 393 8 256 8S8 119 8 256c0 123.78 90.69 226.38 209.25 245V327.69h-63V256h63v-54.64c0-62.15 37-96.48 93.67-96.48 27.14 0 55.52 4.84 55.52 4.84v61h-31.28c-30.8 0-40.41 19.12-40.41 38.73V256h68.78l-11 71.69h-57.78V501C413.31 482.38 504 379.78 504 256z" />
              </svg>
            </Link>

            <Link
              target="_blank"
              href="https://www.instagram.com/tutu.ruuu/"
              className="fill-foreground/50 transition duration-300 hover:fill-foreground"
              aria-label="Instagram"
            >
              <svg
                viewBox="0 0 32 32"
                xmlns="http://www.w3.org/2000/svg"
                className="w-6 scale-150"
              >
                <title>Instagram</title>
                <path d="M20.445 5h-8.891A6.559 6.559 0 0 0 5 11.554v8.891A6.559 6.559 0 0 0 11.554 27h8.891a6.56 6.56 0 0 0 6.554-6.555v-8.891A6.557 6.557 0 0 0 20.445 5zm4.342 15.445a4.343 4.343 0 0 1-4.342 4.342h-8.891a4.341 4.341 0 0 1-4.341-4.342v-8.891a4.34 4.34 0 0 1 4.341-4.341h8.891a4.342 4.342 0 0 1 4.341 4.341l.001 8.891z" />
                <path d="M16 10.312c-3.138 0-5.688 2.551-5.688 5.688s2.551 5.688 5.688 5.688 5.688-2.551 5.688-5.688-2.55-5.688-5.688-5.688zm0 9.163a3.475 3.475 0 1 1-.001-6.95 3.475 3.475 0 0 1 .001 6.95zM21.7 8.991a1.363 1.363 0 1 1-1.364 1.364c0-.752.51-1.364 1.364-1.364z" />
              </svg>
            </Link>

            <Link
              target="_blank"
              href="https://x.com/tutur3u"
              className="fill-foreground/50 transition duration-300 hover:fill-foreground"
              aria-label="X (formerly Twitter)"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 42 42"
                className="w-6"
              >
                <title>X (formerly Twitter)</title>
                <polygon points="41,6 9.929,42 6.215,42 37.287,6" />
                <polygon
                  className="fill-background"
                  fillRule="evenodd"
                  points="31.143,41 7.82,7 16.777,7 40.1,41"
                  clipRule="evenodd"
                />
                <path d="M15.724,9l20.578,30h-4.106L11.618,9H15.724 M17.304,6H5.922l24.694,36h11.382L17.304,6L17.304,6z" />
              </svg>
            </Link>

            <Link
              target="_blank"
              href="https://github.com/tutur3u"
              className="fill-foreground/50 transition duration-300 hover:fill-foreground"
              aria-label="Github"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 512 512"
                className="w-6"
              >
                <title>GitHub</title>
                <path d="M165.9 397.4c0 2-2.3 3.6-5.2 3.6-3.3.3-5.6-1.3-5.6-3.6 0-2 2.3-3.6 5.2-3.6 3-.3 5.6 1.3 5.6 3.6zm-31.1-4.5c-.7 2 1.3 4.3 4.3 4.9 2.6 1 5.6 0 6.2-2s-1.3-4.3-4.3-5.2c-2.6-.7-5.5.3-6.2 2.3zm44.2-1.7c-2.9.7-4.9 2.6-4.6 4.9.3 2 2.9 3.3 5.9 2.6 2.9-.7 4.9-2.6 4.6-4.6-.3-1.9-3-3.2-5.9-2.9zM244.8 8C106.1 8 0 113.3 0 252c0 110.9 69.8 205.8 169.5 239.2 12.8 2.3 17.3-5.6 17.3-12.1 0-6.2-.3-40.4-.3-61.4 0 0-70 15-84.7-29.8 0 0-11.4-29.1-27.8-36.6 0 0-22.9-15.7 1.6-15.4 0 0 24.9 2 38.6 25.8 21.9 38.6 58.6 27.5 72.9 20.9 2.3-16 8.8-27.1 16-33.7-55.9-6.2-112.3-14.3-112.3-110.5 0-27.5 7.6-41.3 23.6-58.9-2.6-6.5-11.1-33.3 2.6-67.9 20.9-6.5 69 27 69 27 20-5.6 41.5-8.5 62.8-8.5s42.8 2.9 62.8 8.5c0 0 48.1-33.6 69-27 13.7 34.7 5.2 61.4 2.6 67.9 16 17.7 25.8 31.5 25.8 58.9 0 96.5-58.9 104.2-114.8 110.5 9.2 7.9 17 22.9 17 46.4 0 33.7-.3 75.4-.3 83.6 0 6.5 4.6 14.4 17.3 12.1C428.2 457.8 496 362.9 496 252 496 113.3 383.5 8 244.8 8zM97.2 352.9c-1.3 1-1 3.3.7 5.2 1.6 1.6 3.9 2.3 5.2 1 1.3-1 1-3.3-.7-5.2-1.6-1.6-3.9-2.3-5.2-1zm-10.8-8.1c-.7 1.3.3 2.9 2.3 3.9 1.6 1 3.6.7 4.3-.7.7-1.3-.3-2.9-2.3-3.9-2-.6-3.6-.3-4.3.7zm32.4 35.6c-1.6 1.3-1 4.3 1.3 6.2 2.3 2.3 5.2 2.6 6.5 1 1.3-1.3.7-4.3-1.3-6.2-2.2-2.3-5.2-2.6-6.5-1zm-11.4-14.7c-1.6 1-1.6 3.6 0 5.9 1.6 2.3 4.3 3.3 5.6 2.3 1.6-1.3 1.6-3.9 0-6.2-1.4-2.3-4-3.3-5.6-2z" />
              </svg>
            </Link>

            <Link
              target="_blank"
              href="https://www.linkedin.com/company/tuturuuu/"
              className="fill-foreground/50 transition duration-300 hover:fill-foreground"
              aria-label="LinkedIn"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 512 512"
                className="w-6"
              >
                <title>LinkedIn</title>
                <path d="M416 32H31.9C14.3 32 0 46.5 0 64.3v383.4C0 465.5 14.3 480 31.9 480H416c17.6 0 32-14.5 32-32.3V64.3c0-17.8-14.4-32.3-32-32.3zM135.4 416H69V202.2h66.5V416zm-33.2-243c-21.3 0-38.5-17.3-38.5-38.5S80.9 96 102.2 96c21.2 0 38.5 17.3 38.5 38.5 0 21.3-17.2 38.5-38.5 38.5zm282.1 243h-66.4V312c0-24.8-.5-56.7-34.5-56.7-34.6 0-39.9 27-39.9 54.9V416h-66.4V202.2h63.7v29.2h.9c8.9-16.8 30.6-34.5 62.9-34.5 67.2 0 79.7 44.3 79.7 101.9V416z" />
              </svg>
            </Link>
          </div>
        </div>

        <div className="flex flex-none flex-col flex-wrap items-center gap-4 md:flex-row md:items-start md:gap-16 lg:gap-32">
          <div className="grid gap-1 md:items-start">
            <div className="mb-2 font-bold text-lg md:w-fit md:text-xl">
              {t('common.resources')}
            </div>
            <Link
              href={`${TUTURUUU_URL}/blog`}
              className="text-foreground/80 text-sm hover:text-foreground hover:underline md:w-fit"
            >
              {t('common.blog')}
            </Link>
            <Link
              href={`${TUTURUUU_URL}/meet-together`}
              className="text-foreground/80 text-sm hover:text-foreground hover:underline md:w-fit"
            >
              {t('common.meet-together')}
            </Link>
            <Link
              href={`${TUTURUUU_URL}/qr-generator`}
              className="text-foreground/80 text-sm hover:text-foreground hover:underline md:w-fit"
            >
              {t('common.qr_generator')}
            </Link>
            <Link
              href={`${TUTURUUU_URL}/branding`}
              className="text-foreground/80 text-sm hover:text-foreground hover:underline md:w-fit"
            >
              {t('common.branding')}
            </Link>
          </div>

          <div className="grid gap-1 md:items-start">
            <div className="mb-2 font-bold text-lg md:w-fit md:text-xl">
              {t('common.company')}
            </div>
            <Link
              href={`${TUTURUUU_URL}/about`}
              className="text-foreground/80 text-sm hover:text-foreground hover:underline md:w-fit"
            >
              {t('common.about')}
            </Link>
            <Link
              href={`${TUTURUUU_URL}/partners`}
              className="text-foreground/80 text-sm hover:text-foreground hover:underline md:w-fit"
            >
              {t('common.partners')}
            </Link>
            <Link
              href={`${TUTURUUU_URL}/contact`}
              className="text-foreground/80 text-sm hover:text-foreground hover:underline md:w-fit"
            >
              {t('common.contact')}
            </Link>
            <Link
              href={`${TUTURUUU_URL}/pricing`}
              className="text-foreground/80 text-sm hover:text-foreground hover:underline md:w-fit"
            >
              {t('common.pricing')}
            </Link>
          </div>

          <div className="grid gap-1 md:items-start">
            <div className="mb-2 font-bold text-lg md:w-fit md:text-xl">
              {t('common.legal')}
            </div>
            <Link
              href={`${TUTURUUU_URL}/security`}
              className="text-foreground/80 text-sm hover:text-foreground hover:underline md:w-fit"
            >
              {t('common.security')}
            </Link>
            <Link
              href={`${TUTURUUU_URL}/terms`}
              className="text-foreground/80 text-sm hover:text-foreground hover:underline md:w-fit"
            >
              {t('common.terms')}
            </Link>
            <Link
              href={`${TUTURUUU_URL}/privacy`}
              className="text-foreground/80 text-sm hover:text-foreground hover:underline md:w-fit"
            >
              {t('common.privacy')}
            </Link>
            <Link
              href={`${TUTURUUU_URL}/community-guidelines`}
              className="text-foreground/80 text-sm hover:text-foreground hover:underline md:w-fit"
            >
              {t('common.community-guidelines')}
            </Link>
            <Link
              href={`${TUTURUUU_URL}/acceptable-use`}
              className="text-foreground/80 text-sm hover:text-foreground hover:underline md:w-fit"
            >
              {t('common.acceptable-use')}
            </Link>
          </div>

          <div className="grid gap-1 md:items-start">
            <div className="mb-2 font-bold text-lg md:w-fit md:text-xl">
              {t('common.developers')}
            </div>
            <Link
              href="https://docs.tuturuuu.com"
              target="_blank"
              className="text-foreground/80 text-sm hover:text-foreground hover:underline md:w-fit"
            >
              {t('common.documentation')}
            </Link>
            <Link
              href="https://github.com/tutur3u/platform"
              target="_blank"
              className="text-foreground/80 text-sm hover:text-foreground hover:underline md:w-fit"
            >
              {t('common.open-source')}
            </Link>
          </div>
        </div>
      </div>

      <Separator className="mt-8 bg-foreground/5" />
      <div className="text-balance p-4 text-center text-sm opacity-80 md:px-32 xl:px-64">
        {t('common.copyright')}
      </div>
    </div>
  );
}
