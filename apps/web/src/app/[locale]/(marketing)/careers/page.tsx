'use client';

import { Badge } from '@tutur3u/ui/badge';
import { Card } from '@tutur3u/ui/card';
import { motion, useScroll, useTransform } from 'framer-motion';
import {
  Building2,
  Clock,
  Code2,
  Compass,
  Github,
  Globe2,
  GraduationCap,
  Heart,
  Laptop,
  LayoutGrid,
  Mail,
  MapPin,
  MessageCircle,
  Rocket,
  Shield,
  Sparkles,
  Star,
  Sun,
  Timer,
  Users2,
} from 'lucide-react';
import { ReactNode, useRef } from 'react';

interface ValueProps {
  icon: ReactNode;
  title: string;
  description: string;
}

const values: ValueProps[] = [
  {
    icon: <Globe2 className="h-8 w-8 text-primary" />,
    title: 'Think Big',
    description:
      'We believe in bold visions and transformative ideas that can reshape how technology serves humanity.',
  },
  {
    icon: <Laptop className="h-8 w-8 text-primary" />,
    title: 'Build Better',
    description:
      'We are obsessed with quality and craftsmanship, creating technology that is both powerful and beautiful.',
  },
  {
    icon: <Sun className="h-8 w-8 text-primary" />,
    title: 'Grow Together',
    description:
      'We foster an environment where creativity thrives and every team member can reach their full potential.',
  },
  {
    icon: <Rocket className="h-8 w-8 text-primary" />,
    title: 'Dream Bigger',
    description:
      'We are not just building products; we are creating a future where technology empowers everyone.',
  },
];

const benefits: ValueProps[] = [
  {
    icon: <Clock className="h-8 w-8 text-primary" />,
    title: 'Flexible Hours',
    description:
      'Work when you are most productive. We trust our team to manage their time effectively.',
  },
  {
    icon: <GraduationCap className="h-8 w-8 text-primary" />,
    title: 'Learning & Growth',
    description:
      'Industry-leading learning budget and resources for courses, conferences, and professional development.',
  },
  {
    icon: <Users2 className="h-8 w-8 text-primary" />,
    title: 'Team Events',
    description:
      'Regular team activities and gatherings to build strong connections, with plans for global expansion.',
  },
  {
    icon: <Heart className="h-8 w-8 text-primary" />,
    title: 'Premium Benefits',
    description:
      'Top-tier health coverage, wellness programs, and comprehensive benefits package to keep you at your best.',
  },
];

const culturalPillars: ValueProps[] = [
  {
    icon: <Sparkles className="h-8 w-8 text-primary" />,
    title: 'Innovation DNA',
    description:
      'We see possibilities where others see limitations, constantly pushing boundaries to create breakthrough solutions.',
  },
  {
    icon: <MessageCircle className="h-8 w-8 text-primary" />,
    title: 'Radical Transparency',
    description:
      'We believe in open, honest communication and sharing both our successes and learnings openly.',
  },
  {
    icon: <Star className="h-8 w-8 text-primary" />,
    title: 'Craftsman Spirit',
    description:
      'We take pride in our work, paying attention to every detail and striving for excellence in everything we create.',
  },
  {
    icon: <Compass className="h-8 w-8 text-primary" />,
    title: 'Visionary Focus',
    description:
      'We are guided by our mission to democratize technology and make powerful tools accessible to everyone.',
  },
];

const teamHighlights: ValueProps[] = [
  {
    icon: <MapPin className="h-8 w-8 text-primary" />,
    title: 'Global Vision',
    description:
      'Currently based in Vietnam, we are building a foundation to expand globally and serve users worldwide.',
  },
  {
    icon: <Code2 className="h-8 w-8 text-primary" />,
    title: 'Tech Excellence',
    description:
      'We use and contribute to cutting-edge technologies, striving to be at the forefront of technological innovation.',
  },
  {
    icon: <LayoutGrid className="h-8 w-8 text-primary" />,
    title: 'Best-in-Class',
    description:
      'We aim to provide the best compensation, benefits, and work environment in the industry.',
  },
  {
    icon: <Building2 className="h-8 w-8 text-primary" />,
    title: 'Startup Spirit',
    description:
      'Experience the energy and impact of a fast-growing startup that dreams big and executes with precision.',
  },
];

interface BadgeProps {
  icon: ReactNode;
  text: string;
}

const badges: BadgeProps[] = [
  {
    icon: <Star className="h-5 w-5 animate-pulse" />,
    text: 'Visionary Mindset',
  },
  {
    icon: (
      <Sparkles className="h-5 w-5 animate-[pulse_2s_ease-in-out_infinite]" />
    ),
    text: 'Creative Excellence',
  },
  {
    icon: (
      <Globe2 className="h-5 w-5 animate-[pulse_3s_ease-in-out_infinite]" />
    ),
    text: 'Global Impact',
  },
];

export default function CareersPage() {
  const containerRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  });

  const y = useTransform(scrollYProgress, [0, 1], ['0%', '100%']);
  const opacity = useTransform(scrollYProgress, [0, 0.5, 1], [1, 0.5, 0]);

  return (
    <main ref={containerRef} className="relative mx-auto overflow-x-clip pb-12">
      {/* Enhanced Floating Orbs - Adjusted for mobile */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: 'linear',
          }}
          style={{ y }}
          className="absolute top-0 -left-[8rem] h-[20rem] w-[20rem] rounded-full bg-gradient-to-br from-purple-500/30 via-pink-500/20 to-transparent blur-3xl sm:-left-64 sm:h-[40rem] sm:w-[40rem]"
        />
        <motion.div
          animate={{
            scale: [1, 1.1, 1],
            opacity: [0.2, 0.4, 0.2],
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: 'linear',
          }}
          style={{ y: opacity }}
          className="absolute top-[30%] -right-[8rem] h-[17.5rem] w-[17.5rem] rounded-full bg-gradient-to-br from-blue-500/30 via-cyan-500/20 to-transparent blur-3xl sm:-right-64 sm:h-[35rem] sm:w-[35rem]"
        />
        <motion.div
          animate={{
            scale: [1, 1.3, 1],
            opacity: [0.2, 0.3, 0.2],
          }}
          transition={{
            duration: 12,
            repeat: Infinity,
            ease: 'linear',
          }}
          className="absolute -bottom-32 left-1/2 h-[22.5rem] w-[22.5rem] -translate-x-1/2 rounded-full bg-gradient-to-br from-green-500/20 via-emerald-500/15 to-transparent blur-3xl sm:-bottom-64 sm:h-[45rem] sm:w-[45rem]"
        />
      </div>

      <div className="container space-y-16 px-4 pt-12 sm:space-y-24 sm:pt-16">
        {/* Enhanced Background Patterns */}
        <div className="pointer-events-none fixed inset-0 -z-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(var(--primary-rgb),0.05)_1px,transparent_1px)] bg-[size:24px_24px]" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(var(--primary-rgb),0.02)_1px,transparent_1px)] bg-[size:120px] opacity-20" />
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.1, 0.15, 0.1] }}
            transition={{
              duration: 5,
              repeat: Infinity,
              ease: 'linear',
            }}
            className="absolute inset-0 bg-[conic-gradient(from_0deg_at_50%_50%,rgba(var(--primary-rgb),0.05),transparent)]"
          />
        </div>

        {/* Hero Section */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative text-center"
        >
          {/* Enhanced background effects */}
          <div className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute inset-0 bg-[radial-gradient(circle_500px_at_50%_50%,rgba(var(--primary-rgb),0.15),transparent)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_700px_at_30%_50%,rgba(var(--primary-rgb),0.1),transparent)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_600px_at_70%_50%,rgba(var(--primary-rgb),0.1),transparent)]" />
            <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(var(--primary-rgb),0.05)_1px,transparent_1px)] bg-[size:40px] opacity-20" />
            <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(var(--primary-rgb),0.05)_1px,transparent_1px)] bg-[size:40px] opacity-20" />
          </div>

          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="relative"
          >
            <Badge
              variant="secondary"
              className="relative mb-6 cursor-default transition-colors hover:bg-primary/20"
            >
              <span className="relative bg-gradient-to-r from-primary via-primary/80 to-primary bg-clip-text text-transparent">
                Join Our Vision
              </span>
            </Badge>
          </motion.div>

          <motion.h1
            className="mb-6 text-4xl font-bold tracking-tight text-balance text-foreground md:text-7xl"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.5 }}
          >
            Shape{' '}
            <span className="inline-block">
              <span className="bg-gradient-to-r from-primary via-purple-500 to-pink-500 bg-clip-text text-transparent">
                Tomorrow's
              </span>
            </span>{' '}
            <br />
            <span className="bg-gradient-to-r from-primary via-blue-500 to-cyan-500 bg-clip-text text-transparent">
              Technology
            </span>
          </motion.h1>

          <motion.p
            className="mx-auto mb-12 max-w-2xl text-lg leading-relaxed text-balance text-foreground/80 md:text-xl"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.5 }}
          >
            At Tuturuuu, we're building a world-class team starting from
            Vietnam, with a vision to expand globally. We're looking for
            visionaries who share our passion for{' '}
            <strong className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text font-bold text-transparent">
              creating beautiful, impactful technology
            </strong>{' '}
            that makes a difference in people's lives.
          </motion.p>

          <div className="flex flex-wrap justify-center gap-4">
            {badges.map((badge, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 + index * 0.1 }}
                whileHover={{ scale: 1.05 }}
                className="flex cursor-default items-center gap-2 rounded-full bg-gradient-to-r from-foreground/5 to-foreground/10 px-4 py-2 transition-colors hover:from-primary/10 hover:to-primary/5"
              >
                <span className="text-primary">{badge.icon}</span>
                <span className="text-sm font-medium text-foreground/80">
                  {badge.text}
                </span>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* Get in Touch Section */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative"
        >
          <div className="absolute inset-0 -z-10">
            <div className="absolute inset-0 bg-[radial-gradient(circle_800px_at_50%_50%,rgba(var(--primary-rgb),0.15),transparent)]" />
            <div className="absolute inset-0 bg-[conic-gradient(from_0deg_at_50%_50%,rgba(var(--primary-rgb),0.05),transparent)]" />
            <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(var(--primary-rgb),0.02)_1px,transparent_1px)] bg-[size:100px] opacity-20" />
          </div>

          <div className="relative mx-auto max-w-6xl">
            <Card className="group relative overflow-hidden">
              <div className="absolute inset-0">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-purple-500/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(var(--primary-rgb),0.05)_1px,transparent_1px)] bg-[size:20px_20px]" />
                <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(var(--primary-rgb),0.02)_1px,transparent_1px)] bg-[size:100px] opacity-20" />
                <div className="absolute -top-32 -left-32 h-64 w-64 rounded-full bg-gradient-to-br from-purple-500/30 via-pink-500/20 to-transparent blur-3xl" />
                <div className="absolute -right-32 -bottom-32 h-64 w-64 rounded-full bg-gradient-to-br from-blue-500/30 via-cyan-500/20 to-transparent blur-3xl" />
              </div>

              <div className="relative grid gap-12 p-4 md:grid-cols-2 md:p-12">
                <div className="relative space-y-8">
                  <motion.div
                    initial={{ scale: 0.95 }}
                    whileHover={{ scale: 1 }}
                    className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 transition-colors duration-300 group-hover:bg-primary/20 md:mx-0"
                  >
                    <div className="animate-spin-slow absolute -inset-1 rounded-2xl bg-gradient-to-r from-purple-500/20 via-pink-500/20 to-purple-500/20" />
                    <div className="absolute inset-[2px] rounded-xl bg-background/80 backdrop-blur-sm" />
                    <Mail className="relative h-10 w-10 text-primary" />
                  </motion.div>

                  <div className="space-y-4 text-center md:text-left">
                    <h2 className="text-4xl font-bold text-foreground">
                      <span className="bg-gradient-to-r from-primary via-purple-500 to-pink-500 bg-clip-text text-transparent">
                        Shape the Future with Us
                      </span>
                    </h2>
                    <p className="mx-auto max-w-2xl text-lg text-foreground/80">
                      While we don't have any open positions at the moment,
                      we're always excited to connect with talented individuals
                      who share our vision.
                    </p>
                  </div>

                  <div className="flex flex-wrap justify-center gap-4 md:justify-start">
                    <motion.a
                      href="mailto:contact@tuturuuu.com"
                      className="group relative inline-flex items-center gap-2 overflow-hidden rounded-lg bg-foreground px-8 py-4 font-semibold text-background transition-all duration-300 hover:bg-foreground/90"
                      whileHover={{ scale: 1.05 }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-primary/0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                      <Mail className="relative h-5 w-5" />
                      <span className="relative">Get in Touch</span>
                    </motion.a>

                    <motion.a
                      href="https://github.com/tutur3u"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group relative inline-flex items-center gap-2 overflow-hidden rounded-lg bg-foreground/10 px-8 py-4 font-semibold transition-all duration-300 hover:bg-foreground/20"
                      whileHover={{ scale: 1.05 }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-primary/0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                      <Github className="relative h-5 w-5" />
                      <span className="relative">View Our Work</span>
                    </motion.a>
                  </div>

                  <div className="flex flex-wrap justify-center gap-6 md:justify-start">
                    <div className="flex items-center gap-2">
                      <Timer className="h-5 w-5 text-primary" />
                      <span className="text-sm text-foreground/60">
                        Quick Response
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Shield className="h-5 w-5 text-primary" />
                      <span className="text-sm text-foreground/60">
                        Secure Communication
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Globe2 className="h-5 w-5 text-primary" />
                      <span className="text-sm text-foreground/60">
                        Global Opportunities
                      </span>
                    </div>
                  </div>
                </div>

                <div className="relative">
                  <div className="group relative overflow-hidden rounded-2xl bg-foreground/5 p-4 backdrop-blur-sm md:p-8">
                    <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-pink-500/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                    <div className="relative space-y-6">
                      <h3 className="text-center text-2xl font-bold text-balance text-foreground">
                        What We're Looking For
                      </h3>
                      <div className="space-y-4">
                        <div className="flex flex-col items-center gap-3 rounded-lg border border-primary/10 bg-background/50 p-4 text-center backdrop-blur-sm md:flex-row">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                            <Code2 className="h-5 w-5 text-primary" />
                          </div>
                          <div className="flex flex-col items-start">
                            <h4 className="font-semibold">
                              Technical Excellence
                            </h4>
                            <p className="text-sm text-foreground/60">
                              Strong problem-solving abilities
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-col items-center gap-3 rounded-lg border border-primary/10 bg-background/50 p-4 text-center backdrop-blur-sm md:flex-row">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                            <Users2 className="h-5 w-5 text-primary" />
                          </div>
                          <div className="flex flex-col items-start">
                            <h4 className="font-semibold">Team Player</h4>
                            <p className="text-sm text-foreground/60">
                              Collaborative mindset
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-col items-center gap-3 rounded-lg border border-primary/10 bg-background/50 p-4 text-center backdrop-blur-sm md:flex-row">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                            <Rocket className="h-5 w-5 text-primary" />
                          </div>
                          <div className="flex flex-col items-start">
                            <h4 className="font-semibold">Growth Mindset</h4>
                            <p className="text-sm text-foreground/60">
                              Eager to learn and grow
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-col items-center gap-3 rounded-lg border border-primary/10 bg-background/50 p-4 text-center backdrop-blur-sm md:flex-row">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                            <Globe2 className="h-5 w-5 text-primary" />
                          </div>
                          <div className="flex flex-col items-start">
                            <h4 className="font-semibold">Global Vision</h4>
                            <p className="text-sm text-foreground/60">
                              International mindset
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="mt-6 text-center text-sm text-foreground/60">
                        Email us at{' '}
                        <span className="font-semibold text-primary">
                          contact@tuturuuu.com
                        </span>
                        <br />
                        with your story and future role in mind
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </motion.section>

        {/* Values Section - Enhanced with Creative UI */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative"
        >
          <div className="absolute inset-0 -z-10">
            <motion.div
              animate={{
                opacity: [0.1, 0.15, 0.1],
                scale: [1, 1.1, 1],
              }}
              transition={{
                duration: 8,
                repeat: Infinity,
                ease: 'linear',
              }}
              className="absolute inset-0 bg-[radial-gradient(circle_800px_at_50%_50%,rgba(var(--primary-rgb),0.15),transparent)]"
            />
            <motion.div
              animate={{
                rotate: [0, 360],
              }}
              transition={{
                duration: 60,
                repeat: Infinity,
                ease: 'linear',
              }}
              className="absolute inset-0 bg-[conic-gradient(from_270deg_at_50%_50%,rgba(var(--primary-rgb),0.05),transparent)]"
            />
            <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(var(--primary-rgb),0.02)_1px,transparent_1px)] bg-[size:100px] opacity-20" />
          </div>

          <div className="relative text-center">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              whileInView={{ scale: 1, opacity: 1 }}
              viewport={{ once: true }}
              className="mb-16"
            >
              <motion.div
                whileHover={{
                  scale: 1.1,
                  rotate: [0, 10, -10, 0],
                }}
                transition={{
                  rotate: {
                    duration: 0.5,
                    ease: 'easeInOut',
                  },
                }}
                className="group mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10"
              >
                <Star className="h-8 w-8 text-primary transition-transform duration-300 group-hover:scale-110" />
              </motion.div>
              <motion.h2
                className="mb-4 text-4xl font-bold text-foreground"
                whileHover={{
                  scale: 1.02,
                }}
              >
                <motion.span
                  animate={{
                    backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
                  }}
                  transition={{
                    duration: 5,
                    repeat: Infinity,
                    ease: 'linear',
                  }}
                  className="relative bg-gradient-to-r from-primary via-purple-500 to-pink-500 bg-[length:200%_auto] bg-clip-text text-transparent"
                >
                  Our Values
                </motion.span>
              </motion.h2>
              <motion.p
                className="mx-auto max-w-2xl text-lg text-foreground/60"
                whileHover={{
                  scale: 1.01,
                }}
              >
                We're building a company culture that celebrates diversity,
                encourages innovation, and empowers every team member to do
                their best work
              </motion.p>
            </motion.div>

            <div className="grid gap-8 md:grid-cols-4">
              {values.map((item, index) => (
                <motion.div
                  key={index}
                  initial={{ y: 20, opacity: 0 }}
                  whileInView={{ y: 0, opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  whileHover={{
                    y: -5,
                    transition: {
                      duration: 0.2,
                      ease: 'easeOut',
                    },
                  }}
                  className="group relative"
                >
                  <div className="relative h-full overflow-hidden rounded-2xl bg-foreground/5 backdrop-blur-sm">
                    <motion.div
                      initial={{ opacity: 0 }}
                      whileHover={{ opacity: 1 }}
                      className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-pink-500/5 to-transparent transition-opacity duration-300"
                    />
                    <motion.div
                      animate={{
                        rotate: [0, 360],
                        scale: [1, 1.1, 1],
                      }}
                      transition={{
                        duration: 20,
                        repeat: Infinity,
                        ease: 'linear',
                      }}
                      className="absolute -top-8 -right-8 h-24 w-24 rounded-xl bg-gradient-to-br from-purple-500/20 via-pink-500/10 to-transparent blur-2xl"
                    />
                    <div className="pointer-events-none relative p-8">
                      <motion.div
                        whileHover={{
                          rotate: [0, 10, -10, 0],
                          scale: 1.1,
                        }}
                        transition={{
                          duration: 0.3,
                        }}
                        className="relative mb-6"
                      >
                        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-xl bg-primary/10 transition-all duration-300 group-hover:rotate-12 group-hover:bg-primary/20">
                          <motion.div
                            animate={{
                              scale: [1, 1.1, 1],
                            }}
                            transition={{
                              duration: 2,
                              repeat: Infinity,
                              ease: 'easeInOut',
                            }}
                          >
                            {item.icon}
                          </motion.div>
                        </div>
                      </motion.div>
                      <motion.h3
                        className="relative mb-4 text-xl font-bold text-foreground"
                        whileHover={{
                          scale: 1.05,
                          color: 'hsl(var(--primary))',
                        }}
                      >
                        {item.title}
                      </motion.h3>
                      <motion.p
                        className="relative text-foreground/60"
                        whileHover={{
                          scale: 1.02,
                        }}
                      >
                        {item.description}
                      </motion.p>
                    </div>
                    <motion.div
                      initial={{ scaleX: 0 }}
                      whileHover={{ scaleX: 1 }}
                      transition={{ duration: 0.3 }}
                      className="absolute right-0 bottom-0 left-0 h-1 origin-left bg-gradient-to-r from-primary/20 to-primary/5"
                    />
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.section>

        {/* Benefits Section - Enhanced with Creative UI */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative"
        >
          <div className="absolute inset-0 -z-10">
            <motion.div
              animate={{
                opacity: [0.1, 0.15, 0.1],
                scale: [1, 1.1, 1],
              }}
              transition={{
                duration: 8,
                repeat: Infinity,
                ease: 'linear',
              }}
              className="absolute inset-0 bg-[radial-gradient(circle_800px_at_50%_50%,rgba(var(--primary-rgb),0.15),transparent)]"
            />
            <motion.div
              animate={{
                rotate: [0, 360],
              }}
              transition={{
                duration: 60,
                repeat: Infinity,
                ease: 'linear',
              }}
              className="absolute inset-0 bg-[conic-gradient(from_90deg_at_50%_50%,rgba(var(--primary-rgb),0.05),transparent)]"
            />
            <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(var(--primary-rgb),0.02)_1px,transparent_1px)] bg-[size:100px] opacity-20" />
          </div>

          <div className="relative text-center">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              whileInView={{ scale: 1, opacity: 1 }}
              viewport={{ once: true }}
              className="mb-16"
            >
              <motion.div
                whileHover={{
                  scale: 1.1,
                  rotate: [0, 10, -10, 0],
                }}
                transition={{
                  rotate: {
                    duration: 0.5,
                    ease: 'easeInOut',
                  },
                }}
                className="group mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10"
              >
                <Heart className="h-8 w-8 text-primary transition-transform duration-300 group-hover:scale-110" />
              </motion.div>
              <motion.h2
                className="mb-4 text-4xl font-bold text-foreground"
                whileHover={{
                  scale: 1.02,
                }}
              >
                <motion.span
                  animate={{
                    backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
                  }}
                  transition={{
                    duration: 5,
                    repeat: Infinity,
                    ease: 'linear',
                  }}
                  className="relative bg-gradient-to-r from-primary via-blue-500 to-cyan-500 bg-[length:200%_auto] bg-clip-text text-transparent"
                >
                  Benefits & Perks
                </motion.span>
              </motion.h2>
              <motion.p
                className="mx-auto max-w-2xl text-lg text-foreground/60"
                whileHover={{
                  scale: 1.01,
                }}
              >
                We believe in taking care of our team with comprehensive
                benefits that support both professional growth and personal
                well-being
              </motion.p>
            </motion.div>

            <div className="grid gap-8 md:grid-cols-4">
              {benefits.map((item, index) => (
                <motion.div
                  key={index}
                  initial={{ y: 20, opacity: 0 }}
                  whileInView={{ y: 0, opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  whileHover={{
                    y: -5,
                    transition: {
                      duration: 0.2,
                      ease: 'easeOut',
                    },
                  }}
                  className="group relative"
                >
                  <div className="relative h-full overflow-hidden rounded-2xl bg-foreground/5 backdrop-blur-sm">
                    <motion.div
                      initial={{ opacity: 0 }}
                      whileHover={{ opacity: 1 }}
                      className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-cyan-500/5 to-transparent transition-opacity duration-300"
                    />
                    <motion.div
                      animate={{
                        rotate: [0, 360],
                        scale: [1, 1.1, 1],
                      }}
                      transition={{
                        duration: 20,
                        repeat: Infinity,
                        ease: 'linear',
                      }}
                      className="absolute -top-8 -right-8 h-24 w-24 rounded-xl bg-gradient-to-br from-blue-500/20 via-cyan-500/10 to-transparent blur-2xl"
                    />
                    <div className="pointer-events-none relative p-8">
                      <motion.div
                        whileHover={{
                          rotate: [0, 10, -10, 0],
                          scale: 1.1,
                        }}
                        transition={{
                          duration: 0.3,
                        }}
                        className="relative mb-6"
                      >
                        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-xl bg-primary/10 transition-all duration-300 group-hover:rotate-12 group-hover:bg-primary/20">
                          <motion.div
                            animate={{
                              scale: [1, 1.1, 1],
                            }}
                            transition={{
                              duration: 2,
                              repeat: Infinity,
                              ease: 'easeInOut',
                            }}
                          >
                            {item.icon}
                          </motion.div>
                        </div>
                      </motion.div>
                      <motion.h3
                        className="relative mb-4 text-xl font-bold text-foreground"
                        whileHover={{
                          scale: 1.05,
                          color: 'hsl(var(--primary))',
                        }}
                      >
                        {item.title}
                      </motion.h3>
                      <motion.p
                        className="relative text-foreground/60"
                        whileHover={{
                          scale: 1.02,
                        }}
                      >
                        {item.description}
                      </motion.p>
                    </div>
                    <motion.div
                      initial={{ scaleX: 0 }}
                      whileHover={{ scaleX: 1 }}
                      transition={{ duration: 0.3 }}
                      className="absolute right-0 bottom-0 left-0 h-1 origin-left bg-gradient-to-r from-primary/20 to-primary/5"
                    />
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.section>

        {/* Cultural Pillars Section - Enhanced with Creative UI */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative"
        >
          <div className="absolute inset-0 -z-10">
            <motion.div
              animate={{
                opacity: [0.1, 0.15, 0.1],
                scale: [1, 1.1, 1],
              }}
              transition={{
                duration: 8,
                repeat: Infinity,
                ease: 'linear',
              }}
              className="absolute inset-0 bg-[radial-gradient(circle_800px_at_50%_50%,rgba(var(--primary-rgb),0.15),transparent)]"
            />
            <motion.div
              animate={{
                rotate: [0, 360],
              }}
              transition={{
                duration: 60,
                repeat: Infinity,
                ease: 'linear',
              }}
              className="absolute inset-0 bg-[conic-gradient(from_180deg_at_50%_50%,rgba(var(--primary-rgb),0.05),transparent)]"
            />
            <motion.div
              animate={{
                opacity: [0.1, 0.2, 0.1],
              }}
              transition={{
                duration: 4,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              className="absolute inset-0 bg-[linear-gradient(to_right,rgba(var(--primary-rgb),0.02)_1px,transparent_1px)] bg-[size:100px]"
            />
          </div>

          <div className="relative text-center">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              whileInView={{ scale: 1, opacity: 1 }}
              viewport={{ once: true }}
              className="mb-16"
            >
              <motion.div
                whileHover={{
                  scale: 1.1,
                  rotate: [0, 10, -10, 0],
                }}
                transition={{
                  rotate: {
                    duration: 0.5,
                    ease: 'easeInOut',
                  },
                }}
                className="group mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10"
              >
                <Building2 className="h-8 w-8 text-primary transition-transform duration-300 group-hover:scale-110" />
              </motion.div>
              <motion.h2
                className="mb-4 text-4xl font-bold text-foreground"
                whileHover={{
                  scale: 1.02,
                }}
              >
                <motion.span
                  animate={{
                    backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
                  }}
                  transition={{
                    duration: 5,
                    repeat: Infinity,
                    ease: 'linear',
                  }}
                  className="relative bg-gradient-to-r from-primary via-orange-500 to-red-500 bg-[length:200%_auto] bg-clip-text text-transparent"
                >
                  Cultural Pillars
                </motion.span>
              </motion.h2>
              <motion.p
                className="mx-auto max-w-2xl text-lg text-foreground/60"
                whileHover={{
                  scale: 1.01,
                }}
              >
                Our culture is built on strong foundations that guide how we
                work, collaborate, and grow together
              </motion.p>
            </motion.div>

            <div className="grid gap-8 md:grid-cols-4">
              {culturalPillars.map((item, index) => (
                <motion.div
                  key={index}
                  initial={{ y: 20, opacity: 0 }}
                  whileInView={{ y: 0, opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  whileHover={{
                    y: -5,
                    transition: {
                      duration: 0.2,
                      ease: 'easeOut',
                    },
                  }}
                  className="group relative"
                >
                  <div className="relative h-full overflow-hidden rounded-2xl bg-foreground/5 backdrop-blur-sm">
                    <motion.div
                      initial={{ opacity: 0 }}
                      whileHover={{ opacity: 1 }}
                      className="absolute inset-0 bg-gradient-to-br from-orange-500/10 via-red-500/5 to-transparent transition-opacity duration-300"
                    />
                    <motion.div
                      animate={{
                        rotate: [0, 360],
                        scale: [1, 1.1, 1],
                      }}
                      transition={{
                        duration: 20,
                        repeat: Infinity,
                        ease: 'linear',
                      }}
                      className="absolute -top-8 -right-8 h-24 w-24 rounded-xl bg-gradient-to-br from-orange-500/20 via-red-500/10 to-transparent blur-2xl"
                    />
                    <div className="pointer-events-none relative p-8">
                      <motion.div
                        whileHover={{
                          rotate: [0, 10, -10, 0],
                          scale: 1.1,
                        }}
                        transition={{
                          duration: 0.3,
                        }}
                        className="relative mb-6"
                      >
                        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-xl bg-primary/10 transition-all duration-300 group-hover:rotate-12 group-hover:bg-primary/20">
                          <motion.div
                            animate={{
                              scale: [1, 1.1, 1],
                            }}
                            transition={{
                              duration: 2,
                              repeat: Infinity,
                              ease: 'easeInOut',
                            }}
                          >
                            {item.icon}
                          </motion.div>
                        </div>
                      </motion.div>
                      <motion.h3
                        className="relative mb-4 text-xl font-bold text-foreground"
                        whileHover={{
                          scale: 1.05,
                          color: 'hsl(var(--primary))',
                        }}
                      >
                        {item.title}
                      </motion.h3>
                      <motion.p
                        className="relative text-foreground/60"
                        whileHover={{
                          scale: 1.02,
                        }}
                      >
                        {item.description}
                      </motion.p>
                    </div>
                    <motion.div
                      initial={{ scaleX: 0 }}
                      whileHover={{ scaleX: 1 }}
                      transition={{ duration: 0.3 }}
                      className="absolute right-0 bottom-0 left-0 h-1 origin-left bg-gradient-to-r from-primary/20 to-primary/5"
                    />
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.section>

        {/* Team Highlights Section - Enhanced with Creative UI */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative"
        >
          <div className="absolute inset-0 -z-10">
            <motion.div
              animate={{
                opacity: [0.1, 0.15, 0.1],
                scale: [1, 1.1, 1],
              }}
              transition={{
                duration: 8,
                repeat: Infinity,
                ease: 'linear',
              }}
              className="absolute inset-0 bg-[radial-gradient(circle_800px_at_50%_50%,rgba(var(--primary-rgb),0.15),transparent)]"
            />
            <motion.div
              animate={{
                rotate: [0, 360],
              }}
              transition={{
                duration: 60,
                repeat: Infinity,
                ease: 'linear',
              }}
              className="absolute inset-0 bg-[conic-gradient(from_0deg_at_50%_50%,rgba(var(--primary-rgb),0.05),transparent)]"
            />
            <motion.div
              animate={{
                opacity: [0.1, 0.2, 0.1],
                y: [0, -10, 0],
              }}
              transition={{
                duration: 4,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              className="absolute inset-0 bg-[linear-gradient(to_right,rgba(var(--primary-rgb),0.02)_1px,transparent_1px)] bg-[size:100px]"
            />
          </div>

          <div className="relative text-center">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              whileInView={{ scale: 1, opacity: 1 }}
              viewport={{ once: true }}
              className="mb-16"
            >
              <motion.div
                whileHover={{
                  scale: 1.1,
                  rotate: [0, 10, -10, 0],
                }}
                transition={{
                  rotate: {
                    duration: 0.5,
                    ease: 'easeInOut',
                  },
                }}
                className="group mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10"
              >
                <Users2 className="h-8 w-8 text-primary transition-transform duration-300 group-hover:scale-110" />
              </motion.div>
              <motion.h2
                className="mb-4 text-4xl font-bold text-foreground"
                whileHover={{
                  scale: 1.02,
                }}
              >
                <motion.span
                  animate={{
                    backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
                  }}
                  transition={{
                    duration: 5,
                    repeat: Infinity,
                    ease: 'linear',
                  }}
                  className="relative bg-gradient-to-r from-primary via-green-500 to-emerald-500 bg-[length:200%_auto] bg-clip-text text-transparent"
                >
                  Team Highlights
                </motion.span>
              </motion.h2>
              <motion.p
                className="mx-auto max-w-2xl text-lg text-foreground/60"
                whileHover={{
                  scale: 1.01,
                }}
              >
                Join a diverse, global team working together to build something
                extraordinary
              </motion.p>
            </motion.div>

            <div className="grid gap-8 md:grid-cols-4">
              {teamHighlights.map((item, index) => (
                <motion.div
                  key={index}
                  initial={{ y: 20, opacity: 0 }}
                  whileInView={{ y: 0, opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  whileHover={{
                    y: -5,
                    transition: {
                      duration: 0.2,
                      ease: 'easeOut',
                    },
                  }}
                  className="group relative"
                >
                  <div className="relative h-full overflow-hidden rounded-2xl bg-foreground/5 backdrop-blur-sm">
                    <motion.div
                      initial={{ opacity: 0 }}
                      whileHover={{ opacity: 1 }}
                      className="absolute inset-0 bg-gradient-to-br from-green-500/10 via-emerald-500/5 to-transparent transition-opacity duration-300"
                    />
                    <motion.div
                      animate={{
                        rotate: [0, 360],
                        scale: [1, 1.1, 1],
                      }}
                      transition={{
                        duration: 20,
                        repeat: Infinity,
                        ease: 'linear',
                      }}
                      className="absolute -top-8 -right-8 h-24 w-24 rounded-xl bg-gradient-to-br from-green-500/20 via-emerald-500/10 to-transparent blur-2xl"
                    />
                    <div className="pointer-events-none relative p-8">
                      <motion.div
                        whileHover={{
                          rotate: [0, 10, -10, 0],
                          scale: 1.1,
                        }}
                        transition={{
                          duration: 0.3,
                        }}
                        className="relative mb-6"
                      >
                        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-xl bg-primary/10 transition-all duration-300 group-hover:rotate-12 group-hover:bg-primary/20">
                          <motion.div
                            animate={{
                              scale: [1, 1.1, 1],
                            }}
                            transition={{
                              duration: 2,
                              repeat: Infinity,
                              ease: 'easeInOut',
                            }}
                          >
                            {item.icon}
                          </motion.div>
                        </div>
                      </motion.div>
                      <motion.h3
                        className="relative mb-4 text-xl font-bold text-foreground"
                        whileHover={{
                          scale: 1.05,
                          color: 'hsl(var(--primary))',
                        }}
                      >
                        {item.title}
                      </motion.h3>
                      <motion.p
                        className="relative text-foreground/60"
                        whileHover={{
                          scale: 1.02,
                        }}
                      >
                        {item.description}
                      </motion.p>
                    </div>
                    <motion.div
                      initial={{ scaleX: 0 }}
                      whileHover={{ scaleX: 1 }}
                      transition={{ duration: 0.3 }}
                      className="absolute right-0 bottom-0 left-0 h-1 origin-left bg-gradient-to-r from-primary/20 to-primary/5"
                    />
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.section>

        {/* ... Rest of the sections with similar enhancements ... */}

        {/* Enhanced Animation Styles */}
        <style jsx global>{`
          @keyframes float {
            0%,
            100% {
              transform: translateY(0px) rotate(0deg);
            }
            50% {
              transform: translateY(-10px) rotate(2deg);
            }
          }
          .animate-float {
            animation: float 4s ease-in-out infinite;
          }
          @keyframes spin-slow {
            from {
              transform: rotate(0deg);
            }
            to {
              transform: rotate(360deg);
            }
          }
          .animate-spin-slow {
            animation: spin-slow 12s linear infinite;
          }
          @keyframes pulse-glow {
            0%,
            100% {
              opacity: 0.5;
              transform: scale(1);
            }
            50% {
              opacity: 1;
              transform: scale(1.05);
            }
          }
          .animate-pulse-glow {
            animation: pulse-glow 4s ease-in-out infinite;
          }
          @keyframes gradient-shift {
            0% {
              background-position: 0% 50%;
            }
            50% {
              background-position: 100% 50%;
            }
            100% {
              background-position: 0% 50%;
            }
          }
          .animate-gradient {
            animation: gradient-shift 8s ease infinite;
            background-size: 200% 200%;
          }
          @keyframes shimmer {
            0% {
              background-position: -200% 0;
            }
            100% {
              background-position: 200% 0;
            }
          }
          .animate-shimmer {
            animation: shimmer 3s linear infinite;
            background: linear-gradient(
              90deg,
              rgba(var(--primary-rgb), 0.1) 25%,
              rgba(var(--primary-rgb), 0.2) 50%,
              rgba(var(--primary-rgb), 0.1) 75%
            );
            background-size: 200% 100%;
          }
        `}</style>
      </div>
    </main>
  );
}
