'use client';

import { Button } from '@ncthub/ui/button';
import { Building2, Code, Users } from '@ncthub/ui/icons';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { Link } from '@/i18n/routing';

const stats = [
  {
    number: '70+',
    content: 'Active Members',
    icon: Users,
    gradient: 'from-blue-500 to-cyan-500',
    description: 'Passionate tech enthusiasts',
  },
  {
    number: '25+',
    content: 'Student Projects',
    icon: Code,
    gradient: 'from-purple-500 to-pink-500',
    description: 'Innovation driven solutions',
  },
  {
    number: '20+',
    content: 'Industry Partners',
    icon: Building2,
    gradient: 'from-green-500 to-emerald-500',
    description: 'Leading tech companies',
  },
];

export default function HeroSection() {
  return (
    <motion.section
      className="my-4 md:my-16"
      initial={{ opacity: 0, y: 50 }}
      transition={{ duration: 1 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
    >
      <div className="grid items-start gap-12 lg:grid-cols-2 lg:gap-20">
        {/* Left Column */}
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          whileInView={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          viewport={{ once: true }}
        >
          {/* Logo */}
          <div className="mb-6 flex items-center gap-3">
            <div className="relative h-14 w-14 flex-none overflow-hidden rounded-xl border-2 border-brand-light-blue/20 bg-brand-light-blue/10 p-2 shadow-lg backdrop-blur-sm">
              <Image
                src="/media/logos/transparent.png"
                alt="NCT Logo"
                fill
                className="object-contain p-1"
              />
            </div>
          </div>

          {/* Decorative Title */}
          <div className="mb-4">
            <p className="mb-2 font-semibold text-brand-light-blue text-sm uppercase tracking-[0.25em]">
              Who We Are
            </p>
            <h2 className="font-black text-4xl leading-tight tracking-normal md:text-5xl">
              <span className="text-brand-dark-blue underline decoration-4 decoration-brand-light-yellow underline-offset-8 dark:text-brand-white">
                NEO CULTURE
              </span>
              <br />
              <span className="text-brand-light-blue">TECH</span>
            </h2>
          </div>

          {/* Accent Line */}
          <div className="mb-6 flex items-center gap-3">
            <div className="h-1 w-16 rounded-full bg-linear-to-r from-brand-light-yellow to-brand-light-yellow" />
            <div className="h-1 w-8 rounded-full bg-brand-light-blue" />
          </div>

          {/* Description */}
          <p className="mb-8 font-medium text-foreground text-lg leading-relaxed md:max-w-lg">
            Founded in 2020, we are the best club for{' '}
            <span className="border-brand-light-yellow border-b-2 text-brand-light-blue">
              SSET students
            </span>{' '}
            to explore the world of technology at RMIT University.
          </p>

          {/* Buttons */}
          <div className="mb-12 flex flex-wrap gap-4">
            <Button size="lg" asChild>
              <Link
                href="https://forms.office.com/r/csPz8V73ad"
                target="_blank"
                rel="noopener noreferrer"
              >
                Join Us
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/about">Learn More</Link>
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            {stats.map((item, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.5 + index * 0.15 }}
                viewport={{ once: true }}
                className="group flex flex-col items-center gap-2 rounded-xl border border-border/50 bg-background/50 px-4 py-3 backdrop-blur-sm transition-all duration-300 hover:border-primary/30"
              >
                {/* Background gradient effect */}
                <div
                  className={`absolute inset-0 bg-linear-to-br ${item.gradient} opacity-0 transition-opacity duration-300 group-hover:opacity-10`}
                />

                {/* Icon */}
                <div
                  className={`h-10 w-10 flex-none rounded-full bg-linear-to-r ${item.gradient} p-0.5`}
                >
                  <div className="flex h-full w-full items-center justify-center rounded-full bg-background">
                    <item.icon className="h-5 w-5 text-foreground" />
                  </div>
                </div>

                {/* Number + label */}
                <h3
                  className={`bg-linear-to-r font-extrabold text-3xl ${item.gradient} bg-clip-text text-transparent`}
                >
                  {item.number}
                </h3>
                <div className="flex flex-col items-center gap-1 text-center">
                  <span className="truncate font-semibold text-sm">
                    {item.content}
                  </span>
                  <p className="text-muted-foreground text-xs">
                    {item.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Right Column — 3 Images with glow */}
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          whileInView={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          viewport={{ once: true }}
          className="relative"
        >
          {/* Rounded glow behind images */}
          <div className="-translate-1/2 absolute inset-1/2 -z-10 aspect-square h-full rounded-full bg-brand-light-blue/20 blur-2xl" />

          {/* Large top image */}
          <div className="group relative aspect-4/3 overflow-hidden rounded-2xl shadow-2xl transition-all duration-500 hover:-translate-y-2 hover:shadow-2xl">
            <Image
              src="/club-day/sem-a-2026.jpg"
              alt="NCT Club Day"
              fill
              className="object-cover transition-transform duration-700 group-hover:scale-110"
            />
            <div className="absolute inset-0 bg-linear-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            <div className="absolute right-0 bottom-0 left-0 translate-y-full p-4 transition-transform duration-300 group-hover:translate-y-0">
              <span className="font-bold text-sm text-white">Club Day</span>
            </div>
          </div>

          {/* Two sub-images, staggered */}
          <div className="mt-4 grid grid-cols-2 gap-4 pt-10">
            <div className="group relative aspect-3/2 -translate-y-8 overflow-hidden rounded-xl shadow-xl transition-all duration-500 hover:-translate-y-10 hover:shadow-2xl">
              <Image
                src="/media/marketing/events/netcompany-tour.jpg"
                alt="Company Tour"
                fill
                className="object-cover transition-transform duration-700 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-linear-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <div className="absolute right-0 bottom-0 left-0 translate-y-full p-3 transition-transform duration-300 group-hover:translate-y-0">
                <span className="font-bold text-sm text-white">
                  Company Tour
                </span>
              </div>
            </div>
            <div className="group relative aspect-3/2 translate-y-2 overflow-hidden rounded-xl shadow-xl transition-all duration-500 hover:translate-y-0 hover:shadow-2xl">
              <Image
                src="/media/marketing/workshops/cv-workshop.jpg"
                alt="CV Workshop"
                fill
                className="object-cover transition-transform duration-700 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-linear-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <div className="absolute right-0 bottom-0 left-0 translate-y-full p-3 transition-transform duration-300 group-hover:translate-y-0">
                <span className="font-bold text-sm text-white">
                  CV Workshop
                </span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.section>
  );
}
