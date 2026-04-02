import SponsorsList from './sponsors-list';

export default function SponsorsSection() {
  return (
    <section id="sponsors" className="px-6 py-20 md:px-8 md:py-24">
      <div className="mx-auto max-w-7xl">
        {/* Section Header */}
        <div className="mb-16 text-center">
          <h2 className="mb-4 text-3xl tracking-wide md:text-4xl">
            <span className="font-medium text-brand-teal italic">OUR </span>
            <span className="relative inline-block font-black text-brand-teal">
              SPONSORS
              <span className="absolute -bottom-1 left-0 h-1 w-full bg-yellow-400"></span>
            </span>
          </h2>
          <p className="mx-auto max-w-2xl font-bold text-foreground text-lg">
            These sponsors play an important role in making this event possible.
          </p>
        </div>

        <SponsorsList />
      </div>
    </section>
  );
}
