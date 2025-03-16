'use client';

import GradientHeadline from '../../../../../gradient-headline';
import {
  Contributor,
  type Sponsor,
  type TeamMember,
  contributors,
  organizers,
  platformBuilders,
  sponsors,
} from './data';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { cn } from '@tuturuuu/utils/format';
import { motion, useScroll, useTransform } from 'framer-motion';
import {
  ArrowRight,
  Building,
  Code,
  Github,
  Globe,
  GraduationCap,
  HandHeart,
  Heart,
  Linkedin,
  Mail,
  RocketIcon,
  Sparkles,
  Target,
  Twitter,
  Users,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import React, { useRef } from 'react';

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring',
      stiffness: 100,
      damping: 15,
    },
  },
};

// Enhanced floating animation
const floatingVariants = {
  initial: { y: 0 },
  float: {
    y: [-8, 8],
    transition: {
      duration: 5,
      repeat: Infinity,
      repeatType: 'mirror' as const,
      ease: 'easeInOut',
    },
  },
};

export function AboutUsPage() {
  const scrollRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: scrollRef,
    offset: ['start start', 'end start'],
  });

  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.5], [1, 0.8]);

  // Render team member card with enhanced design
  const renderTeamMember = (member: TeamMember) => (
    <motion.div
      variants={itemVariants}
      whileHover={{ y: -5, transition: { duration: 0.2 } }}
      className="group"
    >
      <Card className="h-full overflow-hidden border-foreground/10 bg-foreground/5 text-center transition-all duration-300 group-hover:border-primary/30 group-hover:bg-foreground/10 group-hover:shadow-lg group-hover:shadow-primary/5">
        <div className="relative p-6">
          {/* Animated gradient border on hover */}
          <motion.div
            className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            animate={{
              background: [
                'linear-gradient(45deg, rgba(var(--primary-rgb), 0.3) 0%, rgba(var(--primary-rgb), 0.1) 25%, rgba(var(--primary-rgb), 0) 50%, rgba(var(--primary-rgb), 0.1) 75%, rgba(var(--primary-rgb), 0.3) 100%)',
                'linear-gradient(45deg, rgba(var(--primary-rgb), 0.3) 100%, rgba(var(--primary-rgb), 0.1) 0%, rgba(var(--primary-rgb), 0) 25%, rgba(var(--primary-rgb), 0.1) 50%, rgba(var(--primary-rgb), 0.3) 75%)',
              ],
            }}
            transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
          />

          <div className="mb-4 flex flex-col items-center justify-center gap-4">
            <div className="relative h-32 w-32 overflow-hidden rounded-full border-2 border-primary/20 bg-foreground/10">
              <Image
                src={member.image}
                alt={member.name}
                fill
                className="object-cover transition-transform duration-500 group-hover:scale-110"
              />
              {/* Glow effect on hover */}
              <motion.div
                className="absolute inset-0 opacity-0 group-hover:opacity-100"
                initial={{ boxShadow: '0 0 0 0 rgba(var(--primary-rgb), 0)' }}
                whileHover={{
                  boxShadow: '0 0 20px 0 rgba(var(--primary-rgb), 0.3)',
                }}
                transition={{ duration: 0.3 }}
              />
            </div>
            <div className="flex flex-col items-center justify-center gap-2 text-center">
              <motion.h3
                className="text-xl font-bold transition-colors duration-300 group-hover:text-primary"
                whileHover={{ scale: 1.02 }}
              >
                {member.name}
              </motion.h3>
              <p className="text-sm text-primary">{member.role}</p>
              {member.organization && (
                <Badge variant="outline" className="mt-1 bg-primary/5 text-xs">
                  {member.organization}
                </Badge>
              )}
            </div>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">{member.bio}</p>
          {member.links && (
            <div className="flex justify-center gap-2">
              {member.links.twitter && (
                <Link
                  href={member.links.twitter}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full bg-foreground/10 p-2 text-muted-foreground transition-colors hover:bg-primary/20 hover:text-primary"
                >
                  <motion.div
                    whileHover={{ rotate: 15, scale: 1.2 }}
                    transition={{ type: 'spring', stiffness: 300 }}
                  >
                    <Twitter className="h-4 w-4" />
                  </motion.div>
                </Link>
              )}
              {member.links.linkedin && (
                <Link
                  href={member.links.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full bg-foreground/10 p-2 text-muted-foreground transition-colors hover:bg-primary/20 hover:text-primary"
                >
                  <motion.div
                    whileHover={{ rotate: 15, scale: 1.2 }}
                    transition={{ type: 'spring', stiffness: 300 }}
                  >
                    <Linkedin className="h-4 w-4" />
                  </motion.div>
                </Link>
              )}
              {member.links.github && (
                <Link
                  href={member.links.github}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full bg-foreground/10 p-2 text-muted-foreground transition-colors hover:bg-primary/20 hover:text-primary"
                >
                  <motion.div
                    whileHover={{ rotate: 15, scale: 1.2 }}
                    transition={{ type: 'spring', stiffness: 300 }}
                  >
                    <Github className="h-4 w-4" />
                  </motion.div>
                </Link>
              )}
              {member.links.website && (
                <Link
                  href={member.links.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full bg-foreground/10 p-2 text-muted-foreground transition-colors hover:bg-primary/20 hover:text-primary"
                >
                  <motion.div
                    whileHover={{ rotate: 15, scale: 1.2 }}
                    transition={{ type: 'spring', stiffness: 300 }}
                  >
                    <Globe className="h-4 w-4" />
                  </motion.div>
                </Link>
              )}
              {member.links.email && (
                <Link
                  href={`mailto:${member.links.email}`}
                  className="rounded-full bg-foreground/10 p-2 text-muted-foreground transition-colors hover:bg-primary/20 hover:text-primary"
                >
                  <motion.div
                    whileHover={{ rotate: 15, scale: 1.2 }}
                    transition={{ type: 'spring', stiffness: 300 }}
                  >
                    <Mail className="h-4 w-4" />
                  </motion.div>
                </Link>
              )}
            </div>
          )}
        </div>
      </Card>
    </motion.div>
  );

  // Render sponsor card with enhanced design
  const renderSponsor = (sponsor: Sponsor) => {
    const tierColors = {
      host: 'from-[#E5E4E2] to-[#B9B8B5]',
      platinum: 'from-[#E5E4E2] to-[#B9B8B5]',
      gold: 'from-[#FFD700] to-[#FFC000]',
      silver: 'from-[#C0C0C0] to-[#A9A9A9]',
      bronze: 'from-[#CD7F32] to-[#A46628]',
    };

    const tierGlows = {
      host: 'group-hover:shadow-[0_0_15px_rgba(229,228,226,0.3)]',
      platinum: 'group-hover:shadow-[0_0_15px_rgba(229,228,226,0.3)]',
      gold: 'group-hover:shadow-[0_0_15px_rgba(255,215,0,0.3)]',
      silver: 'group-hover:shadow-[0_0_15px_rgba(192,192,192,0.3)]',
      bronze: 'group-hover:shadow-[0_0_15px_rgba(205,127,50,0.3)]',
    };

    return (
      <motion.div
        variants={itemVariants}
        whileHover={{ y: -5, transition: { duration: 0.2 } }}
        className="group"
      >
        <Card
          className={cn(
            'h-full overflow-hidden border-foreground/10 bg-foreground/5 transition-all duration-300 group-hover:border-primary/30 group-hover:bg-foreground/10',
            tierGlows[sponsor.tier]
          )}
        >
          <div className="relative">
            {/* Animated gradient border on hover */}
            <motion.div
              className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              animate={{
                background: [
                  `linear-gradient(45deg, rgba(var(--primary-rgb), 0.3) 0%, rgba(var(--primary-rgb), 0.1) 25%, rgba(var(--primary-rgb), 0) 50%, rgba(var(--primary-rgb), 0.1) 75%, rgba(var(--primary-rgb), 0.3) 100%)`,
                  `linear-gradient(45deg, rgba(var(--primary-rgb), 0.3) 100%, rgba(var(--primary-rgb), 0.1) 0%, rgba(var(--primary-rgb), 0) 25%, rgba(var(--primary-rgb), 0.1) 50%, rgba(var(--primary-rgb), 0.3) 75%)`,
                ],
              }}
              transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
            />

            <div
              className={cn(
                'absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r',
                tierColors[sponsor.tier]
              )}
            />
            <div className="p-6">
              <div className="mb-4 flex flex-col items-center justify-between">
                <motion.div
                  className="relative h-24 w-24 overflow-hidden rounded-lg"
                  whileHover={{ scale: 1.05 }}
                  transition={{ type: 'spring', stiffness: 300 }}
                >
                  <Image
                    src={sponsor.logo}
                    alt={sponsor.name}
                    fill
                    className="object-contain"
                  />
                </motion.div>
                <Badge
                  variant="outline"
                  className={cn(
                    'mt-2 mb-4 bg-gradient-to-r bg-clip-text text-transparent',
                    tierColors[sponsor.tier]
                  )}
                >
                  <motion.span
                    animate={{
                      textShadow: [
                        '0 0 5px rgba(255, 255, 255, 0.1)',
                        '0 0 10px rgba(255, 255, 255, 0.2)',
                        '0 0 5px rgba(255, 255, 255, 0.1)',
                      ],
                    }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    {sponsor.tier.charAt(0).toUpperCase() +
                      sponsor.tier.slice(1)}
                  </motion.span>
                </Badge>
              </div>
              <motion.h3
                className="mb-2 text-xl font-bold transition-colors duration-300 group-hover:text-primary"
                whileHover={{ scale: 1.02 }}
              >
                {sponsor.name}
              </motion.h3>
              <p className="mb-4 text-sm text-muted-foreground">
                {sponsor.description}
              </p>
              {/* <Link
                href={sponsor.website}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-sm text-primary hover:underline"
              >
                <motion.span
                  whileHover={{ x: 3 }}
                  transition={{ type: 'spring', stiffness: 300 }}
                  className="flex items-center gap-1"
                >
                  Visit website
                  <ExternalLink className="ml-1 h-3 w-3" />
                </motion.span>
              </Link> */}
            </div>
          </div>
        </Card>
      </motion.div>
    );
  };

  // Render contributor card with enhanced design
  const renderContributor = (contributor: Contributor) => (
    <motion.div variants={itemVariants}>
      <Card className="h-full overflow-hidden border-foreground/10 bg-foreground/5 transition-all duration-300 hover:border-primary/30 hover:bg-foreground/10 hover:shadow-md hover:shadow-primary/5">
        <div className="p-4">
          <div className="mb-2 flex items-center gap-3">
            <div>
              <h3 className="font-semibold">{contributor.name}</h3>
              <p className="text-xs text-muted-foreground">
                {contributor.contribution}
              </p>
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  );

  return (
    <div className="relative flex min-h-screen w-full flex-col items-center">
      {/* Enhanced Hero Section with Parallax Effect */}
      <section ref={scrollRef} className="relative w-full">
        <div className="absolute inset-0 bg-[radial-gradient(circle_800px_at_50%_-30%,rgba(var(--primary-rgb),0.15),transparent)]" />

        {/* Enhanced animated background elements */}
        <motion.div
          className="absolute top-20 left-10 h-64 w-64 rounded-full bg-primary/5 blur-3xl"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />

        <motion.div
          className="absolute right-10 bottom-20 h-64 w-64 rounded-full bg-primary/5 blur-3xl"
          animate={{
            scale: [1, 1.3, 1],
            opacity: [0.2, 0.4, 0.2],
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: 1,
          }}
        />

        {/* Animated particles */}
        {[...Array(30)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute h-1 w-1 rounded-full bg-primary/40"
            style={{
              top: `${Math.random() * 100}%`,
              left: `${Math.random() * 100}%`,
              filter: `blur(${Math.random() > 0.8 ? '1px' : '0px'})`,
            }}
            animate={{
              y: [0, -100],
              x: [0, Math.random() * 20 - 10],
              opacity: [0, Math.random() * 0.5 + 0.3, 0],
              scale: [Math.random() * 0.5 + 0.5, Math.random() * 1 + 1],
            }}
            transition={{
              duration: 5 + Math.random() * 10,
              repeat: Infinity,
              delay: Math.random() * 5,
            }}
          />
        ))}

        {/* Animated code snippets */}
        {[...Array(5)].map((_, i) => (
          <motion.div
            key={`code-${i}`}
            className="absolute font-mono text-xs text-primary/20"
            style={{
              top: `${20 + Math.random() * 60}%`,
              left: `${Math.random() * 80}%`,
              transform: `rotate(${Math.random() * 20 - 10}deg)`,
            }}
            initial={{ opacity: 0 }}
            animate={{
              opacity: [0, 0.3, 0],
              y: [0, -30],
            }}
            transition={{
              duration: 8 + Math.random() * 5,
              repeat: Infinity,
              delay: Math.random() * 5,
            }}
          >
            {`prompt = "${['Generate creative solution', 'Optimize for clarity', 'Enhance user experience', 'Design innovative UI', 'Create engaging content'][i % 5]}"`}
          </motion.div>
        ))}

        <motion.div
          style={{ opacity, scale }}
          className="relative mx-auto flex max-w-6xl flex-col items-center justify-center px-4 py-24 sm:py-32"
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Badge
              variant="outline"
              className="mb-8 bg-foreground/10 backdrop-blur-sm"
            >
              <motion.div
                animate={{
                  boxShadow: [
                    '0 0 0 0 rgba(var(--primary-rgb), 0)',
                    '0 0 0 8px rgba(var(--primary-rgb), 0.2)',
                    '0 0 0 0 rgba(var(--primary-rgb), 0)',
                  ],
                }}
                transition={{ duration: 2, repeat: Infinity }}
                className="mr-2 flex h-4 w-4 items-center justify-center rounded-full"
              >
                <Users className="h-4 w-4" />
              </motion.div>
              <span>Our Team</span>
            </Badge>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
            className="mb-6 text-center text-4xl font-bold tracking-tight text-balance text-foreground md:text-6xl"
          >
            The People Behind
            <br />
            <motion.div
              whileHover={{ scale: 1.05 }}
              transition={{ type: 'spring', stiffness: 300 }}
            >
              <GradientHeadline title="NEO League" />
            </motion.div>
          </motion.h1>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.8 }}
            className="mb-8 max-w-2xl text-center text-lg text-balance text-foreground/50"
          >
            Meet the team of organizers, developers, sponsors, and contributors
            who make the NEO League - Prompt the Future 2025 possible.
          </motion.div>

          {/* Collaboration highlight */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.8 }}
            className="mb-12 flex flex-wrap items-center justify-center gap-8"
          >
            <div className="flex flex-col items-center">
              <div className="relative overflow-hidden rounded-full">
                <Image
                  src="/media/featured/competitions/neo-league/nct.jpg"
                  alt="RMIT SGS Neo Culture Tech"
                  className="hidden rounded-full object-contain md:block"
                  width={192}
                  height={192}
                />
                <Image
                  src="/media/featured/competitions/neo-league/nct.jpg"
                  alt="RMIT SGS Neo Culture Tech"
                  className="rounded-full object-contain md:hidden"
                  width={80}
                  height={80}
                />
              </div>
            </div>

            <div className="text-2xl font-light text-primary">×</div>

            <div className="flex flex-col items-center">
              <div className="relative overflow-hidden">
                <Image
                  src="/media/logos/transparent.png"
                  alt="Tuturuuu"
                  className="hidden object-contain md:block"
                  width={160}
                  height={160}
                />
                <Image
                  src="/media/logos/transparent.png"
                  alt="Tuturuuu"
                  className="object-contain md:hidden"
                  width={80}
                  height={80}
                />
              </div>
            </div>
          </motion.div>
        </motion.div>
      </section>

      {/* Neo League Introduction Section */}
      <section className="w-full bg-foreground/5 py-16">
        <div className="mx-auto max-w-6xl px-4">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="grid gap-8 md:grid-cols-2 md:items-center"
          >
            <div>
              <Badge variant="outline" className="mb-4">
                <RocketIcon className="mr-2 h-4 w-4" />
                First Ever Collaboration
              </Badge>
              <h2 className="mb-4 text-3xl font-bold">
                NEO League - Prompt the Future 2025
              </h2>
              <p className="mb-6 text-muted-foreground">
                The first-ever prompt engineering competition hosted by RMIT SGS
                Neo Culture Tech club, with technical and platform support from
                Tuturuuu, a pioneer in AI and smart productivity tools.
              </p>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="mt-1 rounded-full bg-primary/10 p-1.5">
                    <Target className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-medium">Innovative Challenges</h3>
                    <p className="text-sm text-muted-foreground">
                      Participants tackle real-world AI prompt engineering
                      problems designed by industry experts.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-1 rounded-full bg-primary/10 p-1.5">
                    <GraduationCap className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-medium">Skill Development</h3>
                    <p className="text-sm text-muted-foreground">
                      Comprehensive learning resources and mentorship to help
                      participants master prompt engineering.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-1 rounded-full bg-primary/10 p-1.5">
                    <Users className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-medium">Community Building</h3>
                    <p className="text-sm text-muted-foreground">
                      Connect with like-minded AI enthusiasts and industry
                      professionals throughout the competition.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="relative"
            >
              <div className="relative aspect-video overflow-hidden rounded-xl border border-primary/20 bg-foreground/5">
                {/* Animated gradient background */}
                <motion.div
                  className="absolute inset-0 bg-gradient-to-br from-primary/20 via-purple-500/10 to-blue-500/5"
                  animate={{
                    background: [
                      'linear-gradient(to bottom right, rgba(var(--primary-rgb), 0.2), rgba(147, 51, 234, 0.1), rgba(59, 130, 246, 0.05))',
                      'linear-gradient(to bottom right, rgba(59, 130, 246, 0.05), rgba(var(--primary-rgb), 0.2), rgba(147, 51, 234, 0.1))',
                      'linear-gradient(to bottom right, rgba(147, 51, 234, 0.1), rgba(59, 130, 246, 0.05), rgba(var(--primary-rgb), 0.2))',
                    ],
                  }}
                  transition={{
                    duration: 10,
                    repeat: Infinity,
                    ease: 'linear',
                  }}
                />

                {/* Floating particles */}
                {[...Array(15)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute h-1.5 w-1.5 rounded-full bg-primary/40"
                    style={{
                      top: `${Math.random() * 100}%`,
                      left: `${Math.random() * 100}%`,
                    }}
                    animate={{
                      y: [0, -20],
                      x: [0, Math.random() * 10 - 5],
                      opacity: [0, 1, 0],
                    }}
                    transition={{
                      duration: 3 + Math.random() * 3,
                      repeat: Infinity,
                      delay: Math.random() * 5,
                    }}
                  />
                ))}

                {/* Content */}
                <div className="relative z-10 flex h-full flex-col items-center justify-center p-8">
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    whileInView={{ scale: 1, opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ type: 'spring', stiffness: 100 }}
                    className="mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-primary/30 to-purple-500/20 backdrop-blur-sm"
                  >
                    <RocketIcon className="h-10 w-10 text-primary" />
                  </motion.div>

                  <motion.h3
                    className="mb-2 bg-gradient-to-r from-primary via-purple-500 to-blue-500 bg-clip-text text-center text-2xl font-bold text-transparent"
                    initial={{ y: 10, opacity: 0 }}
                    whileInView={{ y: 0, opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.2 }}
                  >
                    Join the Revolution
                  </motion.h3>

                  <motion.p
                    className="text-center text-sm text-muted-foreground"
                    initial={{ y: 10, opacity: 0 }}
                    whileInView={{ y: 0, opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.3 }}
                  >
                    Be part of the first-ever prompt engineering competition
                    that's shaping the future of AI interaction
                  </motion.p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Prompt Engineering Story Section */}
      <section className="relative w-full py-24">
        <div className="absolute inset-0 bg-[radial-gradient(circle_800px_at_50%_-30%,rgba(var(--primary-rgb),0.1),transparent)]" />

        {/* Animated code snippets background */}
        <div className="absolute inset-0 overflow-hidden opacity-5">
          {[...Array(10)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute font-mono text-xs"
              style={{
                top: `${Math.random() * 100}%`,
                left: `${Math.random() * 100}%`,
                transform: `rotate(${Math.random() * 20 - 10}deg)`,
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0.3, 0.7, 0.3] }}
              transition={{
                duration: 3 + Math.random() * 5,
                repeat: Infinity,
                delay: Math.random() * 5,
              }}
            >
              {`prompt = "Generate a creative solution for ${i}"`}
            </motion.div>
          ))}
        </div>

        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-16 text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <Badge variant="outline" className="mb-4">
                <Sparkles className="mr-2 h-4 w-4" />
                The Art & Science
              </Badge>
              <h2 className="mb-6 text-4xl font-bold md:text-5xl">
                What is{' '}
                <span className="bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">
                  Prompt Engineering?
                </span>
              </h2>
              <p className="mx-auto mb-12 max-w-3xl text-lg text-muted-foreground">
                The emerging discipline that bridges human creativity with
                artificial intelligence, unlocking the full potential of AI
                systems through carefully crafted instructions.
              </p>
            </motion.div>

            {/* Visual explanation with cards */}
            <div className="grid gap-8 md:grid-cols-3">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 }}
                className="group"
              >
                <Card className="h-full overflow-hidden border-foreground/10 bg-foreground/5 transition-all duration-300 group-hover:border-primary/30 group-hover:bg-foreground/10 group-hover:shadow-lg group-hover:shadow-primary/5">
                  <div className="relative p-6">
                    {/* 3D hover effect */}
                    <motion.div
                      className="absolute inset-0"
                      style={{
                        transformStyle: 'preserve-3d',
                        perspective: '1000px',
                      }}
                      whileHover={{
                        rotateX: 5,
                        rotateY: 5,
                        transition: { duration: 0.3 },
                      }}
                    />

                    {/* Animated gradient border */}
                    <motion.div
                      className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                      animate={{
                        background: [
                          'linear-gradient(45deg, rgba(var(--primary-rgb), 0.3) 0%, rgba(var(--primary-rgb), 0.1) 25%, rgba(var(--primary-rgb), 0) 50%, rgba(var(--primary-rgb), 0.1) 75%, rgba(var(--primary-rgb), 0.3) 100%)',
                          'linear-gradient(45deg, rgba(var(--primary-rgb), 0.3) 100%, rgba(var(--primary-rgb), 0.1) 0%, rgba(var(--primary-rgb), 0) 25%, rgba(var(--primary-rgb), 0.1) 50%, rgba(var(--primary-rgb), 0.3) 75%)',
                        ],
                      }}
                      transition={{
                        duration: 3,
                        repeat: Infinity,
                        ease: 'linear',
                      }}
                    />

                    <div className="relative mb-4 flex justify-center">
                      <motion.div
                        className="rounded-full bg-primary/10 p-4"
                        whileHover={{
                          boxShadow: '0 0 20px 0 rgba(var(--primary-rgb), 0.3)',
                          scale: 1.05,
                        }}
                      >
                        <motion.div
                          animate={{ rotate: [0, 5, 0, -5, 0] }}
                          transition={{ duration: 5, repeat: Infinity }}
                        >
                          <Code className="h-8 w-8 text-primary" />
                        </motion.div>
                      </motion.div>
                    </div>
                    <motion.h3
                      className="mb-2 bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-center text-xl font-bold text-transparent"
                      whileHover={{ scale: 1.02 }}
                    >
                      The Language of AI
                    </motion.h3>
                    <p className="text-center text-muted-foreground">
                      Prompt engineering is the art of communicating effectively
                      with AI systems, crafting precise instructions that guide
                      models toward desired outputs.
                    </p>
                  </div>
                </Card>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2 }}
                className="group"
              >
                <Card className="h-full overflow-hidden border-foreground/10 bg-foreground/5 transition-all duration-300 group-hover:border-primary/30 group-hover:bg-foreground/10 group-hover:shadow-lg group-hover:shadow-primary/5">
                  <div className="relative p-6">
                    {/* 3D hover effect */}
                    <motion.div
                      className="absolute inset-0"
                      style={{
                        transformStyle: 'preserve-3d',
                        perspective: '1000px',
                      }}
                      whileHover={{
                        rotateX: -5,
                        rotateY: 5,
                        transition: { duration: 0.3 },
                      }}
                    />

                    {/* Animated gradient border */}
                    <motion.div
                      className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                      animate={{
                        background: [
                          'linear-gradient(45deg, rgba(var(--primary-rgb), 0.3) 0%, rgba(var(--primary-rgb), 0.1) 25%, rgba(var(--primary-rgb), 0) 50%, rgba(var(--primary-rgb), 0.1) 75%, rgba(var(--primary-rgb), 0.3) 100%)',
                          'linear-gradient(45deg, rgba(var(--primary-rgb), 0.3) 100%, rgba(var(--primary-rgb), 0.1) 0%, rgba(var(--primary-rgb), 0) 25%, rgba(var(--primary-rgb), 0.1) 50%, rgba(var(--primary-rgb), 0.3) 75%)',
                        ],
                      }}
                      transition={{
                        duration: 3,
                        repeat: Infinity,
                        ease: 'linear',
                      }}
                    />

                    <div className="relative mb-4 flex justify-center">
                      <motion.div
                        className="rounded-full bg-primary/10 p-4"
                        whileHover={{
                          boxShadow: '0 0 20px 0 rgba(var(--primary-rgb), 0.3)',
                          scale: 1.05,
                        }}
                      >
                        <motion.div
                          animate={{ scale: [1, 1.1, 1] }}
                          transition={{ duration: 3, repeat: Infinity }}
                        >
                          <Target className="h-8 w-8 text-primary" />
                        </motion.div>
                      </motion.div>
                    </div>
                    <motion.h3
                      className="mb-2 bg-gradient-to-r from-purple-500 to-blue-500 bg-clip-text text-center text-xl font-bold text-transparent"
                      whileHover={{ scale: 1.02 }}
                    >
                      Precision & Creativity
                    </motion.h3>
                    <p className="text-center text-muted-foreground">
                      Combining technical precision with creative thinking to
                      unlock capabilities hidden within AI models, transforming
                      vague ideas into concrete results.
                    </p>
                  </div>
                </Card>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.3 }}
                className="group"
              >
                <Card className="h-full overflow-hidden border-foreground/10 bg-foreground/5 transition-all duration-300 group-hover:border-primary/30 group-hover:bg-foreground/10 group-hover:shadow-lg group-hover:shadow-primary/5">
                  <div className="relative p-6">
                    {/* 3D hover effect */}
                    <motion.div
                      className="absolute inset-0"
                      style={{
                        transformStyle: 'preserve-3d',
                        perspective: '1000px',
                      }}
                      whileHover={{
                        rotateX: 5,
                        rotateY: -5,
                        transition: { duration: 0.3 },
                      }}
                    />

                    {/* Animated gradient border */}
                    <motion.div
                      className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                      animate={{
                        background: [
                          'linear-gradient(45deg, rgba(var(--primary-rgb), 0.3) 0%, rgba(var(--primary-rgb), 0.1) 25%, rgba(var(--primary-rgb), 0) 50%, rgba(var(--primary-rgb), 0.1) 75%, rgba(var(--primary-rgb), 0.3) 100%)',
                          'linear-gradient(45deg, rgba(var(--primary-rgb), 0.3) 100%, rgba(var(--primary-rgb), 0.1) 0%, rgba(var(--primary-rgb), 0) 25%, rgba(var(--primary-rgb), 0.1) 50%, rgba(var(--primary-rgb), 0.3) 75%)',
                        ],
                      }}
                      transition={{
                        duration: 3,
                        repeat: Infinity,
                        ease: 'linear',
                      }}
                    />

                    <div className="relative mb-4 flex justify-center">
                      <motion.div
                        className="rounded-full bg-primary/10 p-4"
                        whileHover={{
                          boxShadow: '0 0 20px 0 rgba(var(--primary-rgb), 0.3)',
                          scale: 1.05,
                        }}
                      >
                        <motion.div
                          animate={{
                            boxShadow: [
                              '0 0 0 0 rgba(var(--primary-rgb), 0.4)',
                              '0 0 0 10px rgba(var(--primary-rgb), 0)',
                              '0 0 0 0 rgba(var(--primary-rgb), 0)',
                            ],
                          }}
                          transition={{ duration: 2, repeat: Infinity }}
                          className="rounded-full"
                        >
                          <RocketIcon className="h-8 w-8 text-primary" />
                        </motion.div>
                      </motion.div>
                    </div>
                    <motion.h3
                      className="mb-2 bg-gradient-to-r from-blue-500 to-primary bg-clip-text text-center text-xl font-bold text-transparent"
                      whileHover={{ scale: 1.02 }}
                    >
                      The Future of Work
                    </motion.h3>
                    <p className="text-center text-muted-foreground">
                      A critical skill for the AI era, enabling professionals
                      across industries to leverage AI as a powerful tool for
                      innovation and problem-solving.
                    </p>
                  </div>
                </Card>
              </motion.div>
            </div>
          </div>

          {/* Why Prompt Engineering Matters */}
          <div className="mb-16">
            <div className="grid gap-12 md:grid-cols-2 md:items-center">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
              >
                <Badge variant="outline" className="mb-4">
                  Why It Matters
                </Badge>
                <h3 className="mb-4 text-3xl font-bold">
                  The Bridge Between Human Intent and AI Capability
                </h3>
                <p className="mb-6 text-muted-foreground">
                  As AI systems become increasingly powerful, the ability to
                  direct them effectively becomes crucial. Prompt engineering is
                  the key that unlocks their potential, transforming these
                  sophisticated tools into practical solutions for real-world
                  challenges.
                </p>

                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-1 rounded-full bg-primary/10 p-1.5">
                      <Users className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-medium">Democratizing AI</h4>
                      <p className="text-sm text-muted-foreground">
                        Making advanced AI accessible to everyone, regardless of
                        technical background.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="mt-1 rounded-full bg-primary/10 p-1.5">
                      <Target className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-medium">Precision Control</h4>
                      <p className="text-sm text-muted-foreground">
                        Achieving specific, accurate results from
                        general-purpose AI models.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="mt-1 rounded-full bg-primary/10 p-1.5">
                      <GraduationCap className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <h4 className="font-medium">Skill of the Future</h4>
                      <p className="text-sm text-muted-foreground">
                        A critical competency for professionals in the rapidly
                        evolving AI landscape.
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                className="relative"
              >
                <div className="relative aspect-square overflow-hidden rounded-2xl border border-primary/10 bg-foreground/5">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent" />

                  {/* Interactive prompt visualization */}
                  <div className="absolute inset-0 flex items-center justify-center p-8">
                    <motion.div
                      className="w-full max-w-md rounded-lg border border-primary/20 bg-background/80 p-4 backdrop-blur-sm"
                      initial={{ y: 0 }}
                      animate={{ y: [-5, 5, -5] }}
                      transition={{
                        duration: 6,
                        repeat: Infinity,
                        ease: 'easeInOut',
                      }}
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full bg-red-500" />
                        <div className="h-3 w-3 rounded-full bg-yellow-500" />
                        <div className="h-3 w-3 rounded-full bg-green-500" />
                        <div className="ml-auto text-xs text-muted-foreground">
                          prompt.ai
                        </div>
                      </div>

                      <div className="mb-4 rounded bg-foreground/5 p-3 font-mono text-xs">
                        <motion.span
                          className="text-primary"
                          animate={{ opacity: [1, 0.5, 1] }}
                          transition={{ duration: 2, repeat: Infinity }}
                        >
                          &gt;
                        </motion.span>{' '}
                        Create a detailed plan for a sustainable smart city that
                        integrates AI for resource management
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-primary/20" />
                        <div className="flex-1">
                          <div className="h-2 w-3/4 rounded bg-foreground/10" />
                          <div className="mt-1 h-2 w-1/2 rounded bg-foreground/10" />
                        </div>
                      </div>

                      <motion.div
                        className="mt-3 h-24 rounded bg-foreground/5"
                        animate={{
                          background: [
                            'rgba(var(--foreground-rgb), 0.05)',
                            'rgba(var(--primary-rgb), 0.1)',
                            'rgba(var(--foreground-rgb), 0.05)',
                          ],
                        }}
                        transition={{ duration: 3, repeat: Infinity }}
                      />
                    </motion.div>
                  </div>
                </div>

                <motion.div
                  variants={floatingVariants}
                  initial="initial"
                  animate="float"
                  className="absolute -right-6 -bottom-6 rounded-lg border border-primary/20 bg-background/80 p-4 backdrop-blur-sm"
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <p className="text-sm font-medium">AI Transformation</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Unlocking potential through prompts
                  </p>
                </motion.div>
              </motion.div>
            </div>
          </div>

          {/* Why Now & Why Us */}
          <div className="mb-16 rounded-2xl border border-primary/10 bg-foreground/5 p-8">
            <div className="grid gap-8 md:grid-cols-2">
              <div>
                <Badge variant="outline" className="mb-4">
                  <RocketIcon className="mr-2 h-4 w-4" />
                  Why Now
                </Badge>
                <h3 className="mb-4 text-2xl font-bold">The Perfect Moment</h3>
                <p className="mb-6 text-muted-foreground">
                  We're at a pivotal moment in AI development. Large language
                  models have reached a level of capability where prompt
                  engineering is no longer just a technical skill—it's a
                  creative discipline with transformative potential across
                  industries.
                </p>

                <div className="relative h-40 overflow-hidden rounded-lg border border-primary/10">
                  <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent" />
                  <motion.div
                    className="absolute inset-0 flex items-center justify-center"
                    animate={{
                      background: [
                        'radial-gradient(circle at 50% 50%, rgba(var(--primary-rgb), 0.1), transparent 70%)',
                        'radial-gradient(circle at 50% 50%, rgba(var(--primary-rgb), 0.2), transparent 70%)',
                        'radial-gradient(circle at 50% 50%, rgba(var(--primary-rgb), 0.1), transparent 70%)',
                      ],
                    }}
                    transition={{ duration: 4, repeat: Infinity }}
                  >
                    <motion.div
                      animate={{ scale: [1, 1.05, 1] }}
                      transition={{ duration: 3, repeat: Infinity }}
                    >
                      <div className="text-center">
                        <h4 className="text-xl font-bold">2025</h4>
                        <p className="text-sm text-muted-foreground">
                          The Year of Prompt Engineering
                        </p>
                      </div>
                    </motion.div>
                  </motion.div>
                </div>
              </div>

              <div>
                <Badge variant="outline" className="mb-4">
                  <Users className="mr-2 h-4 w-4" />
                  Why Us
                </Badge>
                <h3 className="mb-4 text-2xl font-bold">
                  Pioneering Excellence
                </h3>
                <p className="mb-6 text-muted-foreground">
                  The collaboration between RMIT SGS Neo Culture Tech club and
                  Tuturuuu brings together academic rigor and technical
                  innovation. We're uniquely positioned to create a competition
                  that challenges participants while providing the resources
                  they need to excel.
                </p>

                <div className="relative h-40 overflow-hidden rounded-lg border border-primary/10">
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent to-primary/10" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="grid grid-cols-2 gap-4">
                      <motion.div
                        className="flex flex-col items-center"
                        animate={{ y: [-5, 5, -5] }}
                        transition={{
                          duration: 4,
                          repeat: Infinity,
                          ease: 'easeInOut',
                        }}
                      >
                        <div className="relative h-16 w-16 overflow-hidden rounded-full border-2 border-primary/20">
                          <Image
                            src="/media/featured/competitions/neo-league/nct.jpg"
                            alt="RMIT SGS Neo Culture Tech"
                            fill
                            className="object-contain"
                          />
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          Academic Excellence
                        </p>
                      </motion.div>

                      <motion.div
                        className="flex flex-col items-center"
                        animate={{ y: [5, -5, 5] }}
                        transition={{
                          duration: 4,
                          repeat: Infinity,
                          ease: 'easeInOut',
                        }}
                      >
                        <div className="relative h-16 w-16 overflow-hidden rounded-full border-2 border-primary/20">
                          <Image
                            src="/media/logos/light.png"
                            alt="Tuturuuu"
                            fill
                            className="object-contain"
                          />
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">
                          Technical Innovation
                        </p>
                      </motion.div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content with Enhanced Tabs */}
      <section className="w-full py-16">
        <div className="mx-auto max-w-6xl px-4">
          <Tabs defaultValue="organizers" className="w-full">
            <TabsList className="mb-8 grid h-full w-full grid-cols-2 gap-1 md:grid-cols-4">
              <TabsTrigger value="organizers" className="gap-2">
                <Users className="h-4 w-4" />
                <span>Organizers</span>
              </TabsTrigger>
              <TabsTrigger value="builders" className="gap-2">
                <Code className="h-4 w-4" />
                <span>Platform Builders</span>
              </TabsTrigger>
              <TabsTrigger value="sponsors" className="gap-2">
                <Building className="h-4 w-4" />
                <span>Sponsors</span>
              </TabsTrigger>
              <TabsTrigger value="thanks" className="gap-2">
                <Heart className="h-4 w-4" />
                <span>Special Thanks</span>
              </TabsTrigger>
            </TabsList>

            {/* Organizers Tab */}
            <TabsContent value="organizers">
              <div className="mb-8">
                <h2 className="mb-2 text-2xl font-bold">
                  <span className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" />
                    Organizers
                  </span>
                </h2>
                <p className="text-muted-foreground">
                  The team leading the NEO League initiative and competition.
                </p>
              </div>

              <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
              >
                {organizers.map((member, index) => (
                  <React.Fragment key={index}>
                    {renderTeamMember(member)}
                  </React.Fragment>
                ))}
              </motion.div>
            </TabsContent>

            {/* Platform Builders Tab */}
            <TabsContent value="builders">
              <div className="mb-8">
                <h2 className="mb-2 text-2xl font-bold">
                  <span className="flex items-center gap-2">
                    <Code className="h-5 w-5 text-primary" />
                    Platform Builders
                  </span>
                </h2>
                <p className="text-muted-foreground">
                  The development team who built the NEO League platform,
                  powered by Tuturuuu technology.
                </p>
              </div>

              <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
              >
                {platformBuilders.map((member, index) => (
                  <React.Fragment key={index}>
                    {renderTeamMember(member)}
                  </React.Fragment>
                ))}
              </motion.div>
            </TabsContent>

            {/* Sponsors Tab */}
            <TabsContent value="sponsors">
              <div className="mb-8">
                <h2 className="mb-2 text-2xl font-bold">
                  <span className="flex items-center gap-2">
                    <Building className="h-5 w-5 text-primary" />
                    Our Sponsors
                  </span>
                </h2>
                <p className="text-muted-foreground">
                  Organizations supporting the NEO League initiative.
                </p>
              </div>

              <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
              >
                {sponsors.map((sponsor, index) => (
                  <React.Fragment key={index}>
                    {renderSponsor(sponsor)}
                  </React.Fragment>
                ))}
              </motion.div>

              <div className="mt-12 text-center">
                <h3 className="mb-4 text-xl font-semibold">
                  Interested in sponsoring NEO League?
                </h3>
                <Link href="mailto:contact@tuturuuu.com">
                  <Button className="group">
                    Contact Us
                    <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </Button>
                </Link>
              </div>
            </TabsContent>

            {/* Special Thanks Tab */}
            <TabsContent value="thanks">
              <div className="mb-8">
                <h2 className="mb-2 text-2xl font-bold">
                  <span className="flex items-center gap-2">
                    <Heart className="h-5 w-5 text-primary" />
                    Special Thanks
                  </span>
                </h2>
                <p className="text-muted-foreground">
                  Contributors and supporters who helped make NEO League
                  possible.
                </p>
              </div>

              <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
              >
                {contributors.map((contributor, index) => (
                  <React.Fragment key={index}>
                    {renderContributor(contributor)}
                  </React.Fragment>
                ))}
              </motion.div>

              <div className="mt-12">
                <Card className="border-foreground/10 bg-foreground/5 p-6">
                  <div className="flex flex-col items-center gap-4 text-center md:flex-row md:text-left">
                    <div className="rounded-full bg-primary/10 p-3 text-primary">
                      <HandHeart className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="mb-2 text-xl font-semibold">
                        Community Contributions
                      </h3>
                      <p className="text-muted-foreground">
                        We'd like to thank all the community members,
                        volunteers, and participants who have contributed to
                        making NEO League a success. Your passion and dedication
                        drive us forward.
                      </p>
                    </div>
                  </div>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </section>

      {/* Tuturuuu Contribution Disclaimer Section */}
      <section className="relative w-full bg-foreground/5 py-16">
        <div className="absolute inset-0 bg-[radial-gradient(circle_600px_at_50%_50%,rgba(var(--primary-rgb),0.1),transparent)]" />

        {/* Animated particles */}
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={`particle-${i}`}
            className="absolute h-1 w-1 rounded-full bg-primary/30"
            style={{
              top: `${Math.random() * 100}%`,
              left: `${Math.random() * 100}%`,
              filter: `blur(${Math.random() > 0.8 ? '1px' : '0px'})`,
            }}
            animate={{
              y: [0, -50],
              x: [0, Math.random() * 30 - 15],
              opacity: [0, Math.random() * 0.5 + 0.3, 0],
            }}
            transition={{
              duration: 5 + Math.random() * 5,
              repeat: Infinity,
              delay: Math.random() * 5,
            }}
          />
        ))}

        <div className="mx-auto max-w-6xl px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="relative rounded-2xl border border-primary/20 bg-background/80 p-8 backdrop-blur-md"
          >
            <div className="flex flex-col items-center gap-8 md:flex-row">
              <motion.div
                className="relative flex-shrink-0"
                whileHover={{ scale: 1.05 }}
                transition={{ type: 'spring', stiffness: 300 }}
              >
                <div className="relative h-32 w-32 overflow-hidden rounded-xl border-2 border-primary/30">
                  <Image
                    src="/media/logos/transparent.png"
                    alt="Tuturuuu"
                    fill
                    className="object-contain p-2"
                  />
                  <motion.div
                    className="absolute inset-0"
                    animate={{
                      boxShadow: [
                        'inset 0 0 0 0 rgba(var(--primary-rgb), 0)',
                        'inset 0 0 20px 0 rgba(var(--primary-rgb), 0.3)',
                        'inset 0 0 0 0 rgba(var(--primary-rgb), 0)',
                      ],
                    }}
                    transition={{ duration: 3, repeat: Infinity }}
                  />
                </div>
                <motion.div
                  className="absolute -right-3 -bottom-3 rounded-full border border-primary/20 bg-primary/10 p-2 backdrop-blur-sm"
                  animate={{ rotate: [0, 10, 0, -10, 0] }}
                  transition={{ duration: 5, repeat: Infinity }}
                >
                  <Code className="h-5 w-5 text-primary" />
                </motion.div>
              </motion.div>

              <div>
                <h2 className="mb-4 text-3xl font-bold">
                  Powered by{' '}
                  <span className="bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">
                    Tuturuuu
                  </span>
                </h2>
                <motion.p
                  className="mb-4 text-muted-foreground"
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.2 }}
                >
                  The Tuturuuu team has been instrumental in making the Neo
                  League competition a reality. Beyond just providing the Nova
                  platform, Tuturuuu's contributions span across multiple
                  aspects of the competition:
                </motion.p>

                <motion.div
                  className="grid gap-4 sm:grid-cols-2"
                  variants={containerVariants}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                >
                  <motion.div
                    variants={itemVariants}
                    className="flex items-start gap-3"
                  >
                    <div className="mt-1 rounded-full bg-primary/10 p-1.5">
                      <Code className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-medium">Technical Infrastructure</h3>
                      <p className="text-sm text-muted-foreground">
                        Developing and maintaining the entire competition
                        platform, including the prompt evaluation system.
                      </p>
                    </div>
                  </motion.div>

                  <motion.div
                    variants={itemVariants}
                    className="flex items-start gap-3"
                  >
                    <div className="mt-1 rounded-full bg-primary/10 p-1.5">
                      <Target className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-medium">Challenge Design</h3>
                      <p className="text-sm text-muted-foreground">
                        Creating technically sound and educationally valuable
                        prompt engineering challenges.
                      </p>
                    </div>
                  </motion.div>

                  <motion.div
                    variants={itemVariants}
                    className="flex items-start gap-3"
                  >
                    <div className="mt-1 rounded-full bg-primary/10 p-1.5">
                      <GraduationCap className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-medium">Educational Resources</h3>
                      <p className="text-sm text-muted-foreground">
                        Developing learning materials and documentation to help
                        participants master prompt engineering.
                      </p>
                    </div>
                  </motion.div>

                  <motion.div
                    variants={itemVariants}
                    className="flex items-start gap-3"
                  >
                    <div className="mt-1 rounded-full bg-primary/10 p-1.5">
                      <Users className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-medium">Mentorship & Support</h3>
                      <p className="text-sm text-muted-foreground">
                        Providing technical guidance and mentorship to
                        participants throughout the competition.
                      </p>
                    </div>
                  </motion.div>
                </motion.div>

                <motion.div
                  className="mt-6 border-t border-primary/10 pt-4 text-sm text-muted-foreground"
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.6 }}
                >
                  <p className="italic">
                    "This competition represents our commitment to advancing
                    prompt engineering as a discipline and empowering the next
                    generation of AI practitioners. We're proud to collaborate
                    with RMIT SGS Neo Culture Tech to make this vision a
                    reality."
                  </p>
                  <p className="mt-2 font-medium text-foreground">
                    — The Tuturuuu Team
                  </p>
                </motion.div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
