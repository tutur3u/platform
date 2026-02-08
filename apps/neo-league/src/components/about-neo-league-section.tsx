'use client';

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@ncthub/ui/carousel';
import { Cpu, Globe, Users, Wrench } from 'lucide-react';
import Image from 'next/image';
import AnimatedSection from '@/components/animated-section';

const missions = [
  {
    icon: Cpu,
    title: 'Make Hardware Accessible',
    description:
      'Open hardware development to all STEM students, regardless of background.',
  },
  {
    icon: Wrench,
    title: 'Build Practical Skills',
    description:
      'Teach hands-on programming, sensor integration, and prototyping to turn ideas into devices.',
  },
  {
    icon: Users,
    title: 'Foster Community',
    description:
      'Create a supportive space for students to collaborate, share knowledge, and inspire creation.',
  },
  {
    icon: Globe,
    title: 'Drive Sustainable Solutions',
    description:
      "Apply tech skills to global issues and build prototypes for the UN's Sustainable Development Goals.",
  },
];

export default function AboutNeoLeagueSection() {
  return (
    <section id="about" className="relative py-16 md:py-24">
      {/* Decorative background elements */}
      <div
        className="blob absolute -top-20 -right-80 h-192 w-3xl animate-float"
        style={{ animationDelay: '2s' }}
      />
      <div
        className="blob absolute bottom-80 -left-80 h-128 w-lg animate-float"
        style={{ animationDelay: '4s' }}
      />

      <div className="mx-auto px-8 md:px-16">
        <AnimatedSection>
          <div className="mb-24 md:mb-32">
            {/* Banner Image */}
            <div className="relative mx-auto mb-12 max-w-6xl overflow-hidden rounded-2xl shadow-2xl md:mb-16">
              <div className="relative aspect-[2.5/1]">
                <Image
                  src="/background.png"
                  alt="NEO League Season 2 Banner"
                  fill
                  className="object-cover"
                  priority
                />
              </div>
              {/* Decorative corner accents */}
              <div className="absolute top-0 left-0 h-16 w-16 rounded-tl-2xl border-brand-light-yellow border-t-4 border-l-4" />
              <div className="absolute right-0 bottom-0 h-16 w-16 rounded-br-2xl border-brand-light-red border-r-4 border-b-4" />
            </div>

            {/* About Content */}
            <div className="mx-auto max-w-6xl">
              <div className="mb-8 flex items-center justify-center gap-3">
                <div className="h-px w-12 bg-linear-to-r from-transparent to-brand-dark-blue" />
                <span className="font-semibold text-brand-dark-blue text-sm uppercase tracking-[0.2em]">
                  Season 2
                </span>
                <div className="h-px w-12 bg-linear-to-l from-transparent to-brand-dark-blue" />
              </div>

              <h2 className="mb-8 text-center font-normal text-4xl leading-tight shadow-text md:text-5xl lg:text-6xl">
                ABOUT{' '}
                <span className="relative inline-block font-black text-primary">
                  NEO LEAGUE
                </span>
              </h2>

              <div className="space-y-6">
                <p className="text-foreground text-lg leading-relaxed md:text-xl">
                  <strong className="text-brand-dark-blue">
                    Innovation Humanity Challenge
                  </strong>{' '}
                  hosted by RMIT Neo Culture Technology Club, offers university
                  students across Vietnam a dynamic platform to develop and
                  showcase their ability in hardware development using IoT
                  solutions.
                </p>
                <p className="text-base text-foreground/70 leading-relaxed md:text-lg">
                  Teams of four tackle progressively challenging tasks based on
                  relevant themes, applying their skills to real-world problems
                  through three main rounds—from virtual preliminaries to the
                  final on-site competition. A panel of experts will evaluate
                  submissions based on accuracy, relevance, creativity, and
                  effectiveness. Winners will receive prizes such as internships
                  and other valuable opportunities
                </p>
              </div>
            </div>
          </div>
        </AnimatedSection>

        <AnimatedSection delay={0.2}>
          <div className="space-y-16">
            {/* Vision Section */}
            <div className="relative">
              <Image
                src="/monkey_mascot_2.png"
                alt="Monkey Mascot 2"
                width={150}
                height={150}
                className="absolute top-0 right-0 hidden w-auto -translate-y-3/4 md:block md:h-64"
              />
              <h3 className="mb-8 text-center font-black text-3xl text-primary shadow-text md:text-4xl lg:text-5xl">
                OUR VISION
              </h3>

              <div className="mx-auto max-w-6xl">
                <p className="text-center text-foreground/90 text-xl leading-relaxed">
                  NEO League Season 2 empowers STEM students to become
                  innovators. We foster a hands-on community using IoT solutions
                  to build sustainable solutions for{' '}
                  <strong className="text-brand-dark-blue">UN SDGs</strong> and
                  real-world societal impact. By connecting students with
                  industry professionals, we create a notable playground for{' '}
                  <strong className="text-brand-dark-blue">
                    Hardware Development
                  </strong>{' '}
                  and <strong className="text-brand-dark-blue">IoT</strong>.
                </p>
              </div>
            </div>

            {/* Mission Carousel */}
            <div className="mx-auto max-w-5xl px-12 md:px-16">
              <Carousel
                opts={{
                  align: 'start',
                  loop: false,
                }}
                className="w-full"
              >
                <CarouselContent className="-ml-4 md:-ml-6">
                  {missions.map((mission, index) => (
                    <CarouselItem
                      key={index}
                      className="pl-4 md:basis-1/2 md:pl-6 lg:basis-1/3"
                    >
                      <div className="group relative h-full">
                        {/* Card */}
                        <div className="glass-card card-hover relative flex h-full min-h-80 flex-col items-center overflow-hidden rounded-2xl p-8 text-center">
                          {/* Decorative gradient orb */}
                          <div className="absolute -top-12 -right-12 h-32 w-32 rounded-full bg-linear-to-br from-brand-light-yellow/30 to-brand-light-red/30 blur-2xl transition-all duration-500 group-hover:scale-150" />

                          {/* Icon Container */}
                          <div className="gradient-bg relative z-10 mb-6 flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl shadow-lg transition-transform duration-300 group-hover:rotate-3 group-hover:scale-110">
                            <mission.icon
                              className="h-12 w-12 text-white"
                              strokeWidth={1.5}
                            />
                          </div>

                          {/* Content */}
                          <h4 className="relative z-10 mb-4 font-bold text-brand-dark-blue text-xl">
                            {mission.title}
                          </h4>
                          <p className="relative z-10 text-foreground/75 text-sm leading-relaxed">
                            {mission.description}
                          </p>

                          {/* Bottom accent line */}
                          <div className="absolute right-0 bottom-0 left-0 h-1 bg-linear-to-r from-brand-light-yellow via-brand-light-red to-brand-light-yellow opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                        </div>
                      </div>
                    </CarouselItem>
                  ))}
                </CarouselContent>
                <CarouselPrevious className="border-2 border-brand-dark-blue/20 bg-white/80 text-brand-dark-blue backdrop-blur-sm hover:border-brand-dark-blue hover:bg-brand-dark-blue hover:text-white" />
                <CarouselNext className="border-2 border-brand-dark-blue/20 bg-white/80 text-brand-dark-blue backdrop-blur-sm hover:border-brand-dark-blue hover:bg-brand-dark-blue hover:text-white" />
              </Carousel>
            </div>
          </div>
        </AnimatedSection>
      </div>
    </section>
  );
}
