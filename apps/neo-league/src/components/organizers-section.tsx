'use client';

import Image from 'next/image';

import AnimatedSection from './animated-section';

export default function OrganizersSection() {
  return (
    <section id="organizers" className="px-6 py-20 md:px-8 md:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mb-16 text-center">
          <h2 className="mb-4 text-3xl md:text-4xl tracking-wide">
            <span className="font-medium text-[#134e4a] italic">
              COMPETITION{' '}
            </span>
            <span className="relative inline-block font-black text-[#134e4a]">
              ORGANIZERS
              <span className="absolute left-0 -bottom-1 h-[4px] w-full bg-yellow-400"></span>
            </span>
          </h2>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          {/* RMIT SSET */}
          <AnimatedSection delay={0}>
            <div className="glass-card card-hover group relative overflow-hidden rounded-2xl p-8">
              <div className="absolute inset-0 bg-linear-to-br from-primary/5 to-secondary/5 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <div className="relative z-10 flex flex-col items-center text-center">
                <div className="mb-6 flex h-32 w-full items-center justify-center rounded-xl bg-white p-4 shadow-sm transition-transform duration-300 group-hover:scale-105">
                  <Image
                    width={200}
                    height={100}
                    src="/rmit-sset.png"
                    alt="RMIT School of Science, Engineering & Technology"
                    className="w-auto object-contain"
                  />
                </div>
                <h3 className="mb-2 font-black text-lg">
                  RMIT School of Science,
                  <br />
                  Engineering & Technology
                </h3>
                <p className="text-foreground text-sm">Academic Partner</p>
              </div>
            </div>
          </AnimatedSection>

          {/* NCT */}
          <AnimatedSection delay={0.1}>
            <div className="glass-card card-hover group relative overflow-hidden rounded-2xl p-8">
              <div className="absolute inset-0 bg-linear-to-br from-primary/5 to-secondary/5 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <div className="relative z-10 flex flex-col items-center text-center">
                <div className="mb-6 flex h-32 w-full items-center justify-center rounded-xl bg-white p-4 shadow-sm transition-transform duration-300 group-hover:scale-105">
                  <Image
                    width={200}
                    height={100}
                    src="/rmit-nct.png"
                    alt="NEO Culture Technology Club"
                    className="w-auto object-contain"
                  />
                </div>
                <h3 className="mb-2 font-black text-lg">
                  NEO Culture Technology
                  <br />
                  Club
                </h3>
                <p className="text-foreground text-sm">Organizer</p>
              </div>
            </div>
          </AnimatedSection>

          {/* RMIT Student Club Program */}
          <AnimatedSection delay={0.2}>
            <div className="glass-card card-hover group relative overflow-hidden rounded-2xl p-8">
              <div className="absolute inset-0 bg-linear-to-br from-primary/5 to-secondary/5 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <div className="relative z-10 flex flex-col items-center text-center">
                <div className="mb-6 flex h-32 w-full items-center justify-center rounded-xl bg-white p-4 shadow-sm transition-transform duration-300 group-hover:scale-105">
                  <Image
                    width={200}
                    height={100}
                    src="/rmit-student-club-program.png"
                    alt="RMIT Student Club Program"
                    className="w-auto object-contain"
                  />
                </div>
                <h3 className="mb-2 font-black text-lg">
                  RMIT Student Club
                  <br />
                  Program
                </h3>
                <p className="text-foreground text-sm">Institutional Support</p>
              </div>
            </div>
          </AnimatedSection>
        </div>
      </div>
    </section>
  );
}
