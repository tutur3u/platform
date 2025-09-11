import Link from 'next/link';
import { useTranslations } from 'next-intl';

export default function NotFound() {
  const t = useTranslations('common');

  const msg = t('404-msg');
  const backToHome = t('back-to-home');

  return (
    <div className="absolute inset-0 mx-4 mt-24 mb-8 flex flex-col items-center justify-center text-center md:mx-32 lg:mx-64">
      <h1 className="font-bold text-9xl">
        <span className="text-orange-500 dark:text-orange-300">4</span>
        <span className="text-green-500 dark:text-green-300">0</span>
        <span className="text-red-500 dark:text-red-300">4</span>
      </h1>
      <p className="font-semibold text-xl text-zinc-700 dark:text-zinc-300">
        {msg}
      </p>

      <Link
        href="/onboarding"
        className="mt-4 block w-fit rounded bg-blue-500/10 px-8 py-2 font-semibold text-blue-500 transition duration-300 hover:bg-blue-500/20 dark:bg-blue-300/20 dark:text-blue-300 dark:hover:bg-blue-300/30"
      >
        {backToHome}
      </Link>
    </div>
  );
}
