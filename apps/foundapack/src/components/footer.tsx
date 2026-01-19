'use client';

export function Footer() {
  return (
    <footer className="w-full border-pack-border/30 border-t bg-pack-charcoal px-4 py-12">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-8 md:flex-row">
        <div className="text-center md:text-left">
          <h4 className="mb-2 font-bold text-lg text-pack-white">Foundapack</h4>
          <p className="text-pack-frost/50 text-sm">
            Where no student founder builds alone.
          </p>
        </div>

        <div className="flex flex-col items-center md:items-end">
          <p className="mb-2 text-pack-frost/50 text-xs uppercase tracking-widest">
            In Association With
          </p>
          <a
            href="https://tuturuuu.com"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-2"
          >
            <span className="font-bold text-pack-white text-xl transition-colors group-hover:text-pack-amber">
              Powered by Tuturuuu
            </span>
          </a>
          <a
            href="https://tuturuuu.com/partners"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 text-pack-frost/50 text-sm transition-colors hover:text-pack-amber"
          >
            Explore Partner Network
          </a>
        </div>
      </div>
    </footer>
  );
}
