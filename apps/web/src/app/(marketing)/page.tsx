import Link from 'next/link';
import { features } from './features';
import Image from 'next/image';

export const dynamic = 'force-dynamic';

export default async function MarketingPage() {
  return (
    <div className="flex w-full flex-col items-center">
      <div className="animate-in text-foreground mt-24 flex max-w-4xl flex-col gap-6 px-3 py-16 opacity-0 lg:gap-14 lg:py-24">
        <div className="mb-4 flex flex-col items-center lg:mb-12">
          <h1 className="relative mb-4 text-center text-4xl font-bold lg:text-7xl">
            <span className="sr-only">Tuturuuu</span>
            <Image
              src="/media/logos/transparent.png"
              width={160}
              height={160}
              alt="logo"
            />
          </h1>

          <p className="mx-auto my-4 max-w-xl text-center text-lg !leading-tight md:mb-8 md:text-2xl lg:text-3xl">
            Take control of your workflow,{' '}
            <span className="bg-gradient-to-r from-pink-300 via-amber-300 to-blue-300 bg-clip-text font-semibold text-transparent">
              supercharged by AI
            </span>
            .
          </p>

          <div className="group relative inline-flex">
            <div className="animate-tilt absolute -inset-px rounded-lg bg-gradient-to-r from-rose-400/60 to-orange-300/60 opacity-70 blur-lg transition-all group-hover:-inset-1 group-hover:opacity-100 group-hover:duration-200"></div>
            <Link
              href="/login"
              className="relative inline-flex items-center justify-center rounded-lg bg-gradient-to-r from-rose-400/60 to-orange-300/60 px-8 py-2 font-bold text-white transition-all md:text-lg"
            >
              Get started
            </Link>
          </div>
        </div>

        <div className="via-foreground/10 w-full bg-gradient-to-r from-transparent to-transparent p-[1px]" />

        <div className="text-foreground flex flex-col gap-8">
          <h2 className="text-center font-bold md:text-lg">
            What can you do with Tuturuuu?
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {features
              .sort((a, b) => (a.comingSoon ? 1 : 0) - (b.comingSoon ? 1 : 0))
              .map(({ title, subtitle, url, icon, comingSoon }) =>
                url ? (
                  <Link
                    href={url}
                    key={title}
                    className={`border-foreground/30 group relative flex flex-col rounded-lg border p-6 ${
                      comingSoon
                        ? 'cursor-default opacity-50'
                        : 'hover:border-foreground'
                    }`}
                  >
                    <h3 className="min-h-[40px] font-bold">{title}</h3>
                    <div className="flex grow flex-col justify-between gap-4">
                      <p className="text-sm opacity-70">{subtitle}</p>
                      <div className="opacity-60 group-hover:opacity-100">
                        {icon}
                      </div>
                    </div>
                  </Link>
                ) : (
                  <div
                    key={title}
                    className={`border-foreground/30 group relative flex flex-col rounded-lg border p-6 ${
                      comingSoon
                        ? 'cursor-default opacity-30'
                        : 'hover:border-foreground'
                    }`}
                  >
                    <h3 className="min-h-[40px] font-bold">{title}</h3>
                    <div className="flex grow flex-col justify-between gap-4">
                      <p className="text-sm opacity-70">{subtitle}</p>
                      <div
                        className={`opacity-60 ${
                          comingSoon || 'group-hover:opacity-100'
                        }`}
                      >
                        {icon}
                      </div>
                    </div>
                    {comingSoon && (
                      <div className="bg-foreground/20 text-foreground absolute bottom-4 right-4 rounded px-2 py-0.5 text-sm font-semibold">
                        Coming soon
                      </div>
                    )}
                  </div>
                )
              )}
          </div>
        </div>
      </div>
    </div>
  );
}
