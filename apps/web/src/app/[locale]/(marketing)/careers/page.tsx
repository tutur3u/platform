'use client';

import { Badge } from '@repo/ui/components/ui/badge';
import { Card } from '@repo/ui/components/ui/card';
import { motion } from 'framer-motion';
import {
  Building2,
  Clock,
  Code2,
  Compass,
  Globe2,
  GraduationCap,
  Heart,
  Laptop,
  LayoutGrid,
  Mail,
  MapPin,
  MessageCircle,
  Rocket,
  Sparkles,
  Star,
  Sun,
  Users2,
} from 'lucide-react';
import { ReactNode } from 'react';

interface ValueProps {
  icon: ReactNode;
  title: string;
  description: string;
}

const values: ValueProps[] = [
  {
    icon: <Globe2 className="text-primary h-8 w-8" />,
    title: 'Think Big',
    description:
      'We believe in bold visions and transformative ideas that can reshape how technology serves humanity.',
  },
  {
    icon: <Laptop className="text-primary h-8 w-8" />,
    title: 'Build Better',
    description:
      'We are obsessed with quality and craftsmanship, creating technology that is both powerful and beautiful.',
  },
  {
    icon: <Sun className="text-primary h-8 w-8" />,
    title: 'Grow Together',
    description:
      'We foster an environment where creativity thrives and every team member can reach their full potential.',
  },
  {
    icon: <Rocket className="text-primary h-8 w-8" />,
    title: 'Dream Bigger',
    description:
      'We are not just building products; we are creating a future where technology empowers everyone.',
  },
];

const benefits: ValueProps[] = [
  {
    icon: <Clock className="text-primary h-8 w-8" />,
    title: 'Flexible Hours',
    description:
      'Work when you are most productive. We trust our team to manage their time effectively.',
  },
  {
    icon: <GraduationCap className="text-primary h-8 w-8" />,
    title: 'Learning & Growth',
    description:
      'Industry-leading learning budget and resources for courses, conferences, and professional development.',
  },
  {
    icon: <Users2 className="text-primary h-8 w-8" />,
    title: 'Team Events',
    description:
      'Regular team activities and gatherings to build strong connections, with plans for global expansion.',
  },
  {
    icon: <Heart className="text-primary h-8 w-8" />,
    title: 'Premium Benefits',
    description:
      'Top-tier health coverage, wellness programs, and comprehensive benefits package to keep you at your best.',
  },
];

const culturalPillars: ValueProps[] = [
  {
    icon: <Sparkles className="text-primary h-8 w-8" />,
    title: 'Innovation DNA',
    description:
      'We see possibilities where others see limitations, constantly pushing boundaries to create breakthrough solutions.',
  },
  {
    icon: <MessageCircle className="text-primary h-8 w-8" />,
    title: 'Radical Transparency',
    description:
      'We believe in open, honest communication and sharing both our successes and learnings openly.',
  },
  {
    icon: <Star className="text-primary h-8 w-8" />,
    title: 'Craftsman Spirit',
    description:
      'We take pride in our work, paying attention to every detail and striving for excellence in everything we create.',
  },
  {
    icon: <Compass className="text-primary h-8 w-8" />,
    title: 'Visionary Focus',
    description:
      'We are guided by our mission to democratize technology and make powerful tools accessible to everyone.',
  },
];

const teamHighlights: ValueProps[] = [
  {
    icon: <MapPin className="text-primary h-8 w-8" />,
    title: 'Global Vision',
    description:
      'Currently based in Vietnam, we are building a foundation to expand globally and serve users worldwide.',
  },
  {
    icon: <Code2 className="text-primary h-8 w-8" />,
    title: 'Tech Excellence',
    description:
      'We use and contribute to cutting-edge technologies, striving to be at the forefront of technological innovation.',
  },
  {
    icon: <LayoutGrid className="text-primary h-8 w-8" />,
    title: 'Best-in-Class',
    description:
      'We aim to provide the best compensation, benefits, and work environment in the industry.',
  },
  {
    icon: <Building2 className="text-primary h-8 w-8" />,
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
  return (
    <main className="container relative space-y-32 py-24">
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
            className="hover:bg-primary/20 relative mb-6 cursor-default transition-colors"
          >
            <span className="from-primary via-primary/80 to-primary relative bg-gradient-to-r bg-clip-text text-transparent">
              Join Our Vision
            </span>
          </Badge>
        </motion.div>

        <motion.h1
          className="text-foreground mb-6 text-balance text-4xl font-bold tracking-tight md:text-7xl"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.5 }}
        >
          Shape{' '}
          <span className="inline-block">
            <span className="from-primary bg-gradient-to-r via-purple-500 to-pink-500 bg-clip-text text-transparent">
              Tomorrow's
            </span>
          </span>{' '}
          <br />
          <span className="from-primary bg-gradient-to-r via-blue-500 to-cyan-500 bg-clip-text text-transparent">
            Technology
          </span>
        </motion.h1>

        <motion.p
          className="text-foreground/80 mx-auto mb-12 max-w-2xl text-balance text-lg leading-relaxed md:text-xl"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.5 }}
        >
          At Tuturuuu, we're building a world-class team starting from Vietnam,
          with a vision to expand globally. We're looking for visionaries who
          share our passion for{' '}
          <strong className="from-primary to-primary/60 bg-gradient-to-r bg-clip-text font-bold text-transparent">
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
              className="from-foreground/5 to-foreground/10 hover:from-primary/10 hover:to-primary/5 flex cursor-default items-center gap-2 rounded-full bg-gradient-to-r px-4 py-2 transition-colors"
            >
              <span className="text-primary">{badge.icon}</span>
              <span className="text-foreground/80 text-sm font-medium">
                {badge.text}
              </span>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* About Tuturuuu Section - Creative Layout */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="relative"
      >
        <div className="absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_800px_at_50%_-40%,rgba(var(--primary-rgb),0.15),transparent)]" />
          <div className="absolute inset-0 bg-[conic-gradient(from_90deg_at_80%_50%,rgba(var(--primary-rgb),0.05),transparent)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(var(--primary-rgb),0.05)_1px,transparent_1px)] bg-[size:20px_20px]" />
        </div>

        <div className="relative grid gap-16 md:grid-cols-12">
          <motion.div
            initial={{ x: -20, opacity: 0 }}
            whileInView={{ x: 0, opacity: 1 }}
            viewport={{ once: true }}
            className="space-y-6 md:col-span-5"
          >
            <div className="sticky top-24 space-y-6">
              <h2 className="text-foreground text-4xl font-bold">
                <span className="from-primary bg-gradient-to-r via-purple-500 to-pink-500 bg-clip-text text-transparent">
                  About Tuturuuu
                </span>
              </h2>
              <p className="text-foreground/80 text-lg leading-relaxed">
                We're a dynamic tech startup revolutionizing how people interact
                with technology. Starting from Vietnam, we're building
                world-class products that combine innovation with accessibility,
                powered by cutting-edge AI and automation.
              </p>
              <p className="text-foreground/80 text-lg leading-relaxed">
                Our mission is to democratize access to powerful technology
                tools, making them intuitive and accessible to everyone. We
                believe in pushing boundaries while ensuring technology serves
                humanity's best interests.
              </p>

              <div className="relative mt-8">
                <div className="via-foreground/5 absolute inset-0 bg-gradient-to-r from-transparent to-transparent" />
                <div className="divide-foreground/5 relative grid grid-cols-3 divide-x">
                  <div className="space-y-2 px-4 first:pl-0">
                    <div className="text-primary text-3xl font-bold">2022</div>
                    <div className="text-foreground/60 text-sm">
                      Founded in Vietnam
                    </div>
                  </div>
                  <div className="space-y-2 px-4">
                    <div className="text-primary text-3xl font-bold">24/7</div>
                    <div className="text-foreground/60 text-sm">Innovation</div>
                  </div>
                  <div className="space-y-2 px-4">
                    <div className="text-primary text-3xl font-bold">∞</div>
                    <div className="text-foreground/60 text-sm">
                      Possibilities
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ x: 20, opacity: 0 }}
            whileInView={{ x: 0, opacity: 1 }}
            viewport={{ once: true }}
            className="relative space-y-8 md:col-span-7"
          >
            <div className="bg-foreground/5 group relative overflow-hidden rounded-2xl backdrop-blur-sm">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-pink-500/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <div className="relative p-8">
                <div className="from-primary/20 absolute -right-16 -top-16 h-32 w-32 rotate-12 rounded-3xl bg-gradient-to-br via-purple-500/10 to-pink-500/20 blur-3xl" />
                <div className="relative space-y-6">
                  <h3 className="text-foreground text-2xl font-bold">
                    Our Vision
                  </h3>
                  <p className="text-foreground/80">
                    To become one of the world's most innovative technology
                    companies, creating life-changing breakthroughs that touch
                    lives across the globe, making the impossible possible for
                    everyone, everywhere.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Badge
                      variant="secondary"
                      className="bg-primary/10 text-primary"
                    >
                      Innovation First
                    </Badge>
                    <Badge
                      variant="secondary"
                      className="bg-primary/10 text-primary"
                    >
                      User-Centric
                    </Badge>
                    <Badge
                      variant="secondary"
                      className="bg-primary/10 text-primary"
                    >
                      Global Impact
                    </Badge>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-foreground/5 group relative overflow-hidden rounded-2xl backdrop-blur-sm">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-cyan-500/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <div className="relative p-8">
                <div className="to-primary/20 absolute -left-16 -top-16 h-32 w-32 -rotate-12 rounded-3xl bg-gradient-to-br from-blue-500/20 via-cyan-500/10 blur-3xl" />
                <div className="relative space-y-6">
                  <h3 className="text-foreground text-2xl font-bold">
                    Our Culture
                  </h3>
                  <p className="text-foreground/80">
                    We foster an environment of continuous learning, innovation,
                    and collaboration. Our team members are empowered to think
                    big, take initiative, and make a real impact on the future
                    of technology.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Badge
                      variant="secondary"
                      className="bg-primary/10 text-primary"
                    >
                      Open Culture
                    </Badge>
                    <Badge
                      variant="secondary"
                      className="bg-primary/10 text-primary"
                    >
                      Rapid Growth
                    </Badge>
                    <Badge
                      variant="secondary"
                      className="bg-primary/10 text-primary"
                    >
                      Work-Life Balance
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </motion.section>

      {/* Join Our Vision Section - Creative Grid */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="relative"
      >
        <div className="absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_800px_at_50%_140%,rgba(var(--primary-rgb),0.15),transparent)]" />
          <div className="absolute inset-0 bg-[conic-gradient(from_180deg_at_20%_50%,rgba(var(--primary-rgb),0.05),transparent)]" />
        </div>

        <div className="mb-16 text-center">
          <h2 className="text-foreground mb-4 text-4xl font-bold">
            <span className="from-primary bg-gradient-to-r via-blue-500 to-cyan-500 bg-clip-text text-transparent">
              Join Our Vision
            </span>
          </h2>
          <p className="text-foreground/60 mx-auto max-w-2xl text-lg">
            We're looking for exceptional individuals who share our passion for
            innovation and making a difference
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          <motion.div
            whileHover={{ y: -5 }}
            className="group relative overflow-hidden rounded-xl"
          >
            <div className="bg-foreground/5 relative flex h-full flex-col p-8">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-cyan-500/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <div className="absolute -right-8 -top-8 h-24 w-24 rotate-12 rounded-xl bg-gradient-to-br from-blue-500/20 via-cyan-500/10 to-transparent blur-2xl transition-opacity duration-300 group-hover:opacity-100" />
              <div className="relative space-y-4">
                <div className="bg-primary/10 group-hover:bg-primary/20 flex h-12 w-12 items-center justify-center rounded-xl transition-all duration-300 group-hover:rotate-12">
                  <Code2 className="text-primary h-6 w-6" />
                </div>
                <h3 className="text-foreground text-xl font-bold">
                  Technical Excellence
                </h3>
                <ul className="text-foreground/60 space-y-2 text-left">
                  <li className="flex items-center gap-2">
                    <div className="bg-primary/10 h-1.5 w-1.5 rounded-full" />
                    Strong problem-solving abilities
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="bg-primary/10 h-1.5 w-1.5 rounded-full" />
                    Passion for clean, efficient code
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="bg-primary/10 h-1.5 w-1.5 rounded-full" />
                    Eager to learn new technologies
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="bg-primary/10 h-1.5 w-1.5 rounded-full" />
                    Innovative thinking
                  </li>
                </ul>
              </div>
            </div>
          </motion.div>

          <motion.div
            whileHover={{ y: -5 }}
            className="group relative overflow-hidden rounded-xl"
          >
            <div className="bg-foreground/5 relative flex h-full flex-col p-8">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-pink-500/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <div className="absolute -right-8 -top-8 h-24 w-24 rotate-12 rounded-xl bg-gradient-to-br from-purple-500/20 via-pink-500/10 to-transparent blur-2xl transition-opacity duration-300 group-hover:opacity-100" />
              <div className="relative space-y-4">
                <div className="bg-primary/10 group-hover:bg-primary/20 flex h-12 w-12 items-center justify-center rounded-xl transition-all duration-300 group-hover:rotate-12">
                  <Users2 className="text-primary h-6 w-6" />
                </div>
                <h3 className="text-foreground text-xl font-bold">
                  Team Player
                </h3>
                <ul className="text-foreground/60 space-y-2 text-left">
                  <li className="flex items-center gap-2">
                    <div className="bg-primary/10 h-1.5 w-1.5 rounded-full" />
                    Excellent communication skills
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="bg-primary/10 h-1.5 w-1.5 rounded-full" />
                    Collaborative mindset
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="bg-primary/10 h-1.5 w-1.5 rounded-full" />
                    Values diverse perspectives
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="bg-primary/10 h-1.5 w-1.5 rounded-full" />
                    Empathetic leadership
                  </li>
                </ul>
              </div>
            </div>
          </motion.div>

          <motion.div
            whileHover={{ y: -5 }}
            className="group relative overflow-hidden rounded-xl"
          >
            <div className="bg-foreground/5 relative flex h-full flex-col p-8">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 via-red-500/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <div className="absolute -right-8 -top-8 h-24 w-24 rotate-12 rounded-xl bg-gradient-to-br from-orange-500/20 via-red-500/10 to-transparent blur-2xl transition-opacity duration-300 group-hover:opacity-100" />
              <div className="relative space-y-4">
                <div className="bg-primary/10 group-hover:bg-primary/20 flex h-12 w-12 items-center justify-center rounded-xl transition-all duration-300 group-hover:rotate-12">
                  <Rocket className="text-primary h-6 w-6" />
                </div>
                <h3 className="text-foreground text-xl font-bold">
                  Growth Mindset
                </h3>
                <ul className="text-foreground/60 space-y-2 text-left">
                  <li className="flex items-center gap-2">
                    <div className="bg-primary/10 h-1.5 w-1.5 rounded-full" />
                    Embraces challenges
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="bg-primary/10 h-1.5 w-1.5 rounded-full" />
                    Takes initiative
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="bg-primary/10 h-1.5 w-1.5 rounded-full" />
                    Thrives in fast-paced environments
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="bg-primary/10 h-1.5 w-1.5 rounded-full" />
                    Continuous learner
                  </li>
                </ul>
              </div>
            </div>
          </motion.div>

          <motion.div
            whileHover={{ y: -5 }}
            className="group relative overflow-hidden rounded-xl"
          >
            <div className="bg-foreground/5 relative flex h-full flex-col p-8">
              <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 via-emerald-500/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <div className="absolute -right-8 -top-8 h-24 w-24 rotate-12 rounded-xl bg-gradient-to-br from-green-500/20 via-emerald-500/10 to-transparent blur-2xl transition-opacity duration-300 group-hover:opacity-100" />
              <div className="relative space-y-4">
                <div className="bg-primary/10 group-hover:bg-primary/20 flex h-12 w-12 items-center justify-center rounded-xl transition-all duration-300 group-hover:rotate-12">
                  <Globe2 className="text-primary h-6 w-6" />
                </div>
                <h3 className="text-foreground text-xl font-bold">
                  Global Vision
                </h3>
                <ul className="text-foreground/60 space-y-2 text-left">
                  <li className="flex items-center gap-2">
                    <div className="bg-primary/10 h-1.5 w-1.5 rounded-full" />
                    International mindset
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="bg-primary/10 h-1.5 w-1.5 rounded-full" />
                    Cultural awareness
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="bg-primary/10 h-1.5 w-1.5 rounded-full" />
                    Adaptability
                  </li>
                  <li className="flex items-center gap-2">
                    <div className="bg-primary/10 h-1.5 w-1.5 rounded-full" />
                    Forward-thinking
                  </li>
                </ul>
              </div>
            </div>
          </motion.div>
        </div>
      </motion.section>

      {/* Add styles for the new animation */}
      <style jsx global>{`
        @keyframes float {
          0%,
          100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-10px);
          }
        }
        .animate-float {
          animation: float 3s ease-in-out infinite;
        }
      `}</style>

      {/* Values Section - Enhanced with Creative UI */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="relative"
      >
        <div className="absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_800px_at_50%_50%,rgba(var(--primary-rgb),0.15),transparent)]" />
          <div className="absolute inset-0 bg-[conic-gradient(from_270deg_at_50%_50%,rgba(var(--primary-rgb),0.05),transparent)]" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(var(--primary-rgb),0.02)_1px,transparent_1px)] bg-[size:100px] opacity-20" />
        </div>

        <div className="relative text-center">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 1 }}
            viewport={{ once: true }}
            className="mb-16"
          >
            <div className="bg-primary/10 mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl">
              <Star className="text-primary h-8 w-8" />
            </div>
            <h2 className="text-foreground mb-4 text-4xl font-bold">
              <span className="from-primary bg-gradient-to-r via-purple-500 to-pink-500 bg-clip-text text-transparent">
                Our Values
              </span>
            </h2>
            <p className="text-foreground/60 mx-auto max-w-2xl text-lg">
              We're building a company culture that celebrates diversity,
              encourages innovation, and empowers every team member to do their
              best work
            </p>
          </motion.div>

          <div className="grid gap-8 md:grid-cols-4">
            {values.map((item, index) => (
              <motion.div
                key={index}
                initial={{ y: 20, opacity: 0 }}
                whileInView={{ y: 0, opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ y: -5 }}
                className="group relative"
              >
                <div className="bg-foreground/5 relative overflow-hidden rounded-2xl backdrop-blur-sm">
                  <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-pink-500/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  <div className="relative p-8">
                    <div className="absolute -right-8 -top-8 h-24 w-24 rotate-12 rounded-xl bg-gradient-to-br from-purple-500/20 via-pink-500/10 to-transparent blur-2xl transition-opacity duration-300 group-hover:opacity-100" />
                    <motion.div
                      whileHover={{ rotate: 360, scale: 1.1 }}
                      transition={{ duration: 0.5 }}
                      className="relative mb-6"
                    >
                      <div className="bg-primary/10 group-hover:bg-primary/20 mx-auto flex h-16 w-16 items-center justify-center rounded-xl transition-all duration-300 group-hover:rotate-12">
                        {item.icon}
                      </div>
                    </motion.div>
                    <h3 className="text-foreground relative mb-4 text-xl font-bold">
                      {item.title}
                    </h3>
                    <p className="text-foreground/60 relative">
                      {item.description}
                    </p>
                  </div>
                  <div className="from-primary/20 to-primary/5 absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
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
          <div className="absolute inset-0 bg-[radial-gradient(circle_800px_at_50%_50%,rgba(var(--primary-rgb),0.15),transparent)]" />
          <div className="absolute inset-0 bg-[conic-gradient(from_90deg_at_50%_50%,rgba(var(--primary-rgb),0.05),transparent)]" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(var(--primary-rgb),0.02)_1px,transparent_1px)] bg-[size:100px] opacity-20" />
        </div>

        <div className="relative text-center">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 1 }}
            viewport={{ once: true }}
            className="mb-16"
          >
            <div className="bg-primary/10 mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl">
              <Heart className="text-primary h-8 w-8" />
            </div>
            <h2 className="text-foreground mb-4 text-4xl font-bold">
              <span className="from-primary bg-gradient-to-r via-blue-500 to-cyan-500 bg-clip-text text-transparent">
                Benefits & Perks
              </span>
            </h2>
            <p className="text-foreground/60 mx-auto max-w-2xl text-lg">
              We believe in taking care of our team with comprehensive benefits
              that support both professional growth and personal well-being
            </p>
          </motion.div>

          <div className="grid gap-8 md:grid-cols-4">
            {benefits.map((item, index) => (
              <motion.div
                key={index}
                initial={{ y: 20, opacity: 0 }}
                whileInView={{ y: 0, opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ y: -5 }}
                className="group relative"
              >
                <div className="bg-foreground/5 relative overflow-hidden rounded-2xl backdrop-blur-sm">
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-cyan-500/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  <div className="relative p-8">
                    <div className="absolute -right-8 -top-8 h-24 w-24 rotate-12 rounded-xl bg-gradient-to-br from-blue-500/20 via-cyan-500/10 to-transparent blur-2xl transition-opacity duration-300 group-hover:opacity-100" />
                    <motion.div
                      whileHover={{ rotate: 360, scale: 1.1 }}
                      transition={{ duration: 0.5 }}
                      className="relative mb-6"
                    >
                      <div className="bg-primary/10 group-hover:bg-primary/20 mx-auto flex h-16 w-16 items-center justify-center rounded-xl transition-all duration-300 group-hover:rotate-12">
                        {item.icon}
                      </div>
                    </motion.div>
                    <h3 className="text-foreground relative mb-4 text-xl font-bold">
                      {item.title}
                    </h3>
                    <p className="text-foreground/60 relative">
                      {item.description}
                    </p>
                  </div>
                  <div className="from-primary/20 to-primary/5 absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
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
          <div className="absolute inset-0 bg-[radial-gradient(circle_800px_at_50%_50%,rgba(var(--primary-rgb),0.15),transparent)]" />
          <div className="absolute inset-0 bg-[conic-gradient(from_180deg_at_50%_50%,rgba(var(--primary-rgb),0.05),transparent)]" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(var(--primary-rgb),0.02)_1px,transparent_1px)] bg-[size:100px] opacity-20" />
        </div>

        <div className="relative text-center">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 1 }}
            viewport={{ once: true }}
            className="mb-16"
          >
            <div className="bg-primary/10 mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl">
              <Building2 className="text-primary h-8 w-8" />
            </div>
            <h2 className="text-foreground mb-4 text-4xl font-bold">
              <span className="from-primary bg-gradient-to-r via-orange-500 to-red-500 bg-clip-text text-transparent">
                Cultural Pillars
              </span>
            </h2>
            <p className="text-foreground/60 mx-auto max-w-2xl text-lg">
              Our culture is built on strong foundations that guide how we work,
              collaborate, and grow together
            </p>
          </motion.div>

          <div className="grid gap-8 md:grid-cols-4">
            {culturalPillars.map((item, index) => (
              <motion.div
                key={index}
                initial={{ y: 20, opacity: 0 }}
                whileInView={{ y: 0, opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ y: -5 }}
                className="group relative"
              >
                <div className="bg-foreground/5 relative overflow-hidden rounded-2xl backdrop-blur-sm">
                  <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 via-red-500/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  <div className="relative p-8">
                    <div className="absolute -right-8 -top-8 h-24 w-24 rotate-12 rounded-xl bg-gradient-to-br from-orange-500/20 via-red-500/10 to-transparent blur-2xl transition-opacity duration-300 group-hover:opacity-100" />
                    <motion.div
                      whileHover={{ rotate: 360, scale: 1.1 }}
                      transition={{ duration: 0.5 }}
                      className="relative mb-6"
                    >
                      <div className="bg-primary/10 group-hover:bg-primary/20 mx-auto flex h-16 w-16 items-center justify-center rounded-xl transition-all duration-300 group-hover:rotate-12">
                        {item.icon}
                      </div>
                    </motion.div>
                    <h3 className="text-foreground relative mb-4 text-xl font-bold">
                      {item.title}
                    </h3>
                    <p className="text-foreground/60 relative">
                      {item.description}
                    </p>
                  </div>
                  <div className="from-primary/20 to-primary/5 absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
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
          <div className="absolute inset-0 bg-[radial-gradient(circle_800px_at_50%_50%,rgba(var(--primary-rgb),0.15),transparent)]" />
          <div className="absolute inset-0 bg-[conic-gradient(from_0deg_at_50%_50%,rgba(var(--primary-rgb),0.05),transparent)]" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(var(--primary-rgb),0.02)_1px,transparent_1px)] bg-[size:100px] opacity-20" />
        </div>

        <div className="relative text-center">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 1 }}
            viewport={{ once: true }}
            className="mb-16"
          >
            <div className="bg-primary/10 mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl">
              <Users2 className="text-primary h-8 w-8" />
            </div>
            <h2 className="text-foreground mb-4 text-4xl font-bold">
              <span className="from-primary bg-gradient-to-r via-green-500 to-emerald-500 bg-clip-text text-transparent">
                Team Highlights
              </span>
            </h2>
            <p className="text-foreground/60 mx-auto max-w-2xl text-lg">
              Join a diverse, global team working together to build something
              extraordinary
            </p>
          </motion.div>

          <div className="grid gap-8 md:grid-cols-4">
            {teamHighlights.map((item, index) => (
              <motion.div
                key={index}
                initial={{ y: 20, opacity: 0 }}
                whileInView={{ y: 0, opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ y: -5 }}
                className="group relative"
              >
                <div className="bg-foreground/5 relative overflow-hidden rounded-2xl backdrop-blur-sm">
                  <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 via-emerald-500/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  <div className="relative p-8">
                    <div className="absolute -right-8 -top-8 h-24 w-24 rotate-12 rounded-xl bg-gradient-to-br from-green-500/20 via-emerald-500/10 to-transparent blur-2xl transition-opacity duration-300 group-hover:opacity-100" />
                    <motion.div
                      whileHover={{ rotate: 360, scale: 1.1 }}
                      transition={{ duration: 0.5 }}
                      className="relative mb-6"
                    >
                      <div className="bg-primary/10 group-hover:bg-primary/20 mx-auto flex h-16 w-16 items-center justify-center rounded-xl transition-all duration-300 group-hover:rotate-12">
                        {item.icon}
                      </div>
                    </motion.div>
                    <h3 className="text-foreground relative mb-4 text-xl font-bold">
                      {item.title}
                    </h3>
                    <p className="text-foreground/60 relative">
                      {item.description}
                    </p>
                  </div>
                  <div className="from-primary/20 to-primary/5 absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* Get in Touch Section - Enhanced with Creative UI */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-center"
      >
        <Card className="group relative overflow-hidden p-12">
          <div className="absolute inset-0">
            <div className="from-primary/10 absolute inset-0 bg-gradient-to-br via-purple-500/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(var(--primary-rgb),0.05)_1px,transparent_1px)] bg-[size:20px_20px]" />
            <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(var(--primary-rgb),0.02)_1px,transparent_1px)] bg-[size:100px] opacity-20" />
          </div>

          <div className="relative">
            <motion.div
              initial={{ scale: 0.95 }}
              whileHover={{ scale: 1 }}
              className="bg-primary/10 group-hover:bg-primary/20 mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-full transition-colors duration-300"
            >
              <Mail className="text-primary h-10 w-10" />
            </motion.div>

            <h2 className="text-foreground mb-6 text-4xl font-bold">
              <span className="from-primary bg-gradient-to-r via-purple-500 to-pink-500 bg-clip-text text-transparent">
                Shape the Future with Us
              </span>
            </h2>
            <p className="text-foreground/80 mx-auto mb-12 max-w-2xl text-lg">
              While we don't have any open positions at the moment, we're always
              excited to connect with talented individuals who share our vision.
              If you're passionate about technology and innovation, we'd love to
              hear from you.
            </p>

            <motion.a
              href="mailto:contact@tuturuuu.com"
              className="bg-foreground hover:bg-foreground/90 text-background inline-flex items-center gap-2 rounded-lg px-8 py-4 font-semibold transition-all duration-300"
              whileHover={{ scale: 1.05 }}
            >
              <Mail className="h-5 w-5" />
              <span>Get in Touch</span>
            </motion.a>

            <p className="text-foreground/60 mt-6 text-sm">
              Email us at{' '}
              <span className="font-semibold underline">
                contact@tuturuuu.com
              </span>{' '}
              with your story and future role in mind
            </p>
          </div>
        </Card>
      </motion.section>
    </main>
  );
}
