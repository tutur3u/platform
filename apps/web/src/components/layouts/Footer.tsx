"use client"

import { ActionIcon, Divider } from '@mantine/core';
import useTranslation from 'next-translate/useTranslation';
import Image from 'next/image';
import Link from 'next/link';
import LanguageSelector from '../selectors/LanguageSelector';
import { MoonIcon, SunIcon } from '@heroicons/react/24/solid';
import { useAppearance } from '../../hooks/useAppearance';

interface FooterProps {
  hideSlogan?: boolean;
}

const Footer = ({ hideSlogan = false }: FooterProps) => {
  const { t } = useTranslation();
  const { theme, changeTheme } = useAppearance();

  const maximize = t('common:maximize');
  const productivity = t('common:productivity');
  const minimize = t('common:minimize');
  const stress = t('common:stress');

  const getStarted = t('common:get-started');
  const getStartedDesc = t('common:get-started-desc');

  const copyright = t('common:copyright');

  return (
    <div className="w-full text-center">
      <Divider className="mb-8 border-zinc-500/30 dark:border-zinc-500/10" />

      {hideSlogan || (
        <>
          <div className="flex flex-col items-center p-8">
            <div className="text-2xl font-semibold text-zinc-500 md:text-4xl">
              <span className="text-green-500 dark:text-green-300">
                {maximize}
              </span>{' '}
              <span className="text-blue-500 dark:text-blue-300">
                {productivity}
              </span>
              ,{' '}
              <span className="text-orange-500 dark:text-orange-300">
                {minimize}
              </span>{' '}
              <span className="text-red-500 dark:text-red-300">{stress}</span>.
            </div>

            <div className="mt-2 text-zinc-700 dark:text-zinc-300 md:text-xl">
              {getStartedDesc}
            </div>

            <Link
              href="/signup"
              className="mt-4 block w-full max-w-xs rounded border border-blue-500/10 bg-blue-500/10 px-8 py-2 font-semibold text-blue-600 transition duration-300 hover:bg-blue-500/20 dark:border-blue-300/20 dark:bg-blue-300/10 dark:text-blue-300 dark:hover:bg-blue-300/30"
            >
              {getStarted}
            </Link>
          </div>

          <Divider className="my-8 w-full border-zinc-500/20 dark:border-zinc-300/10" />
        </>
      )}

      <div className="flex flex-col items-center justify-between gap-4 px-4 md:gap-8 md:px-32 lg:flex-row lg:gap-16 xl:px-64">
        <div className="flex flex-col items-center justify-center gap-4">
          <Link
            href="/"
            className="flex gap-2 transition dark:hover:text-blue-200"
          >
            <Image
              src="/media/logos/transparent.png"
              width={320}
              height={320}
              alt="logo"
              className="w-12"
            />
            <div className="text-4xl font-semibold">Tuturuuu</div>
          </Link>

          <div className="flex gap-8">
            <Link
              href="https://www.facebook.com/Tuturuuu"
              className="fill-zinc-700/50 transition duration-300 hover:fill-zinc-700 dark:fill-zinc-200/40 dark:hover:fill-zinc-200"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 512 512"
                className="w-6"
              >
                <path d="M504 256C504 119 393 8 256 8S8 119 8 256c0 123.78 90.69 226.38 209.25 245V327.69h-63V256h63v-54.64c0-62.15 37-96.48 93.67-96.48 27.14 0 55.52 4.84 55.52 4.84v61h-31.28c-30.8 0-40.41 19.12-40.41 38.73V256h68.78l-11 71.69h-57.78V501C413.31 482.38 504 379.78 504 256z" />
              </svg>
            </Link>

            <Link
              href="https://twitter.com/tutur3u"
              className="fill-zinc-700/50 transition duration-300 hover:fill-zinc-700 dark:fill-zinc-200/40 dark:hover:fill-zinc-200"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 512 512"
                className="w-6"
              >
                <path d="M459.37 151.716c.325 4.548.325 9.097.325 13.645 0 138.72-105.583 298.558-298.558 298.558-59.452 0-114.68-17.219-161.137-47.106 8.447.974 16.568 1.299 25.34 1.299 49.055 0 94.213-16.568 130.274-44.832-46.132-.975-84.792-31.188-98.112-72.772 6.498.974 12.995 1.624 19.818 1.624 9.421 0 18.843-1.3 27.614-3.573-48.081-9.747-84.143-51.98-84.143-102.985v-1.299c13.969 7.797 30.214 12.67 47.431 13.319-28.264-18.843-46.781-51.005-46.781-87.391 0-19.492 5.197-37.36 14.294-52.954 51.655 63.675 129.3 105.258 216.365 109.807-1.624-7.797-2.599-15.918-2.599-24.04 0-57.828 46.782-104.934 104.934-104.934 30.213 0 57.502 12.67 76.67 33.137 23.715-4.548 46.456-13.32 66.599-25.34-7.798 24.366-24.366 44.833-46.132 57.827 21.117-2.273 41.584-8.122 60.426-16.243-14.292 20.791-32.161 39.308-52.628 54.253z" />
              </svg>
            </Link>

            <Link
              href="https://github.com/Tutur3u"
              className="fill-zinc-700/50 transition duration-300 hover:fill-zinc-700 dark:fill-zinc-200/40 dark:hover:fill-zinc-200"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 496 512"
                className="w-6"
              >
                <path d="M165.9 397.4c0 2-2.3 3.6-5.2 3.6-3.3.3-5.6-1.3-5.6-3.6 0-2 2.3-3.6 5.2-3.6 3-.3 5.6 1.3 5.6 3.6zm-31.1-4.5c-.7 2 1.3 4.3 4.3 4.9 2.6 1 5.6 0 6.2-2s-1.3-4.3-4.3-5.2c-2.6-.7-5.5.3-6.2 2.3zm44.2-1.7c-2.9.7-4.9 2.6-4.6 4.9.3 2 2.9 3.3 5.9 2.6 2.9-.7 4.9-2.6 4.6-4.6-.3-1.9-3-3.2-5.9-2.9zM244.8 8C106.1 8 0 113.3 0 252c0 110.9 69.8 205.8 169.5 239.2 12.8 2.3 17.3-5.6 17.3-12.1 0-6.2-.3-40.4-.3-61.4 0 0-70 15-84.7-29.8 0 0-11.4-29.1-27.8-36.6 0 0-22.9-15.7 1.6-15.4 0 0 24.9 2 38.6 25.8 21.9 38.6 58.6 27.5 72.9 20.9 2.3-16 8.8-27.1 16-33.7-55.9-6.2-112.3-14.3-112.3-110.5 0-27.5 7.6-41.3 23.6-58.9-2.6-6.5-11.1-33.3 2.6-67.9 20.9-6.5 69 27 69 27 20-5.6 41.5-8.5 62.8-8.5s42.8 2.9 62.8 8.5c0 0 48.1-33.6 69-27 13.7 34.7 5.2 61.4 2.6 67.9 16 17.7 25.8 31.5 25.8 58.9 0 96.5-58.9 104.2-114.8 110.5 9.2 7.9 17 22.9 17 46.4 0 33.7-.3 75.4-.3 83.6 0 6.5 4.6 14.4 17.3 12.1C428.2 457.8 496 362.9 496 252 496 113.3 383.5 8 244.8 8zM97.2 352.9c-1.3 1-1 3.3.7 5.2 1.6 1.6 3.9 2.3 5.2 1 1.3-1 1-3.3-.7-5.2-1.6-1.6-3.9-2.3-5.2-1zm-10.8-8.1c-.7 1.3.3 2.9 2.3 3.9 1.6 1 3.6.7 4.3-.7.7-1.3-.3-2.9-2.3-3.9-2-.6-3.6-.3-4.3.7zm32.4 35.6c-1.6 1.3-1 4.3 1.3 6.2 2.3 2.3 5.2 2.6 6.5 1 1.3-1.3.7-4.3-1.3-6.2-2.2-2.3-5.2-2.6-6.5-1zm-11.4-14.7c-1.6 1-1.6 3.6 0 5.9 1.6 2.3 4.3 3.3 5.6 2.3 1.6-1.3 1.6-3.9 0-6.2-1.4-2.3-4-3.3-5.6-2z" />
              </svg>
            </Link>

            <Link
              href="https://www.linkedin.com/company/Tuturuuu/"
              className="fill-zinc-700/50 transition duration-300 hover:fill-zinc-700 dark:fill-zinc-200/40 dark:hover:fill-zinc-200"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 448 512"
                className="w-6"
              >
                <path d="M416 32H31.9C14.3 32 0 46.5 0 64.3v383.4C0 465.5 14.3 480 31.9 480H416c17.6 0 32-14.5 32-32.3V64.3c0-17.8-14.4-32.3-32-32.3zM135.4 416H69V202.2h66.5V416zm-33.2-243c-21.3 0-38.5-17.3-38.5-38.5S80.9 96 102.2 96c21.2 0 38.5 17.3 38.5 38.5 0 21.3-17.2 38.5-38.5 38.5zm282.1 243h-66.4V312c0-24.8-.5-56.7-34.5-56.7-34.6 0-39.9 27-39.9 54.9V416h-66.4V202.2h63.7v29.2h.9c8.9-16.8 30.6-34.5 62.9-34.5 67.2 0 79.7 44.3 79.7 101.9V416z" />
              </svg>
            </Link>
          </div>
        </div>

        <div className="flex flex-none flex-col items-center gap-4 md:flex-row md:gap-32 lg:gap-32">
          <div className="flex flex-col md:items-start">
            <div className="text-xl font-semibold">{t('common:resources')}</div>
            <div>
              <Link
                href="/branding"
                className="mt-2 block text-zinc-700 hover:text-zinc-500 dark:text-zinc-300 dark:hover:text-zinc-400"
              >
                {t('common:branding')}
              </Link>
            </div>
          </div>

          <div className="flex flex-col md:items-start">
            <div className="text-xl font-semibold">
              {t('common:developers')}
            </div>
            <div>
              <Link
                href="https://github.com/tutur3u/tutur3u"
                className="mt-2 block text-zinc-700 hover:text-zinc-500 dark:text-zinc-300 dark:hover:text-zinc-400"
              >
                {t('common:open-source')}
              </Link>
            </div>
          </div>
        </div>
      </div>

      <Divider className="mt-8 border-zinc-500/30 dark:border-zinc-500/10" />

      <div className="flex flex-col items-center justify-between gap-x-8 gap-y-4 p-4 text-center text-zinc-700 dark:text-zinc-400 md:flex-row md:px-32 xl:px-64">
        <div>{copyright}</div>

        <div className="flex items-center gap-2">
          <LanguageSelector fullWidthOnMobile />
          <ActionIcon
            onClick={() => changeTheme(theme === 'dark' ? 'light' : 'dark')}
            className="border border-zinc-300 bg-transparent hover:bg-zinc-200 dark:border-zinc-300/10 dark:bg-[#25262b] dark:hover:bg-[#454751]/40"
            size="lg"
          >
            {theme === 'dark' ? (
              <SunIcon className="h-6 w-6 text-zinc-500 dark:text-zinc-300" />
            ) : (
              <MoonIcon className="h-6 w-6 text-zinc-500 dark:text-zinc-300" />
            )}
          </ActionIcon>
        </div>
      </div>
    </div>
  );
};

export default Footer;
