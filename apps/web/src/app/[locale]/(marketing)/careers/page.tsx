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

      {/* Values Section */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-center"
      >
        <h2 className="text-foreground mb-4 text-4xl font-bold">
          <span className="from-primary to-primary/60 bg-gradient-to-r bg-clip-text text-transparent">
            Our Values
          </span>
        </h2>
        <p className="text-foreground/60 mx-auto mb-16 max-w-2xl text-lg">
          We're building a company culture that celebrates diversity, encourages
          innovation, and empowers every team member to do their best work
        </p>
        <div className="grid gap-8 md:grid-cols-4">
          {values.map((item, index) => (
            <motion.div
              key={index}
              className="group relative overflow-hidden rounded-xl"
              whileHover={{ y: -5 }}
            >
              <div className="from-primary/10 via-primary/5 absolute inset-0 bg-gradient-to-br to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <div className="bg-foreground/5 relative flex h-full flex-col p-8 backdrop-blur-sm">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(var(--primary-rgb),0.05)_1px,transparent_1px)] bg-[size:10px_10px] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                <motion.div
                  className="mb-6 flex justify-center"
                  whileHover={{ rotate: 360, scale: 1.1 }}
                  transition={{ duration: 0.5 }}
                >
                  <div className="bg-primary/10 group-hover:bg-primary/20 rounded-full p-4 transition-colors duration-300">
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
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* Benefits Section */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-center"
      >
        <h2 className="text-foreground mb-4 text-4xl font-bold">
          <span className="from-primary bg-gradient-to-r via-purple-500 to-pink-500 bg-clip-text text-transparent">
            Benefits & Perks
          </span>
        </h2>
        <p className="text-foreground/60 mx-auto mb-16 max-w-2xl text-lg">
          We believe in taking care of our team with comprehensive benefits that
          support both professional growth and personal well-being
        </p>
        <div className="grid gap-8 md:grid-cols-4">
          {benefits.map((item, index) => (
            <motion.div
              key={index}
              className="group relative overflow-hidden rounded-xl"
              whileHover={{ y: -5 }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-pink-500/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <div className="bg-foreground/5 relative flex h-full flex-col p-8 backdrop-blur-sm">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(var(--primary-rgb),0.05)_1px,transparent_1px)] bg-[size:10px_10px] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                <motion.div
                  className="mb-6 flex justify-center"
                  whileHover={{ rotate: 360, scale: 1.1 }}
                  transition={{ duration: 0.5 }}
                >
                  <div className="bg-primary/10 group-hover:bg-primary/20 rounded-full p-4 transition-colors duration-300">
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
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* Cultural Pillars Section */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-center"
      >
        <h2 className="text-foreground mb-4 text-4xl font-bold">
          <span className="bg-gradient-to-r from-blue-500 to-cyan-500 bg-clip-text text-transparent">
            Cultural Pillars
          </span>
        </h2>
        <p className="text-foreground/60 mx-auto mb-16 max-w-2xl text-lg">
          Our culture is built on strong foundations that guide how we work,
          collaborate, and grow together
        </p>
        <div className="grid gap-8 md:grid-cols-4">
          {culturalPillars.map((item, index) => (
            <motion.div
              key={index}
              className="group relative overflow-hidden rounded-xl"
              whileHover={{ y: -5 }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-cyan-500/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <div className="bg-foreground/5 relative flex h-full flex-col p-8 backdrop-blur-sm">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(var(--primary-rgb),0.05)_1px,transparent_1px)] bg-[size:10px_10px] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                <motion.div
                  className="mb-6 flex justify-center"
                  whileHover={{ rotate: 360, scale: 1.1 }}
                  transition={{ duration: 0.5 }}
                >
                  <div className="bg-primary/10 group-hover:bg-primary/20 rounded-full p-4 transition-colors duration-300">
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
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* Team Highlights Section */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-center"
      >
        <h2 className="text-foreground mb-4 text-4xl font-bold">
          <span className="from-primary bg-gradient-to-r via-purple-500 to-pink-500 bg-clip-text text-transparent">
            Team Highlights
          </span>
        </h2>
        <p className="text-foreground/60 mx-auto mb-16 max-w-2xl text-lg">
          Join a diverse, global team working together to build something
          extraordinary
        </p>
        <div className="grid gap-8 md:grid-cols-4">
          {teamHighlights.map((item, index) => (
            <motion.div
              key={index}
              className="group relative overflow-hidden rounded-xl"
              whileHover={{ y: -5 }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-pink-500/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <div className="bg-foreground/5 relative flex h-full flex-col p-8 backdrop-blur-sm">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(var(--primary-rgb),0.05)_1px,transparent_1px)] bg-[size:10px_10px] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                <motion.div
                  className="mb-6 flex justify-center"
                  whileHover={{ rotate: 360, scale: 1.1 }}
                  transition={{ duration: 0.5 }}
                >
                  <div className="bg-primary/10 group-hover:bg-primary/20 rounded-full p-4 transition-colors duration-300">
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
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* Get in Touch Section */}
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
              Email us at contact@tuturuuu.com with your story and future role
              in mind
            </p>
          </div>
        </Card>
      </motion.section>
    </main>
  );
}
