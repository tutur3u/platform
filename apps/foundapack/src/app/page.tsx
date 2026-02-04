import Link from 'next/link';

export default function FoundapackPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-pack-void text-pack-frost">
      <div className="text-center">
        <h1 className="font-semibold text-4xl">Foundapack</h1>
        <p className="mt-4 text-lg text-pack-frost/70">
          Foundapack is no longer a part of{' '}
          <Link
            href="https://tuturuuu.com"
            className="underline underline-offset-4 transition-colors hover:text-pack-frost"
          >
            Tuturuuu
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
