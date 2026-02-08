import Image from 'next/image';

export default function AboutClubSection() {
  return (
    <section className="relative px-6 py-20 md:px-8 md:py-28">
      <div className="relative mx-auto max-w-7xl">
        {/* ═══════════════════════════════════════════════════════════════════
            WHO WE ARE SECTION
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="mb-28 grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Left Column - Content */}
          <div className="animate-slide-up">
            {/* Logo Badge */}
            <div className="mb-6 flex items-center gap-3">
              <div className="relative h-14 w-14 overflow-hidden rounded-xl border-2 border-white/50 bg-white/30 p-2 shadow-lg backdrop-blur-sm">
                <Image
                  src="/rmit_nct.png"
                  alt="NCT Logo"
                  fill
                  className="object-contain p-1"
                />
              </div>
              <div className="h-px flex-1 bg-linear-to-r from-primary/30 to-transparent" />
            </div>

            {/* Header */}
            <div className="mb-6">
              <p className="mb-2 font-semibold text-primary-foreground text-sm uppercase tracking-[0.25em]">
                Who We Are
              </p>
              <h2 className="font-black text-4xl leading-normal tracking-normal md:text-5xl">
                <span className="text-primary underline decoration-6 decoration-brand-light-yellow underline-offset-8">
                  NEO CULTURE
                </span>
                <br />
                <span className="text-secondary">TECH</span>
              </h2>
            </div>

            {/* Accent Line */}
            <div className="mb-6 flex items-center gap-3">
              <div className="h-1 w-16 rounded-full bg-linear-to-r from-brand-light-yellow to-brand-light-red" />
              <div className="h-1 w-8 rounded-full bg-brand-light-blue" />
            </div>

            {/* Description */}
            <p className="mb-6 w-full font-bold text-foreground text-lg leading-relaxed md:max-w-lg">
              RMIT Neo Culture Technology Club is a vibrant and dynamic
              student-led organization dedicated to fostering a passion for
              technology and innovation within the university community.
            </p>
            <p className="w-full text-foreground/70 leading-relaxed md:max-w-lg">
              We believe in the power of technology to shape the future and
              empower individuals to make a positive impact on the world. Our
              mission is to create a welcoming and inclusive environment where
              everyone feels empowered to learn, grow, and contribute their
              unique talents.
            </p>
          </div>

          {/* Right Column - Images */}
          <div className="animate-slide-up" style={{ animationDelay: '0.15s' }}>
            <div className="relative">
              {/* Main Feature Image */}
              <div className="relative aspect-4/3 overflow-hidden rounded-2xl shadow-2xl">
                <Image
                  src="/netcompany-tour.jpg"
                  alt="NCT Club Activities"
                  fill
                  className="object-cover transition-transform duration-700 hover:scale-105"
                />
                <div className="absolute inset-0 bg-linear-to-t from-primary/20 to-transparent" />
              </div>

              {/* Overlapping Sub-Images */}
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div className="relative aspect-3/2 -translate-y-8 overflow-hidden rounded-xl shadow-xl">
                  <Image
                    src="/demo.jpg"
                    alt="Team collaboration"
                    fill
                    className="object-cover transition-transform duration-500 hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-linear-to-br from-brand-light-yellow/20 to-transparent" />
                </div>
                <div className="relative aspect-3/2 translate-y-2 overflow-hidden rounded-xl shadow-xl">
                  <Image
                    src="/demo.jpg"
                    alt="Innovation workshop"
                    fill
                    className="object-cover transition-transform duration-500 hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-linear-to-bl from-brand-light-blue/20 to-transparent" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            WHAT WE DO SECTION
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="mb-28">
          <div className="mb-12 grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            {/* Left Column - Images */}
            <div
              className="order-2 grid animate-slide-up grid-cols-2 gap-4 md:order-1"
              style={{ animationDelay: '0.1s' }}
            >
              <div className="relative aspect-3/4 overflow-hidden rounded-2xl shadow-xl">
                <Image
                  src="/demo.jpg"
                  alt="Workshop session"
                  fill
                  className="object-cover transition-transform duration-500 hover:scale-105"
                />
                <div className="absolute inset-0 bg-linear-to-t from-primary/30 to-transparent" />
                <div className="absolute right-4 bottom-4 left-4">
                  <span className="inline-block rounded-full bg-white/90 px-3 py-1 font-semibold text-primary text-xs backdrop-blur-sm">
                    Workshops
                  </span>
                </div>
              </div>
              <div className="relative mt-8 aspect-3/4 overflow-hidden rounded-2xl shadow-xl">
                <Image
                  src="/demo.jpg"
                  alt="Talk show event"
                  fill
                  className="object-cover transition-transform duration-500 hover:scale-105"
                />
                <div className="absolute inset-0 bg-linear-to-t from-primary/30 to-transparent" />
                <div className="absolute right-4 bottom-4 left-4">
                  <span className="inline-block rounded-full bg-white/90 px-3 py-1 font-semibold text-primary text-xs backdrop-blur-sm">
                    Talk Shows
                  </span>
                </div>
              </div>
            </div>

            {/* Right Column - Content */}
            <div
              className="order-1 animate-slide-up md:order-2"
              style={{ animationDelay: '0.2s' }}
            >
              {/* Header */}
              <div className="mb-6">
                <p className="mb-2 font-semibold text-primary-foreground text-sm uppercase tracking-[0.25em]">
                  What We Do
                </p>
                <h3 className="font-black text-3xl text-foreground leading-tight tracking-tight md:text-4xl">
                  Empowering the
                  <br />
                  <span className="gradient-text">Tech Community</span>
                </h3>
              </div>

              {/* Accent Line */}
              <div className="mb-6 flex items-center gap-3">
                <div className="h-1 w-12 rounded-full bg-brand-light-blue" />
                <div className="h-1 w-6 rounded-full bg-brand-light-yellow" />
              </div>

              {/* Description */}
              <p className="mb-6 text-foreground/80 text-lg leading-relaxed">
                We are a dynamic platform dedicated to empowering the tech
                community through engaging workshops, thought-provoking talk
                shows, and strategic collaborations.
              </p>

              {/* Core Values */}
              <div className="flex flex-wrap gap-3">
                <span className="rounded-full bg-primary px-4 py-2 font-semibold text-brand-light-yellow transition-all hover:scale-105">
                  CULTURE
                </span>
                <span className="rounded-full bg-primary px-4 py-2 font-semibold text-brand-light-yellow transition-all hover:scale-105">
                  REVOLUTIONARY
                </span>
                <span className="rounded-full bg-primary px-4 py-2 font-semibold text-brand-light-yellow transition-all hover:scale-105">
                  COMPANIONSHIP
                </span>
                <span className="rounded-full bg-primary px-4 py-2 font-semibold text-brand-light-yellow transition-all hover:scale-105">
                  DIVERSITY
                </span>
                <span className="rounded-full bg-primary px-4 py-2 font-semibold text-brand-light-yellow transition-all hover:scale-105">
                  INCLUSION
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            OUR PREVIOUS ACTIVITIES SECTION
        ═══════════════════════════════════════════════════════════════════ */}
        <div>
          {/* Header */}
          <div className="mb-10 text-center">
            <h3
              className="gradient-text mb-4 animate-slide-up font-black text-3xl md:text-4xl"
              style={{ animationDelay: '0.15s' }}
            >
              Our Previous Activities
            </h3>
            <p
              className="mx-auto max-w-2xl animate-slide-up text-foreground/70 leading-relaxed"
              style={{ animationDelay: '0.2s' }}
            >
              Beyond technology, we believe in building lasting relationships.
              From hands-on workshops and inspiring events to our Neo Connect
              series, NCT FC football team, badminton tournaments, and exciting
              "Neo Escape" adventures — our community is more than just
              learning.
            </p>
          </div>

          {/* Accent Line Center */}
          <div
            className="mx-auto mb-10 flex w-fit animate-slide-up items-center gap-2"
            style={{ animationDelay: '0.25s' }}
          >
            <div className="h-1 w-8 rounded-full bg-brand-light-yellow" />
            <div className="h-1 w-16 rounded-full bg-linear-to-r from-brand-light-red to-brand-light-blue" />
            <div className="h-1 w-8 rounded-full bg-primary" />
          </div>

          {/* 4-Image Masonry Grid */}
          <div
            className="grid animate-slide-up grid-cols-2 gap-4 md:grid-cols-4 md:gap-6"
            style={{ animationDelay: '0.3s' }}
          >
            {/* Image 1 */}
            <div className="group relative aspect-3/4 overflow-hidden rounded-2xl shadow-lg transition-all duration-500 hover:-translate-y-2 hover:shadow-2xl">
              <Image
                src="/demo.jpg"
                alt="Workshop event"
                fill
                className="object-cover transition-transform duration-700 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-linear-to-t from-primary/60 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <div className="absolute right-0 bottom-0 left-0 translate-y-full p-4 transition-transform duration-300 group-hover:translate-y-0">
                <span className="font-bold text-sm text-white">
                  Tech Workshops
                </span>
              </div>
            </div>

            {/* Image 2 - Offset */}
            <div className="group relative mt-8 aspect-3/4 overflow-hidden rounded-2xl shadow-lg transition-all duration-500 hover:-translate-y-2 hover:shadow-2xl md:mt-12">
              <Image
                src="/demo.jpg"
                alt="Team bonding"
                fill
                className="object-cover transition-transform duration-700 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-linear-to-t from-primary/60 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <div className="absolute right-0 bottom-0 left-0 translate-y-full p-4 transition-transform duration-300 group-hover:translate-y-0">
                <span className="font-bold text-sm text-white">
                  Team Bonding
                </span>
              </div>
            </div>

            {/* Image 3 */}
            <div className="group relative aspect-3/4 overflow-hidden rounded-2xl shadow-lg transition-all duration-500 hover:-translate-y-2 hover:shadow-2xl">
              <Image
                src="/demo.jpg"
                alt="Sports activities"
                fill
                className="object-cover transition-transform duration-700 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-linear-to-t from-primary/60 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <div className="absolute right-0 bottom-0 left-0 translate-y-full p-4 transition-transform duration-300 group-hover:translate-y-0">
                <span className="font-bold text-sm text-white">
                  Sports & Fun
                </span>
              </div>
            </div>

            {/* Image 4 - Offset */}
            <div className="group relative mt-8 aspect-3/4 overflow-hidden rounded-2xl shadow-lg transition-all duration-500 hover:-translate-y-2 hover:shadow-2xl md:mt-12">
              <Image
                src="/demo.jpg"
                alt="Neo Connect event"
                fill
                className="object-cover transition-transform duration-700 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-linear-to-t from-primary/60 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <div className="absolute right-0 bottom-0 left-0 translate-y-full p-4 transition-transform duration-300 group-hover:translate-y-0">
                <span className="font-bold text-sm text-white">
                  Neo Connect
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
