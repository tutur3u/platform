export default function SponsorsComingSoon() {
  return (
    <section className="glass-card card-hover relative overflow-hidden rounded-3xl px-6 py-10 md:px-10 md:py-14">
      {/* Decorative gradient orb */}
      <div className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full bg-linear-to-br from-brand-light-yellow/40 to-brand-light-red/40 blur-3xl" />

      <div className="relative flex flex-col items-center gap-6 text-center md:gap-8">
        <div className="space-y-3 md:space-y-4">
          <h2 className="font-black text-2xl text-brand-teal tracking-tight sm:text-3xl md:text-4xl">
            To be announced soon...
          </h2>
          <p className="max-w-2xl text-foreground/80 text-sm leading-relaxed sm:text-base">
            We&apos;re curating a select group of partners who believe in the
            future of competitive intelligence and next-generation tournaments.
            The official sponsor roster will be revealed closer to kickoff.
          </p>
        </div>

        <p className="mt-4 max-w-xl text-muted-foreground text-xs sm:text-sm">
          Interested in being part of the founding sponsor cohort? Reach out to
          our partnerships team to explore tailored packages before the bracket
          drops.
        </p>
      </div>
    </section>
  );
}
