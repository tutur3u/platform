import { HIDE_TAILWIND_INDICATOR, PROD_MODE } from '@/constants/common';

export function TailwindIndicator() {
  if (HIDE_TAILWIND_INDICATOR || PROD_MODE) return null;

  return (
    <div className="border-foreground/10 bg-foreground/10 text-foreground fixed bottom-2 right-2 z-1000 flex h-6 w-6 items-center justify-center rounded-lg border font-mono text-xs backdrop-blur transition duration-300 hover:opacity-0">
      <div className="block sm:hidden">xs</div>
      <div className="hidden sm:block md:hidden">sm</div>
      <div className="hidden md:block lg:hidden">md</div>
      <div className="hidden lg:block xl:hidden">lg</div>
      <div className="hidden xl:block 2xl:hidden">xl</div>
      <div className="hidden 2xl:block">2xl</div>
    </div>
  );
}
