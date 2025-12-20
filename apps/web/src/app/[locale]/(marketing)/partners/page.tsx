'use client';

import {
  ArrowRight,
  Award,
  ExternalLink,
  Globe,
  Handshake,
  Sparkles,
  Target,
  Users,
  Zap,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { motion } from 'framer-motion';
import Image from 'next/image';
import Link from 'next/link';

interface Partner {
  name: string;
  description: string;
  category: string;
  color: string;
  logo: string;
  website: string;
  highlights: string[];
  featured?: boolean;
}

const partners: Partner[] = [
  {
    name: 'RMIT Neo Culture Tech Club',
    description:
      'A vibrant student community at RMIT University Vietnam dedicated to exploring and advancing technology, fostering innovation, and building a culture of tech excellence among students.',
    category: 'Student Community',
    color: 'purple',
    logo: '/media/partners/rmitnct.jpg',
    website: 'https://rmitnct.club',
    highlights: [
      'Student-led technology initiatives',
      'Innovation workshops and events',
      'Tech community building',
    ],
    featured: true,
  },
  {
    name: 'SPARK Hub',
    description:
      "RMIT University Vietnam's Strategic Innovation Challenge hub that empowers student startups and entrepreneurial ventures, providing resources, mentorship, and support for turning innovative ideas into reality.",
    category: 'Innovation & Entrepreneurship',
    color: 'orange',
    logo: '/media/partners/sparkhub.jpg',
    website:
      'https://www.rmit.edu.vn/about-us/who-we-are/our-commitments/vietnam-country-commitment/strategic-innovation-challenge/spark-hub',
    highlights: [
      'Startup incubation support',
      'Entrepreneurship mentorship',
      'Innovation resources',
    ],
    featured: true,
  },
  {
    name: 'Google for Startups',
    description:
      'Google for Startups brings the best of Google to the startup ecosystem, providing world-class resources, connections, and support to help founders build and scale their businesses through various programs and initiatives.',
    category: 'Tech Accelerator',
    color: 'red',
    logo: '/media/partners/google-for-startups.jpg',
    website: 'https://startup.google.com',
    highlights: [
      'Startup acceleration programs',
      'Google Cloud credits & resources',
      'Global founder network',
    ],
    featured: true,
  },
  {
    name: 'RMIT Business Analytics Champion',
    description:
      'One of the pioneering academic competitions in data analytics at RMIT, where students apply data-driven thinking to solve real-world business problems and connect with industry professionals.',
    category: 'Analytics Competition',
    color: 'blue',
    logo: '/media/partners/rbac.jpg',
    website: 'https://rbac.vn',
    highlights: [
      'Data-driven problem solving',
      'Real-world business cases',
      'Industry professional connections',
    ],
  },
  {
    name: 'EXOCORPSE',
    description:
      "A secret corporation that cleanses humanity's sins by committing them, carrying out missions from heists to assassinations. Its agents are divided into two branches: the physically dominant Pulse and the intellectually cunning Neuro.",
    category: 'Creative Fiction',
    color: 'green',
    logo: '/media/partners/exocorpse.png',
    website: 'https://exocorpse.net',
    highlights: [
      'Immersive storytelling',
      'Dual-branch narrative',
      'Creative world-building',
    ],
  },
  {
    name: 'AllMind',
    description:
      'A mental health platform inspired by Therapeutic Tabletop Role-Playing Games (TTRPGs) that creates a safe and engaging space for early prevention and intervention activities, fostering holistic health balance and building a resilient generation.',
    category: 'Mental Health & Wellness',
    color: 'cyan',
    logo: '/media/partners/allmind.jpg',
    website: 'https://allmind.info',
    highlights: [
      'Therapeutic TTRPG approach',
      'Safe intervention space',
      'Community-driven wellness',
    ],
  },
  {
    name: 'SOKI',
    description:
      'A start-up beverage brand introducing healthy, refreshing seaweed-based drinks enriched with fucoidan - a natural compound found in brown seaweed known for its wellness benefits. Redefining daily beverages by combining health, creativity and sustainability.',
    category: 'Health & Beverage',
    color: 'pink',
    logo: '/media/partners/soki.jpg',
    website: 'https://www.facebook.com/SOKInuocrongbientieuhoa',
    highlights: [
      'Seaweed-based wellness drinks',
      'Natural fucoidan benefits',
      'Sustainable beverage innovation',
    ],
  },
  {
    name: 'Upskii',
    description:
      'A smart and optimized AI assistant platform for educators in the digital age. This advanced technology solution is tailored for education, enabling educators to streamline teaching tasks, personalize learning, and elevate the student experience.',
    category: 'EdTech & AI',
    color: 'blue',
    logo: '/media/partners/upskii.png',
    website: 'https://www.upskii.com',
    highlights: [
      'AI-powered teaching assistant',
      'Personalized learning experiences',
      'Streamlined educator workflows',
    ],
  },
];

export default function PartnersPage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Animated Background Elements */}
      <motion.div
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.3, 0.4, 0.3],
        }}
        transition={{
          duration: 8,
          repeat: Number.POSITIVE_INFINITY,
          ease: 'easeInOut',
        }}
        className="fixed top-0 -left-32 h-96 w-96 rounded-full bg-linear-to-br from-dynamic-purple/40 via-dynamic-pink/30 to-transparent blur-3xl sm:-left-64"
      />
      <motion.div
        animate={{
          scale: [1, 1.3, 1],
          opacity: [0.2, 0.35, 0.2],
        }}
        transition={{
          duration: 10,
          repeat: Number.POSITIVE_INFINITY,
          ease: 'easeInOut',
          delay: 1,
        }}
        className="fixed top-1/4 -right-32 h-96 w-96 rounded-full bg-linear-to-br from-dynamic-blue/40 via-dynamic-cyan/30 to-transparent blur-3xl sm:-right-64"
      />
      <motion.div
        animate={{
          scale: [1, 1.25, 1],
          opacity: [0.25, 0.35, 0.25],
        }}
        transition={{
          duration: 9,
          repeat: Number.POSITIVE_INFINITY,
          ease: 'easeInOut',
          delay: 2,
        }}
        className="fixed bottom-0 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-linear-to-br from-dynamic-pink/30 via-dynamic-purple/30 to-transparent blur-3xl"
      />

      {/* Grid Pattern Overlay */}
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.015]"
        style={{
          backgroundImage: `
            linear-gradient(to right, currentColor 1px, transparent 1px),
            linear-gradient(to bottom, currentColor 1px, transparent 1px)
          `,
          backgroundSize: '4rem 4rem',
        }}
      />
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.02]"
        style={{
          background: `radial-gradient(circle at 50% 50%, transparent 0%, currentColor 100%)`,
        }}
      />

      <div className="relative z-10">
        {/* Hero Section */}
        <section className="container mx-auto px-4 pt-24 pb-16 sm:px-6 sm:pt-32 sm:pb-20 lg:px-8 lg:pt-40 lg:pb-24">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="mx-auto max-w-5xl text-center"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1, duration: 0.5 }}
            >
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-dynamic-purple/30 bg-dynamic-purple/10 px-4 py-2 font-medium text-dynamic-purple text-sm backdrop-blur-sm transition-all hover:scale-105 hover:bg-dynamic-purple/20 hover:shadow-dynamic-purple/20 hover:shadow-lg">
                <Handshake className="h-4 w-4" />
                Building Together
              </div>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.8 }}
              className="mb-6 text-balance font-bold text-4xl text-foreground tracking-tight sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl"
            >
              Our{' '}
              <span className="animate-gradient bg-linear-to-r from-dynamic-purple via-dynamic-pink to-dynamic-orange bg-clip-text text-transparent">
                Partners
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.8 }}
              className="mx-auto mb-12 max-w-3xl text-balance text-base text-muted-foreground leading-relaxed sm:text-lg md:text-xl lg:text-2xl"
            >
              Collaborating with innovative organizations and communities to
              create meaningful impact and drive technological advancement
              together.
            </motion.p>

            {/* Trust Indicators */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.8 }}
              className="flex flex-col flex-wrap items-center justify-center gap-4 text-muted-foreground text-sm sm:flex-row sm:gap-6"
            >
              <div className="flex items-center gap-2 transition-colors hover:text-foreground">
                <Handshake className="h-4 w-4 text-dynamic-green" />8 Active
                Partnerships
              </div>
              <div className="flex items-center gap-2 transition-colors hover:text-foreground">
                <Users className="h-4 w-4 text-dynamic-blue" />
                10K+ Community Members
              </div>
              <div className="flex items-center gap-2 transition-colors hover:text-foreground">
                <Globe className="h-4 w-4 text-dynamic-purple" />
                25+ Shared Initiatives
              </div>
            </motion.div>
          </motion.div>
        </section>

        {/* Decorative Floating Icons */}
        <div className="pointer-events-none relative mb-24">
          <div className="container mx-auto px-6 sm:px-8 lg:px-12">
            <div className="relative h-32">
              <motion.div
                animate={{
                  y: [0, -20, 0],
                  rotate: [0, 5, 0],
                }}
                transition={{
                  duration: 6,
                  repeat: Number.POSITIVE_INFINITY,
                  ease: 'easeInOut',
                }}
                className="absolute top-1/2 left-[10%]"
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-linear-to-br from-dynamic-purple/20 to-dynamic-pink/10 shadow-dynamic-purple/20 shadow-lg backdrop-blur-xl">
                  <Sparkles className="h-8 w-8 text-dynamic-purple" />
                </div>
              </motion.div>
              <motion.div
                animate={{
                  y: [0, -15, 0],
                  rotate: [0, -5, 0],
                }}
                transition={{
                  duration: 5,
                  repeat: Number.POSITIVE_INFINITY,
                  ease: 'easeInOut',
                  delay: 1,
                }}
                className="absolute top-1/4 right-[15%]"
              >
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-linear-to-br from-dynamic-orange/20 to-dynamic-red/10 shadow-dynamic-orange/20 shadow-lg backdrop-blur-xl">
                  <Target className="h-10 w-10 text-dynamic-orange" />
                </div>
              </motion.div>
              <motion.div
                animate={{
                  y: [0, -25, 0],
                  scale: [1, 1.1, 1],
                }}
                transition={{
                  duration: 7,
                  repeat: Number.POSITIVE_INFINITY,
                  ease: 'easeInOut',
                  delay: 2,
                }}
                className="absolute top-0 left-[60%]"
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-linear-to-br from-dynamic-blue/20 to-dynamic-cyan/10 shadow-dynamic-blue/20 shadow-lg backdrop-blur-xl">
                  <Award className="h-7 w-7 text-dynamic-blue" />
                </div>
              </motion.div>
            </div>
          </div>
        </div>

        {/* Featured Partners */}
        <section className="container mx-auto px-6 pb-24 sm:px-8 lg:px-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-16 text-center"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
            >
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border-2 border-dynamic-purple/40 bg-dynamic-purple/20 px-4 py-2 font-semibold text-dynamic-purple text-sm shadow-dynamic-purple/30 shadow-lg backdrop-blur-sm transition-all hover:scale-105 hover:border-dynamic-purple/60 hover:bg-dynamic-purple/30 hover:shadow-dynamic-purple/40 hover:shadow-xl">
                <Sparkles className="h-4 w-4" />
                Featured Partners
              </div>
            </motion.div>
            <h2 className="mb-4 font-bold text-3xl text-foreground sm:text-4xl lg:text-5xl xl:text-6xl">
              Leading{' '}
              <span className="bg-linear-to-r from-dynamic-purple via-dynamic-pink to-dynamic-orange bg-clip-text text-transparent">
                Partnerships
              </span>
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-muted-foreground sm:text-xl">
              Working with industry leaders and innovative organizations to
              drive growth and impact.
            </p>
          </motion.div>

          {/* Bento Grid Layout for Featured Partners */}
          <div className="grid gap-6 md:grid-cols-6 lg:gap-8">
            {partners
              .filter((p) => p.featured)
              .map((partner, index) => {
                const colorClasses = {
                  purple: {
                    gradient: 'from-dynamic-purple/20 via-dynamic-purple/5',
                    border:
                      'border-dynamic-purple/40 hover:border-dynamic-purple/70',
                    glow: 'hover:shadow-dynamic-purple/30',
                    ringGlow: 'ring-dynamic-purple/50',
                    badge:
                      'border-dynamic-purple bg-dynamic-purple/10 text-dynamic-purple shadow-dynamic-purple/30',
                  },
                  orange: {
                    gradient: 'from-dynamic-orange/20 via-dynamic-orange/5',
                    border:
                      'border-dynamic-orange/40 hover:border-dynamic-orange/70',
                    glow: 'hover:shadow-dynamic-orange/30',
                    ringGlow: 'ring-dynamic-orange/50',
                    badge:
                      'border-dynamic-orange bg-dynamic-orange/10 text-dynamic-orange shadow-dynamic-orange/30',
                  },
                  red: {
                    gradient: 'from-dynamic-red/20 via-dynamic-red/5',
                    border: 'border-dynamic-red/40 hover:border-dynamic-red/70',
                    glow: 'hover:shadow-dynamic-red/30',
                    ringGlow: 'ring-dynamic-red/50',
                    badge:
                      'border-dynamic-red bg-dynamic-red/10 text-dynamic-red shadow-dynamic-red/30',
                  },
                };
                const colors =
                  colorClasses[partner.color as keyof typeof colorClasses];

                // Special layout: Google spans 2 columns, others span full width on different rows
                const gridClass =
                  index === 2 ? 'md:col-span-6' : 'md:col-span-3';

                return (
                  <motion.div
                    key={partner.name}
                    initial={{ opacity: 0, y: 20, scale: 0.95 }}
                    whileInView={{ opacity: 1, y: 0, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{
                      delay: index * 0.1,
                      duration: 0.5,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                    className={gridClass}
                  >
                    <div className="relative h-full">
                      {/* Animated Ring Effect */}
                      <motion.div
                        className={`pointer-events-none absolute -inset-1 rounded-2xl opacity-0 transition-opacity duration-700 group-hover:opacity-100 ${colors.ringGlow}`}
                        animate={{
                          boxShadow: [
                            '0 0 0 0px currentColor',
                            '0 0 0 4px transparent',
                            '0 0 0 0px currentColor',
                          ],
                        }}
                        transition={{
                          duration: 2,
                          repeat: Number.POSITIVE_INFINITY,
                          ease: 'easeInOut',
                        }}
                        style={{
                          boxShadow: '0 0 20px 2px currentColor',
                        }}
                      />

                      <Card
                        className={`group relative h-full overflow-hidden bg-linear-to-br to-background backdrop-blur-sm transition-all duration-700 hover:scale-[1.02] hover:shadow-2xl ${colors.border} ${colors.glow}`}
                      >
                        <Link
                          href={partner.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block"
                        >
                          {/* Image Container with Overlay */}
                          <div className="relative overflow-hidden">
                            <div
                              className={`absolute inset-0 bg-linear-to-br ${colors.gradient} to-background opacity-40 transition-opacity duration-700 group-hover:opacity-60`}
                            />
                            <div className="absolute inset-0 bg-linear-to-t from-background via-transparent to-transparent opacity-60" />

                            {/* Sparkle Effects in Corners */}
                            <motion.div
                              animate={{
                                opacity: [0.5, 1, 0.5],
                                scale: [1, 1.2, 1],
                              }}
                              transition={{
                                duration: 2,
                                repeat: Number.POSITIVE_INFINITY,
                                delay: index * 0.3,
                              }}
                              className="absolute top-4 right-4 z-10"
                            >
                              <Sparkles className="h-5 w-5 text-foreground/60" />
                            </motion.div>

                            {/* Image with proper aspect ratio handling */}
                            <div className="relative aspect-[21/9] w-full overflow-hidden bg-linear-to-br from-muted/30 to-background">
                              <Image
                                src={partner.logo}
                                alt={partner.name}
                                fill
                                className="object-cover object-center transition-all duration-700 group-hover:scale-105 group-hover:brightness-110"
                                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                              />
                            </div>
                          </div>

                          {/* Content Section */}
                          <div className="relative p-6 md:p-8">
                            {/* Category Badge - Much More Visible */}
                            <div className="mb-3 inline-block">
                              <motion.div
                                whileHover={{ scale: 1.1 }}
                                transition={{ type: 'spring', stiffness: 400 }}
                                className={`mb-4 rounded-full border-2 px-4 py-2 font-bold text-xs uppercase tracking-wide shadow-lg backdrop-blur-lg transition-all duration-300 ${colors.badge}`}
                              >
                                {partner.category}
                              </motion.div>
                            </div>

                            <h3 className="mb-2 font-bold text-2xl text-foreground transition-colors duration-300 group-hover:text-dynamic-purple lg:text-3xl">
                              {partner.name}
                            </h3>

                            <p className="mb-4 line-clamp-2 text-muted-foreground leading-relaxed">
                              {partner.description}
                            </p>

                            {/* Highlights - Show on featured */}
                            <div className="space-y-2">
                              {partner.highlights
                                .slice(0, 3)
                                .map((highlight) => (
                                  <div
                                    key={highlight}
                                    className="flex items-start gap-2 text-sm"
                                  >
                                    <ArrowRight
                                      className={`mt-0.5 h-4 w-4 shrink-0 transition-transform duration-300 group-hover:translate-x-1 ${
                                        partner.color === 'purple'
                                          ? 'text-dynamic-purple'
                                          : partner.color === 'orange'
                                            ? 'text-dynamic-orange'
                                            : 'text-dynamic-red'
                                      }`}
                                    />
                                    <span className="text-muted-foreground">
                                      {highlight}
                                    </span>
                                  </div>
                                ))}
                            </div>

                            {/* Visit Website Indicator */}
                            <div className="mt-6 flex items-center gap-2 font-medium text-dynamic-purple text-sm opacity-0 transition-all duration-300 group-hover:opacity-100">
                              <span>Visit Website</span>
                              <ExternalLink className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-1" />
                            </div>
                          </div>
                        </Link>
                      </Card>
                    </div>
                  </motion.div>
                );
              })}
          </div>
        </section>

        {/* Decorative Connector */}
        <div className="pointer-events-none relative mb-20">
          <div className="container mx-auto px-6 sm:px-8 lg:px-12">
            <div className="relative h-24">
              <motion.div
                animate={{
                  rotate: [0, 360],
                }}
                transition={{
                  duration: 20,
                  repeat: Number.POSITIVE_INFINITY,
                  ease: 'linear',
                }}
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
              >
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-linear-to-br from-dynamic-cyan/20 via-dynamic-blue/20 to-dynamic-purple/20 shadow-2xl shadow-dynamic-blue/30 ring-2 ring-dynamic-blue/40 backdrop-blur-xl">
                  <Zap className="h-10 w-10 text-dynamic-blue" />
                </div>
              </motion.div>

              {/* Surrounding Elements */}
              <motion.div
                animate={{
                  scale: [1, 1.2, 1],
                  opacity: [0.4, 0.7, 0.4],
                }}
                transition={{
                  duration: 3,
                  repeat: Number.POSITIVE_INFINITY,
                  ease: 'easeInOut',
                }}
                className="absolute top-1/2 left-[30%] -translate-y-1/2"
              >
                <div className="h-3 w-3 rounded-full bg-linear-to-r from-dynamic-cyan to-dynamic-blue shadow-dynamic-cyan/50 shadow-lg" />
              </motion.div>
              <motion.div
                animate={{
                  scale: [1, 1.2, 1],
                  opacity: [0.4, 0.7, 0.4],
                }}
                transition={{
                  duration: 3,
                  repeat: Number.POSITIVE_INFINITY,
                  ease: 'easeInOut',
                  delay: 0.5,
                }}
                className="absolute top-1/2 right-[30%] -translate-y-1/2"
              >
                <div className="h-3 w-3 rounded-full bg-linear-to-r from-dynamic-purple to-dynamic-pink shadow-dynamic-purple/50 shadow-lg" />
              </motion.div>
            </div>
          </div>
        </div>

        {/* All Partners */}
        <section className="container mx-auto px-6 pb-32 sm:px-8 lg:px-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-16 text-center"
          >
            <h2 className="mb-4 font-bold text-3xl text-foreground sm:text-4xl lg:text-5xl xl:text-6xl">
              Our{' '}
              <span className="bg-linear-to-r from-dynamic-cyan via-dynamic-blue to-dynamic-purple bg-clip-text text-transparent">
                Ecosystem
              </span>
            </h2>
            <p className="mx-auto max-w-2xl text-lg text-muted-foreground sm:text-xl">
              A diverse ecosystem of organizations working together to create
              impact across multiple domains.
            </p>
          </motion.div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {partners.map((partner, index) => {
              const colorClasses = {
                purple: {
                  border:
                    'border-dynamic-purple/40 hover:border-dynamic-purple/70',
                  gradient: 'from-dynamic-purple/20 via-dynamic-purple/5',
                  overlay: 'group-hover:from-dynamic-purple/10',
                  badge:
                    'border-dynamic-purple bg-dynamic-purple/10 text-dynamic-purple shadow-dynamic-purple/20',
                  icon: 'text-dynamic-purple',
                  glow: 'hover:shadow-dynamic-purple/20',
                  ringGlow: 'ring-dynamic-purple/40',
                },
                orange: {
                  border:
                    'border-dynamic-orange/40 hover:border-dynamic-orange/70',
                  gradient: 'from-dynamic-orange/20 via-dynamic-orange/5',
                  overlay: 'group-hover:from-dynamic-orange/10',
                  badge:
                    'border-dynamic-orange bg-dynamic-orange/10 text-dynamic-orange shadow-dynamic-orange/20',
                  icon: 'text-dynamic-orange',
                  glow: 'hover:shadow-dynamic-orange/20',
                  ringGlow: 'ring-dynamic-orange/40',
                },
                red: {
                  border: 'border-dynamic-red/40 hover:border-dynamic-red/70',
                  gradient: 'from-dynamic-red/20 via-dynamic-red/5',
                  overlay: 'group-hover:from-dynamic-red/10',
                  badge:
                    'border-dynamic-red bg-dynamic-red/10 text-dynamic-red shadow-dynamic-red/20',
                  icon: 'text-dynamic-red',
                  glow: 'hover:shadow-dynamic-red/20',
                  ringGlow: 'ring-dynamic-red/40',
                },
                blue: {
                  border: 'border-dynamic-blue/40 hover:border-dynamic-blue/70',
                  gradient: 'from-dynamic-blue/20 via-dynamic-blue/5',
                  overlay: 'group-hover:from-dynamic-blue/10',
                  badge:
                    'border-dynamic-blue bg-dynamic-blue/10 text-dynamic-blue shadow-dynamic-blue/20',
                  icon: 'text-dynamic-blue',
                  glow: 'hover:shadow-dynamic-blue/20',
                  ringGlow: 'ring-dynamic-blue/40',
                },
                green: {
                  border:
                    'border-dynamic-green/40 hover:border-dynamic-green/70',
                  gradient: 'from-dynamic-green/20 via-dynamic-green/5',
                  overlay: 'group-hover:from-dynamic-green/10',
                  badge:
                    'border-dynamic-green bg-dynamic-green/10 text-dynamic-green shadow-dynamic-green/20',
                  icon: 'text-dynamic-green',
                  glow: 'hover:shadow-dynamic-green/20',
                  ringGlow: 'ring-dynamic-green/40',
                },
                cyan: {
                  border: 'border-dynamic-cyan/40 hover:border-dynamic-cyan/70',
                  gradient: 'from-dynamic-cyan/20 via-dynamic-cyan/5',
                  overlay: 'group-hover:from-dynamic-cyan/10',
                  badge:
                    'border-dynamic-cyan bg-dynamic-cyan/10 text-dynamic-cyan shadow-dynamic-cyan/20',
                  icon: 'text-dynamic-cyan',
                  glow: 'hover:shadow-dynamic-cyan/20',
                  ringGlow: 'ring-dynamic-cyan/40',
                },
                pink: {
                  border: 'border-dynamic-pink/40 hover:border-dynamic-pink/70',
                  gradient: 'from-dynamic-pink/20 via-dynamic-pink/5',
                  overlay: 'group-hover:from-dynamic-pink/10',
                  badge:
                    'border-dynamic-pink bg-dynamic-pink/10 text-dynamic-pink shadow-dynamic-pink/20',
                  icon: 'text-dynamic-pink',
                  glow: 'hover:shadow-dynamic-pink/20',
                  ringGlow: 'ring-dynamic-pink/40',
                },
              };

              const colors =
                colorClasses[partner.color as keyof typeof colorClasses];

              return (
                <motion.div
                  key={partner.name}
                  initial={{ opacity: 0, y: 20, scale: 0.9 }}
                  whileInView={{ opacity: 1, y: 0, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{
                    delay: index * 0.05,
                    duration: 0.4,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                >
                  <div className="relative h-full">
                    {/* Animated Glow Ring */}
                    <motion.div
                      className={`pointer-events-none absolute -inset-0.5 rounded-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-100 ${colors.ringGlow}`}
                      animate={{
                        boxShadow: [
                          '0 0 0 0px currentColor',
                          '0 0 0 2px transparent',
                          '0 0 0 0px currentColor',
                        ],
                      }}
                      transition={{
                        duration: 1.5,
                        repeat: Number.POSITIVE_INFINITY,
                        ease: 'easeInOut',
                      }}
                      style={{
                        boxShadow: '0 0 15px 1px currentColor',
                      }}
                    />

                    <Card
                      className={`group relative h-full overflow-hidden bg-linear-to-br to-background backdrop-blur-sm transition-all duration-500 hover:scale-[1.03] hover:shadow-2xl ${colors.border} ${colors.glow}`}
                    >
                      <Link
                        href={partner.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block h-full"
                      >
                        {/* Image Section with Overlay Effects */}
                        <div className="relative overflow-hidden">
                          {/* Gradient Overlay */}
                          <div
                            className={`absolute inset-0 bg-linear-to-br ${colors.gradient} to-background opacity-30 transition-opacity duration-500 group-hover:opacity-50`}
                          />

                          {/* Bottom Fade */}
                          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-t from-background via-background/50 to-transparent opacity-70" />

                          {/* Floating Sparkle */}
                          <motion.div
                            animate={{
                              opacity: [0.3, 0.7, 0.3],
                              y: [0, -5, 0],
                            }}
                            transition={{
                              duration: 2.5,
                              repeat: Number.POSITIVE_INFINITY,
                              delay: index * 0.2,
                            }}
                            className="absolute top-3 left-3 z-10"
                          >
                            <Sparkles className="h-4 w-4 text-foreground/50" />
                          </motion.div>

                          {/* Image with aspect ratio */}
                          <div className="relative aspect-[16/9] w-full overflow-hidden bg-linear-to-br from-muted/20 to-background">
                            <Image
                              src={partner.logo}
                              alt={partner.name}
                              fill
                              className="object-cover object-center transition-all duration-700 group-hover:scale-110 group-hover:brightness-105"
                              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw"
                            />
                          </div>
                        </div>

                        {/* Content Section */}
                        <div className="relative p-5">
                          {/* Category Badge - Outside Image, Highly Visible */}
                          <div className="mb-3 inline-block">
                            <motion.div
                              whileHover={{ scale: 1.1, y: -2 }}
                              transition={{ type: 'spring', stiffness: 400 }}
                              className={`rounded-lg border-2 px-2 py-1 font-semibold text-xs tracking-wide shadow-lg backdrop-blur-lg transition-all duration-300 ${colors.badge}`}
                            >
                              {partner.category}
                            </motion.div>
                          </div>

                          <h3 className="mb-2 line-clamp-2 font-bold text-foreground text-lg transition-colors duration-300 group-hover:text-dynamic-purple">
                            {partner.name}
                          </h3>

                          <p className="mb-4 line-clamp-2 text-muted-foreground text-sm leading-relaxed">
                            {partner.description}
                          </p>

                          {/* Highlights */}
                          <div className="space-y-1.5">
                            {partner.highlights.slice(0, 2).map((highlight) => (
                              <div
                                key={highlight}
                                className="flex items-start gap-1.5 text-xs"
                              >
                                <ArrowRight
                                  className={`mt-0.5 h-3 w-3 shrink-0 transition-transform duration-300 group-hover:translate-x-0.5 ${colors.icon}`}
                                />
                                <span className="line-clamp-1 text-muted-foreground">
                                  {highlight}
                                </span>
                              </div>
                            ))}
                          </div>

                          {/* Visit Link */}
                          <div className="mt-4 flex items-center gap-2 font-medium text-dynamic-purple text-sm opacity-0 transition-all duration-300 group-hover:opacity-100">
                            <span>Explore</span>
                            <ExternalLink className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-1" />
                          </div>
                        </div>
                      </Link>
                    </Card>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* CTA Section */}
        <section className="container mx-auto px-6 pb-32 sm:px-8 lg:px-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <Card className="relative overflow-hidden border-dynamic-purple/30 bg-linear-to-br from-dynamic-purple/10 via-dynamic-pink/5 to-background p-12 backdrop-blur-sm md:p-16 lg:p-20">
              {/* Decorative Floating Orbs */}
              <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-50">
                <motion.div
                  animate={{
                    scale: [1, 1.2, 1],
                    opacity: [0.3, 0.5, 0.3],
                  }}
                  transition={{
                    duration: 8,
                    repeat: Number.POSITIVE_INFINITY,
                    ease: 'easeInOut',
                  }}
                  className="absolute top-0 -left-32 h-80 w-80 rounded-full bg-linear-to-br from-dynamic-purple/40 to-transparent blur-3xl"
                />
                <motion.div
                  animate={{
                    scale: [1, 1.3, 1],
                    opacity: [0.2, 0.4, 0.2],
                  }}
                  transition={{
                    duration: 10,
                    repeat: Number.POSITIVE_INFINITY,
                    ease: 'easeInOut',
                    delay: 1,
                  }}
                  className="absolute -right-32 bottom-0 h-80 w-80 rounded-full bg-linear-to-br from-dynamic-pink/40 to-transparent blur-3xl"
                />
                <motion.div
                  animate={{
                    scale: [1, 1.25, 1],
                    opacity: [0.25, 0.45, 0.25],
                  }}
                  transition={{
                    duration: 12,
                    repeat: Number.POSITIVE_INFINITY,
                    ease: 'easeInOut',
                    delay: 2,
                  }}
                  className="absolute bottom-1/4 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-linear-to-br from-dynamic-orange/30 to-transparent blur-3xl"
                />
              </div>

              <div className="relative text-center">
                {/* Icon */}
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  whileInView={{ scale: 1, opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.2, duration: 0.5 }}
                  className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-2xl bg-linear-to-br from-dynamic-purple/20 to-dynamic-pink/20 backdrop-blur-sm"
                >
                  <Handshake className="h-10 w-10 text-dynamic-purple" />
                </motion.div>

                <motion.h2
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.3, duration: 0.6 }}
                  className="mb-6 font-bold text-3xl text-foreground sm:text-4xl lg:text-5xl xl:text-6xl"
                >
                  Interested in{' '}
                  <span className="bg-linear-to-r from-dynamic-purple via-dynamic-pink to-dynamic-orange bg-clip-text text-transparent">
                    Partnering?
                  </span>
                </motion.h2>

                <motion.p
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.4, duration: 0.6 }}
                  className="mx-auto mb-10 max-w-2xl text-lg text-muted-foreground leading-relaxed sm:text-xl"
                >
                  We're always looking to collaborate with organizations that
                  share our vision for innovation, education, and community
                  building. Let's create impact together.
                </motion.p>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.5, duration: 0.6 }}
                  className="mb-8 flex flex-col flex-wrap items-center justify-center gap-4 sm:flex-row"
                >
                  <Button
                    asChild
                    size="lg"
                    className="group w-full shadow-lg transition-all hover:scale-105 hover:shadow-xl sm:w-auto"
                  >
                    <Link href="mailto:partners@tuturuuu.com">
                      Get in Touch
                      <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                    </Link>
                  </Button>
                  <Button
                    asChild
                    size="lg"
                    variant="outline"
                    className="w-full transition-all hover:scale-105 sm:w-auto"
                  >
                    <Link href="/about">
                      Learn More About Us
                      <Sparkles className="ml-2 h-5 w-5" />
                    </Link>
                  </Button>
                </motion.div>

                {/* Trust Indicators */}
                <motion.div
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.6, duration: 0.6 }}
                  className="flex flex-col flex-wrap items-center justify-center gap-4 text-muted-foreground text-sm sm:flex-row sm:gap-6"
                >
                  <div className="flex items-center gap-2 transition-colors hover:text-foreground">
                    <Globe className="h-4 w-4 text-dynamic-green" />8 Active
                    Partnerships
                  </div>
                  <div className="flex items-center gap-2 transition-colors hover:text-foreground">
                    <Users className="h-4 w-4 text-dynamic-blue" />
                    10K+ Community Members
                  </div>
                  <div className="flex items-center gap-2 transition-colors hover:text-foreground">
                    <Sparkles className="h-4 w-4 text-dynamic-purple" />
                    Growing Impact
                  </div>
                </motion.div>
              </div>
            </Card>
          </motion.div>
        </section>
      </div>
    </div>
  );
}
