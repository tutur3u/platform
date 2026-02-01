import Image from 'next/image';

export default function AboutClubSection() {
  return (
    <section className="relative overflow-hidden bg-secondary/10 px-6 py-20 md:px-8 md:py-28">
      {/* Decorative background elements */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute -top-32 right-1/4 h-96 w-96 rounded-full opacity-20"
          style={{
            background:
              'radial-gradient(circle, var(--brand-light-yellow) 0%, transparent 70%)',
          }}
        />
        <div
          className="absolute bottom-0 left-0 h-80 w-80 rounded-full opacity-15"
          style={{
            background:
              'radial-gradient(circle, var(--brand-light-blue) 0%, transparent 70%)',
          }}
        />
      </div>

      <div className="relative mx-auto max-w-7xl">
        {/* ═══════════════════════════════════════════════════════════════════
            WHO WE ARE SECTION
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="mb-28 grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Left Column - Content */}
          <div className="order-2 animate-slide-up lg:order-1">
            {/* Logo Badge */}
            <div className="mb-6 flex items-center gap-3">
              <div className="relative h-14 w-14 overflow-hidden rounded-xl border-2 border-white/50 bg-white/80 p-2 shadow-lg backdrop-blur-sm">
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
            <p className="mb-6 max-w-lg text-foreground/80 text-lg leading-relaxed">
              Neo Culture Tech (NCT) is a vibrant and dynamic student club at
              RMIT University Vietnam, dedicated to fostering a passion for
              technology and innovation within the university community.
            </p>
            <p className="max-w-lg text-foreground/70 leading-relaxed">
              We believe in the power of technology to shape the future and
              empower individuals to make a positive impact on the world. Our
              mission is to create a welcoming and inclusive environment where
              everyone feels empowered to learn, grow, and contribute their
              unique talents.
            </p>
          </div>

          {/* Right Column - Images */}
          <div
            className="order-1 animate-slide-up lg:order-2"
            style={{ animationDelay: '0.15s' }}
          >
            <div className="relative">
              {/* Main Feature Image */}
              <div className="relative aspect-4/3 overflow-hidden rounded-2xl shadow-2xl">
                <Image
                  src="/demo.jpg"
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

              {/* Floating Accent */}
              <div className="absolute -top-4 -right-4 flex h-20 w-20 animate-float items-center justify-center rounded-2xl bg-linear-to-br from-brand-light-yellow to-brand-light-red shadow-lg">
                <span className="font-black text-2xl text-white">80+</span>
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
              className="grid animate-slide-up grid-cols-2 gap-4"
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
              className="animate-slide-up"
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

              {/* Feature List */}
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-brand-light-yellow to-brand-light-red">
                    <svg
                      className="h-4 w-4 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-bold text-foreground">
                      Engaging Workshops
                    </h4>
                    <p className="text-foreground/70 text-sm">
                      Practical skills in GitHub, Arduino, and Soft Skills
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-brand-light-blue to-brand-dark-blue">
                    <svg
                      className="h-4 w-4 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z"
                      />
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-bold text-foreground">
                      Thought-Provoking Talk Shows
                    </h4>
                    <p className="text-foreground/70 text-sm">
                      Featuring prominent figures in the tech industry
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-primary to-primary-foreground">
                    <svg
                      className="h-4 w-4 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                      />
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-bold text-foreground">
                      Strategic Collaborations
                    </h4>
                    <p className="text-foreground/70 text-sm">
                      Partnering with leading tech companies
                    </p>
                  </div>
                </div>
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
