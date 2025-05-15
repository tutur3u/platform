import { PROD_MODE, SHOW_TAILWIND_INDICATOR } from '@/constants/common';

export function TailwindIndicator() {
  if (!SHOW_TAILWIND_INDICATOR || PROD_MODE) return null;

  return (
    <div className="bg-background/30 text-foreground fixed bottom-2 left-2 z-1000 flex h-8 w-8 items-center justify-center rounded-lg font-mono text-xs backdrop-blur">
      <div className="block sm:hidden">xs</div>
      <div className="hidden sm:block md:hidden">sm</div>
      <div className="hidden md:block lg:hidden">md</div>
      <div className="hidden lg:block xl:hidden">lg</div>
      <div className="hidden xl:block 2xl:hidden">xl</div>
      <div className="hidden 2xl:block">2xl</div>
    </div>
  );
}
