import { Calendar, MapPin } from '@ncthub/ui/icons';
import Link from 'next/link';

export function HeroSection() {
  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden">
      {/* Background Gradient */}
      <div className="gradient-bg absolute inset-0 opacity-10 dark:opacity-20" />

      {/* Animated Blobs */}
      <div className="blob -top-48 -left-48 h-96 w-96 animate-float bg-primary" />
      <div
        className="blob top-1/2 -right-40 h-80 w-80 animate-float bg-secondary"
        style={{ animationDelay: '2s' }}
      />
      <div
        className="blob bottom-20 left-1/4 h-64 w-64 animate-float bg-primary"
        style={{ animationDelay: '4s' }}
      />

      <div className="relative z-10 mx-auto max-w-6xl px-6 text-center">
        <div className="animate-slide-up">
          <span className="mb-6 inline-block rounded-full bg-secondary/30 px-4 py-2 font-bold text-foreground text-sm dark:bg-secondary/20">
            RMIT NEO Culture Technology Club Presents
          </span>
        </div>

        <h1
          className="mb-6 animate-slide-up font-extrabold text-4xl md:text-6xl lg:text-7xl"
          style={{ animationDelay: '0.1s' }}
        >
          <span className="gradient-text">NEO LEAGUE</span>
          <br />
          <span className="text-brand-dark-blue">SEASON 2</span>
        </h1>

        <p
          className="mb-4 animate-slide-up font-black text-primary text-xl md:text-2xl"
          style={{ animationDelay: '0.2s' }}
        >
          INNOVATION HUMANITY CHALLENGE
        </p>

        <p
          className="mx-auto mb-8 max-w-2xl animate-slide-up text-foreground/70 text-lg"
          style={{ animationDelay: '0.3s' }}
        >
          Engineer integrated IoT solutions addressing UN Sustainable
          Development Goals. Combine physical prototyping with software, data
          connectivity, and smart technologies.
        </p>

        <div
          className="mb-12 flex animate-slide-up flex-col justify-center gap-4 sm:flex-row"
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

        <div
          className="glass inline-block animate-slide-up rounded-2xl px-8 py-4"
          style={{ animationDelay: '0.5s' }}
        >
          <div className="flex gap-2 font-bold text-lg">
            <div className="flex items-center gap-1 text-primary">
              <Calendar className="h-6 w-6" /> March 2 – May 29, 2026
            </div>
            <span className="mx-4 text-foreground">|</span>
            <div className="flex items-center gap-1 text-primary">
              <MapPin className="h-6 w-6" /> Ho Chi Minh City
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
