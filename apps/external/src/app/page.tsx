import Link from 'next/link';

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-dynamic-surface to-dynamic-muted">
      <div className="max-w-4xl rounded-2xl bg-dynamic-background p-12 shadow-2xl">
        <h1 className="mb-4 font-bold text-5xl text-dynamic-foreground">
          External App Demos
        </h1>
        <p className="mb-8 text-dynamic-muted-foreground text-lg">
          Explore various component demonstrations and examples
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          <Link
            href="/masonry"
            className="group rounded-xl bg-linear-to-br from-dynamic-blue to-dynamic-indigo p-6 transition-transform hover:scale-105"
          >
            <h2 className="mb-2 font-bold text-2xl text-white">Masonry Grid</h2>
            <p className="text-white/80">
              Pinterest-style responsive masonry layout component
            </p>
            <span className="mt-4 inline-block text-white/60 group-hover:text-white">
              View Demo →
            </span>
          </Link>

          {/* Placeholder for future demos */}
          <div className="rounded-xl bg-dynamic-muted/50 p-6 opacity-50">
            <h2 className="mb-2 font-bold text-2xl text-dynamic-muted-foreground">
              More Demos
            </h2>
            <p className="text-dynamic-muted-foreground">Coming soon...</p>
          </div>
        </div>
      </div>
    </div>
  );
}
