export function TailwindIndicator() {
  if (process.env.NODE_ENV === 'production') return null;

  return (
    <div className="fixed right-2 bottom-2 z-1000 flex h-6 w-6 items-center justify-center rounded-lg border border-foreground/10 bg-foreground/10 font-mono text-xs text-foreground backdrop-blur transition duration-300 hover:opacity-0">
      <div className="block sm:hidden">xs</div>
      <div className="hidden sm:block md:hidden">sm</div>
      <div className="hidden md:block lg:hidden">md</div>
      <div className="hidden lg:block xl:hidden">lg</div>
      <div className="hidden xl:block 2xl:hidden">xl</div>
      <div className="hidden 2xl:block">2xl</div>
    </div>
  );
}
