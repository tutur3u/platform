import Image from 'next/image';
import Link from 'next/link';

export function HeroSection() {
  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden">
      {/* Animated Blobs */}
      <div
        className="blob -top-20 -right-20 h-64 w-64 animate-float"
        style={{ animationDelay: '2s' }}
      />
      <div
        className="blob -bottom-40 -left-40 h-128 w-lg animate-float"
        style={{ animationDelay: '4s' }}
      />

      <div className="relative mx-auto max-w-6xl px-6 text-center">
        <div className="flex flex-col items-center justify-center gap-8">
          <div className="w-full max-w-lg">
            <Image
              src="/logo.png"
              alt="NEO League Logo"
              width={350}
              height={100}
              className="w-full"
            />
          </div>

          <p
            className="mx-auto max-w-2xl animate-slide-up text-foreground/70 text-lg"
            style={{ animationDelay: '0.3s' }}
          >
            Engineer integrated IoT solutions addressing UN Sustainable
            Development Goals. Combine physical prototyping with software, data
            connectivity, and smart technologies.
          </p>

          <div
            className="flex animate-slide-up flex-col justify-center gap-4 sm:flex-row"
            style={{ animationDelay: '0.4s' }}
          >
            <Link href="#register" className="btn-primary animate-pulse-glow">
              Register Now
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </Link>
            <Link href="#about" className="btn-secondary">
              Learn More
            </Link>
          </div>

          <div className="inline-block px-8 py-4">
            <div className="flex gap-2 font-bold text-lg">
              <p className="flex items-center gap-1">March 2 – May 29, 2026</p>
              <span className="mx-4 text-foreground">|</span>
              <p className="flex items-center gap-1">Ho Chi Minh City</p>
            </div>
          </div>
        </div>
      </div>

      {/* Scroll Indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
        <svg
          className="h-6 w-6 text-primary"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 14l-7 7m0 0l-7-7m7 7V3"
          />
        </svg>
      </div>
    </section>
  );
}
