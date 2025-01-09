'use client';

import { Badge } from '@repo/ui/components/ui/badge';
import { motion } from 'framer-motion';
import {
  Award,
  Brain,
  Github,
  Globe,
  Heart,
  Laptop,
  Mail,
  Rocket,
  Shield,
  Sparkles,
  Star,
  Target,
  Users,
  Zap,
} from 'lucide-react';
import { ReactNode } from 'react';

interface ItemProps {
  icon: ReactNode;
  title: string;
  description: string;
}

const journeyItems: ItemProps[] = [
  {
    icon: <Star className="text-primary h-8 w-8" />,
    title: 'The Beginning',
    description:
      'Started with a vision to democratize technology, making powerful tools accessible to everyone.',
  },
  {
    icon: <Rocket className="text-primary h-8 w-8" />,
    title: 'Rapid Growth',
    description:
      'Expanded our reach globally, touching thousands of lives with innovative solutions.',
  },
  {
    icon: <Brain className="text-primary h-8 w-8" />,
    title: 'AI Revolution',
    description:
      'Pioneered breakthrough AI technologies that adapt and evolve to serve human needs better.',
  },
  {
    icon: <Globe className="text-primary h-8 w-8" />,
    title: 'Global Impact',
    description:
      'Building a worldwide community of innovators and dreamers who share our vision.',
  },
];

const achievementItems: ItemProps[] = [
  {
    icon: <Award className="text-primary h-8 w-8" />,
    title: 'Technical Excellence',
    description:
      'Setting new standards in software development with cutting-edge solutions.',
  },
  {
    icon: <Users className="text-primary h-8 w-8" />,
    title: 'Growing Community',
    description:
      'Building a vibrant ecosystem of developers, creators, and innovators.',
  },
  {
    icon: <Sparkles className="text-primary h-8 w-8" />,
    title: 'Innovation Awards',
    description:
      'Recognized for groundbreaking contributions to technology and human advancement.',
  },
  {
    icon: <Heart className="text-primary h-8 w-8" />,
    title: 'Social Impact',
    description:
      'Making a real difference in communities worldwide through accessible technology.',
  },
];

const futureItems: ItemProps[] = [
  {
    icon: <Zap className="text-primary h-8 w-8" />,
    title: 'Next-Gen AI',
    description:
      'Developing revolutionary AI systems that will transform how we interact with technology.',
  },
  {
    icon: <Laptop className="text-primary h-8 w-8" />,
    title: 'Universal Platform',
    description:
      'Creating a unified platform that brings powerful tools to everyone, everywhere.',
  },
  {
    icon: <Target className="text-primary h-8 w-8" />,
    title: 'Global Expansion',
    description:
      'Extending our reach to empower more communities and transform more lives.',
  },
  {
    icon: <Shield className="text-primary h-8 w-8" />,
    title: 'Trusted Future',
    description:
      'Building a future where technology serves humanity with security and reliability.',
  },
];

interface BadgeProps {
  icon: ReactNode;
  text: string;
}

const badges: BadgeProps[] = [
  { icon: <Heart className="h-5 w-5" />, text: 'Life-Changing Impact' },
  { icon: <Brain className="h-5 w-5" />, text: 'Breakthrough Innovation' },
  { icon: <Globe className="h-5 w-5" />, text: 'Universal Access' },
];

const purposeItems: ItemProps[] = [
  {
    icon: <Heart className="text-primary h-8 w-8" />,
    title: 'Universal Access',
    description:
      'We believe everyone deserves access to life-changing technology. Our solutions are designed to reach and empower people from all walks of life, everywhere.',
  },
  {
    icon: <Brain className="text-primary h-8 w-8" />,
    title: 'Breakthrough Innovation',
    description:
      'Through cutting-edge AI and relentless innovation, we push the boundaries of what technology can achieve to create transformative solutions.',
  },
  {
    icon: <Globe className="text-primary h-8 w-8" />,
    title: 'Worldwide Impact',
    description:
      'From bustling cities to remote villages, we are committed to delivering technology that makes a real difference in daily lives.',
  },
];

interface StatProps {
  value: string;
  label: string;
  description: string;
}

const impactStats: StatProps[] = [
  {
    value: '24/7',
    label: 'Innovation',
    description: 'Constant breakthroughs',
  },
  {
    value: '100%',
    label: 'Commitment',
    description: 'To excellence',
  },
  {
    value: '10K+',
    label: 'Lives Changed',
    description: 'And growing daily',
  },
  {
    value: '∞',
    label: 'Possibilities',
    description: 'Limitless potential',
  },
];

export default function AboutPage() {
  return (
    <main className="container relative space-y-32 py-24">
      {/* Hero Section */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative text-center"
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="relative"
        >
          <Badge variant="secondary" className="relative mb-6">
            <span className="relative">Our Vision</span>
          </Badge>
        </motion.div>

        <motion.h1
          className="text-foreground mb-6 text-balance text-6xl font-bold"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.5 }}
        >
          Pioneering{' '}
          <span className="from-primary to-primary/60 bg-gradient-to-r bg-clip-text text-transparent">
            Breakthroughs
          </span>{' '}
          for Everyone
        </motion.h1>

        <motion.p
          className="text-foreground/80 mx-auto mb-12 max-w-2xl text-balance text-xl leading-relaxed"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.5 }}
        >
          At Tuturuuu, we&apos;re driven by an audacious vision: to become one
          of the world&apos;s most innovative technology companies. But our
          mission transcends innovation—we&apos;re here to create life-changing
          breakthroughs that touch lives across the globe,{' '}
          <strong className="font-bold underline">
            making the impossible possible for everyone, everywhere.
          </strong>
        </motion.p>

        <div className="flex flex-wrap justify-center gap-4">
          {badges.map((badge, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 + index * 0.1 }}
              className="bg-foreground/5 flex items-center gap-2 rounded-full px-4 py-2"
            >
              <span className="text-primary">{badge.icon}</span>
              <span className="text-foreground/80 text-sm">{badge.text}</span>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* Our Journey Section */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-center"
      >
        <h2 className="text-foreground mb-4 text-4xl font-bold">Our Journey</h2>
        <p className="text-foreground/60 mx-auto mb-16 max-w-2xl text-lg">
          From humble beginnings to groundbreaking innovations, every step of
          our journey is driven by the desire to make technology work for
          everyone
        </p>
        <div className="grid gap-8 md:grid-cols-4">
          {journeyItems.map((item, index) => (
            <motion.div
              key={index}
              className="bg-foreground/5 group relative rounded-xl p-8"
              whileHover={{ y: -5 }}
            >
              <motion.div
                className="mb-6 flex justify-center"
                whileHover={{ rotate: 360, scale: 1.1 }}
                transition={{ duration: 0.5 }}
              >
                {item.icon}
              </motion.div>
              <h3 className="text-foreground mb-4 text-xl font-bold">
                {item.title}
              </h3>
              <p className="text-foreground/60">{item.description}</p>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* Our Purpose Section */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-center"
      >
        <h2 className="text-foreground mb-4 text-4xl font-bold">Our Purpose</h2>
        <p className="text-foreground/60 mx-auto mb-16 max-w-2xl text-lg">
          We exist to push the boundaries of technology, creating innovations
          that transform lives and make the world better for everyone, without
          exception
        </p>
        <div className="grid gap-8 md:grid-cols-3">
          {purposeItems.map((item, index) => (
            <motion.div
              key={index}
              className="bg-foreground/5 group relative rounded-xl p-8"
              whileHover={{ y: -5 }}
            >
              <motion.div
                className="mb-6 flex justify-center"
                whileHover={{ rotate: 360, scale: 1.1 }}
                transition={{ duration: 0.5 }}
              >
                {item.icon}
              </motion.div>
              <h3 className="text-foreground mb-4 text-xl font-bold">
                {item.title}
              </h3>
              <p className="text-foreground/60">{item.description}</p>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* Vision Statement */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-center"
      >
        <blockquote className="relative">
          <p className="text-foreground relative text-2xl font-medium italic leading-relaxed md:text-3xl">
            &quot;In a world where technology often creates barriers, we&apos;re
            breaking them down. Our vision isn&apos;t just about building better
            software—it&apos;s about creating a future where groundbreaking
            technology is accessible to all. Every line of code we write, every
            solution we develop, is a step toward this future. This isn&apos;t
            just our mission; it&apos;s our unwavering commitment to
            humanity.&quot;
          </p>
          <footer className="text-foreground/60 mt-8 text-lg">
            — Vo Hoang Phuc
            <br />
            <span className="text-sm">Founder & CEO, Tuturuuu</span>
          </footer>
        </blockquote>
      </motion.section>

      {/* Achievements Section */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-center"
      >
        <h2 className="text-foreground mb-4 text-4xl font-bold">
          Our Achievements
        </h2>
        <p className="text-foreground/60 mx-auto mb-16 max-w-2xl text-lg">
          While we&apos;re proud of how far we&apos;ve come, we see our
          achievements not as destinations, but as stepping stones toward
          greater impact
        </p>
        <div className="grid gap-8 md:grid-cols-4">
          {achievementItems.map((item, index) => (
            <motion.div
              key={index}
              className="bg-foreground/5 group relative rounded-xl p-8"
              whileHover={{ y: -5 }}
            >
              <motion.div
                className="mb-6 flex justify-center"
                whileHover={{ rotate: 360, scale: 1.1 }}
                transition={{ duration: 0.5 }}
              >
                {item.icon}
              </motion.div>
              <h3 className="text-foreground mb-4 text-xl font-bold">
                {item.title}
              </h3>
              <p className="text-foreground/60">{item.description}</p>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* Future Vision Section */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-center"
      >
        <h2 className="text-foreground mb-4 text-4xl font-bold">
          Building Tomorrow
        </h2>
        <p className="text-foreground/60 mx-auto mb-16 max-w-2xl text-lg">
          Our vision for the future is bold and clear: to lead the next wave of
          technological innovation while ensuring it serves humanity&apos;s best
          interests
        </p>
        <div className="grid gap-8 md:grid-cols-4">
          {futureItems.map((item, index) => (
            <motion.div
              key={index}
              className="bg-foreground/5 group relative rounded-xl p-8"
              whileHover={{ y: -5 }}
            >
              <motion.div
                className="mb-6 flex justify-center"
                whileHover={{ rotate: 360, scale: 1.1 }}
                transition={{ duration: 0.5 }}
              >
                {item.icon}
              </motion.div>
              <h3 className="text-foreground mb-4 text-xl font-bold">
                {item.title}
              </h3>
              <p className="text-foreground/60">{item.description}</p>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* Impact Stats Section */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-center"
      >
        <h2 className="text-foreground mb-4 text-4xl font-bold">
          Our Growing Impact
        </h2>
        <p className="text-foreground/60 mx-auto mb-16 max-w-2xl text-lg">
          Every number represents lives touched, dreams enabled, and steps taken
          toward our vision of becoming a world-leading technology innovator
        </p>
        <div className="grid gap-8 md:grid-cols-4">
          {impactStats.map((stat, index) => (
            <motion.div
              key={index}
              className="group relative"
              whileHover={{ y: -5 }}
            >
              <div className="text-primary mb-2 text-3xl font-bold">
                {stat.value}
              </div>
              <div className="text-foreground mb-1 font-medium">
                {stat.label}
              </div>
              <div className="text-foreground/60 text-sm">
                {stat.description}
              </div>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* Join Us Section */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-center"
      >
        <h2 className="text-foreground mb-6 text-4xl font-bold">
          Be Part of Our Story
        </h2>
        <p className="text-foreground/80 mx-auto mb-12 max-w-2xl text-lg">
          Whether you&apos;re a visionary, creator, or someone who believes in
          the power of technology to transform lives, there&apos;s a place for
          you in our mission to revolutionize the world through innovation.
        </p>
        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
          <motion.a
            href="https://github.com/tutur3u"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-foreground hover:bg-foreground/90 text-background flex items-center gap-2 rounded-lg px-6 py-3 font-semibold transition-all duration-300"
            whileHover={{ scale: 1.05 }}
          >
            <Github className="h-5 w-5" />
            <span>Explore Our Work</span>
          </motion.a>
          <motion.a
            href="mailto:contact@tuturuuu.com"
            className="bg-foreground/10 hover:bg-foreground/20 flex items-center gap-2 rounded-lg px-6 py-3 font-semibold transition-all duration-300"
            whileHover={{ scale: 1.05 }}
          >
            <Mail className="h-5 w-5" />
            <span>Get in Touch</span>
          </motion.a>
        </div>
      </motion.section>
    </main>
  );
}
