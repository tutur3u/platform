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
} from '@tuturuuu/ui/icons';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { cn } from '@tuturuuu/utils/format';
import { motion, useScroll, useTransform } from 'framer-motion';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import Link from 'next/link';
import React, { useEffect, useRef, useState } from 'react';

// Define types for our animation data
interface ParticleData {
  top: string;
  left: string;
  blur: string;
  xOffset: number;
  opacity: number;
  scale: number[];
  duration: number;
  delay: number;
}

interface CodeSnippetData {
  top: string;
  left: string;
  rotation: number;
  duration: number;
  delay: number;
  content: string;
}

interface FloatingParticleData {
  top: string;
  left: string;
  xOffset: number;
  duration: number;
  delay: number;
}

interface CodeBackgroundData {
  top: string;
  left: string;
  rotation: number;
  duration: number;
  delay: number;
}

interface MoreParticleData {
  top: string;
  left: string;
  blur: string;
  xOffset: number;
  opacity: number;
  duration: number;
  delay: number;
}

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

export function AboutUsClient() {
  const t = useTranslations('nova.about');
  const scrollRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: scrollRef,
    offset: ['start start', 'end start'],
  });

  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.5], [1, 0.8]);

  // States to hold animation values that will be generated client-side
  const [particlesData, setParticlesData] = useState<ParticleData[]>([]);
  const [codeSnippetsData, setCodeSnippetsData] = useState<CodeSnippetData[]>(
    []
  );
  const [floatingParticlesData, setFloatingParticlesData] = useState<
    FloatingParticleData[]
  >([]);
  const [codeBackgroundData, setCodeBackgroundData] = useState<
    CodeBackgroundData[]
  >([]);
  const [moreParticlesData, setMoreParticlesData] = useState<
    MoreParticleData[]
  >([]);

  useEffect(() => {
    // Generate particles data
    setParticlesData(
      Array.from({ length: 30 }, () => ({
        top: `${Math.random() * 100}%`,
        left: `${Math.random() * 100}%`,
        blur: Math.random() > 0.8 ? '1px' : '0px',
        xOffset: Math.random() * 20 - 10,
        opacity: Math.random() * 0.5 + 0.3,
        scale: [Math.random() * 0.5 + 0.5, Math.random() * 1 + 1],
        duration: 5 + Math.random() * 10,
        delay: Math.random() * 5,
      }))
    );

    // Generate code snippets data
    setCodeSnippetsData(
      Array.from({ length: 5 }, (_, i) => ({
        top: `${20 + Math.random() * 60}%`,
        left: `${Math.random() * 80}%`,
        rotation: Math.random() * 20 - 10,
        duration: 8 + Math.random() * 5,
        delay: Math.random() * 5,
        content:
          [
            'Generate creative solution',
            'Optimize for clarity',
            'Enhance user experience',
            'Design innovative UI',
            'Create engaging content',
          ][i % 5] || '',
      }))
    );

    // Generate floating particles data
    setFloatingParticlesData(
      Array.from({ length: 15 }, () => ({
        top: `${Math.random() * 100}%`,
        left: `${Math.random() * 100}%`,
        xOffset: Math.random() * 10 - 5,
        duration: 3 + Math.random() * 3,
        delay: Math.random() * 5,
      }))
    );

    // Generate code background data
    setCodeBackgroundData(
      Array.from({ length: 10 }, () => ({
        top: `${Math.random() * 100}%`,
        left: `${Math.random() * 100}%`,
        rotation: Math.random() * 20 - 10,
        duration: 3 + Math.random() * 5,
        delay: Math.random() * 5,
      }))
    );

    // Generate more particles data
    setMoreParticlesData(
      Array.from({ length: 20 }, () => ({
        top: `${Math.random() * 100}%`,
        left: `${Math.random() * 100}%`,
        blur: Math.random() > 0.8 ? '1px' : '0px',
        xOffset: Math.random() * 30 - 15,
        opacity: Math.random() * 0.5 + 0.3,
        duration: 5 + Math.random() * 5,
        delay: Math.random() * 5,
      }))
    );
  }, []);

  const getOrganizerInfo = (t: any, tKey: string, type = 'organizers') => ({
    name: t(`${type}.members.${tKey}.name` as unknown as any),
    role: t(`${type}.members.${tKey}.role` as unknown as any),
    organization: t(`${type}.members.${tKey}.organization` as unknown as any),
    bio: t(`${type}.members.${tKey}.bio` as unknown as any),
  });

  // Render team member card with enhanced design
  const renderTeamMember = (member: TeamMember, type = 'organizers') => {
    const { name, role, bio, organization } = getOrganizerInfo(
      t,
      member.tKey,
      type
    );

    return (
      <motion.div
        variants={itemVariants}
        whileHover={{ y: -5, transition: { duration: 0.2 } }}
        className="group"
      >
        <Card className="border-foreground/10 bg-foreground/5 group-hover:border-primary/30 group-hover:bg-foreground/10 group-hover:shadow-primary/5 h-full overflow-hidden text-center transition-all duration-300 group-hover:shadow-lg">
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
              <div className="border-primary/20 bg-foreground/10 relative h-32 w-32 overflow-hidden rounded-full border-2">
                <Image
                  src={member.image}
                  alt={name}
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
                  className="group-hover:text-primary text-xl font-bold transition-colors duration-300"
                  whileHover={{ scale: 1.02 }}
                >
                  {name}
                </motion.h3>
                <p className="text-primary text-balance text-sm">{role}</p>
                {organization && (
                  <Badge
                    variant="outline"
                    className="bg-primary/5 mt-1 text-xs"
                  >
                    {organization}
                  </Badge>
                )}
              </div>
            </div>
            <p className="text-muted-foreground mb-4 text-balance text-sm">
              {bio}
            </p>
            {member.links && (
              <div className="flex justify-center gap-2">
                {member.links.twitter && (
                  <Link
                    href={member.links.twitter}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-foreground/10 text-muted-foreground hover:bg-primary/20 hover:text-primary rounded-full p-2 transition-colors"
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
                    className="bg-foreground/10 text-muted-foreground hover:bg-primary/20 hover:text-primary rounded-full p-2 transition-colors"
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
                    className="bg-foreground/10 text-muted-foreground hover:bg-primary/20 hover:text-primary rounded-full p-2 transition-colors"
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
                    className="bg-foreground/10 text-muted-foreground hover:bg-primary/20 hover:text-primary rounded-full p-2 transition-colors"
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
                    className="bg-foreground/10 text-muted-foreground hover:bg-primary/20 hover:text-primary rounded-full p-2 transition-colors"
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
  };

  // Render sponsor card with enhanced design
  const renderSponsor = (sponsor: Sponsor) => {
    const name = t(`sponsors.${sponsor.tKey}.name` as unknown as any);
    const description = t(
      `sponsors.${sponsor.tKey}.description` as unknown as any
    );

    const tierColors = {
      host: 'from-black to-black border-black/50 border dark:from-[#E5E4E2] dark:to-[#B9B8B5] dark:border-white/50',
      partner:
        'from-black to-black border-black/50 border dark:from-[#E5E4E2] dark:to-[#B9B8B5] dark:border-white/50',
      platinum:
        'from-black to-black border-black/50 border dark:from-[#E5E4E2] dark:to-[#B9B8B5] dark:border-white/50',
      gold: 'from-amber-500 to-amber-500 border-amber-500/50 border dark:from-[#FFD700] dark:to-[#FFC000] dark:border-amber-300/50',
      silver:
        'from-gray-500 to-gray-500 border-gray-500/50 border dark:from-[#C0C0C0] dark:to-[#A9A9A9] dark:border-gray-300/50',
      bronze:
        'from-amber-500 to-amber-500 border-amber-500/50 border dark:from-[#CD7F32] dark:to-[#A46628] dark:border-amber-300/50',
      diamond:
        'from-blue-500 to-blue-500 border-blue-500/50 border dark:from-[#B9F2FF] dark:to-[#4F9EC4] dark:border-blue-300/50',
    };

    const tierGlows = {
      host: 'group-hover:shadow-[0_0_15px_rgba(229,228,226,0.3)]',
      partner: 'group-hover:shadow-[0_0_15px_rgba(229,228,226,0.3)]',
      platinum: 'group-hover:shadow-[0_0_15px_rgba(229,228,226,0.3)]',
      gold: 'group-hover:shadow-[0_0_15px_rgba(255,215,0,0.3)]',
      silver: 'group-hover:shadow-[0_0_15px_rgba(192,192,192,0.3)]',
      bronze: 'group-hover:shadow-[0_0_15px_rgba(205,127,50,0.3)]',
      diamond: 'group-hover:shadow-[0_0_15px_rgba(185,242,255,0.3)]',
    };

    return (
      <motion.div
        variants={itemVariants}
        whileHover={{ y: -5, transition: { duration: 0.2 } }}
        className="group"
      >
        <Card
          className={cn(
            'border-foreground/10 bg-foreground/5 group-hover:border-primary/30 group-hover:bg-foreground/10 h-full overflow-hidden transition-all duration-300',
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
                'bg-linear-to-r absolute inset-x-0 top-0 h-1.5',
                tierColors[sponsor.tier]
              )}
            />
            <div className="p-6 text-center">
              <div className="mb-4 flex flex-col items-center justify-between">
                <motion.div
                  className="relative h-24 w-24 overflow-hidden rounded-lg"
                  whileHover={{ scale: 1.05 }}
                  transition={{ type: 'spring', stiffness: 300 }}
                >
                  <Image
                    src={sponsor.logo}
                    alt={name}
                    fill
                    className="object-contain"
                  />
                </motion.div>
                <Badge
                  variant="outline"
                  className={cn(
                    'bg-linear-to-r mt-2 bg-clip-text text-transparent',
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
                className="group-hover:text-primary mb-2 text-balance text-xl font-bold transition-colors duration-300"
                whileHover={{ scale: 1.02 }}
              >
                {name}
              </motion.h3>
              <p className="text-muted-foreground mb-4 text-balance text-sm">
                {description}
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
  const renderContributor = (contributor: Contributor) => {
    const name = t(
      `special-thanks.contributors.${contributor.tKey}.name` as unknown as any
    );
    const contribution = t(
      `special-thanks.contributors.${contributor.tKey}.contribution` as unknown as any
    );

    return (
      <motion.div variants={itemVariants}>
        <Card className="border-foreground/10 bg-foreground/5 hover:border-primary/30 hover:bg-foreground/10 hover:shadow-primary/5 h-full overflow-hidden transition-all duration-300 hover:shadow-md">
          <div className="p-4">
            <div className="mb-2 flex flex-col items-center justify-center gap-3 text-center">
              <h3 className="text-balance font-semibold">{name}</h3>
              <p className="text-muted-foreground text-balance text-xs">
                {contribution}
              </p>
            </div>
          </div>
        </Card>
      </motion.div>
    );
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col items-center">
      {/* Enhanced Hero Section with Parallax Effect */}
      <section ref={scrollRef} className="relative w-full">
        <div className="absolute inset-0 bg-[radial-gradient(circle_800px_at_50%_-30%,rgba(var(--primary-rgb),0.15),transparent)]" />

        {/* Enhanced animated background elements */}
        <motion.div
          className="bg-primary/5 absolute left-10 top-20 h-64 w-64 rounded-full blur-3xl"
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
          className="bg-primary/5 absolute bottom-20 right-10 h-64 w-64 rounded-full blur-3xl"
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

        {/* Animated particles - only rendered on client side */}
        {particlesData.map((particle, i) => (
          <motion.div
            key={i}
            className="bg-primary/40 absolute h-1 w-1 rounded-full"
            style={{
              top: particle.top,
              left: particle.left,
              filter: `blur(${particle.blur})`,
            }}
            animate={{
              y: [0, -100],
              x: [0, particle.xOffset],
              opacity: [0, particle.opacity, 0],
              scale: particle.scale,
            }}
            transition={{
              duration: particle.duration,
              repeat: Infinity,
              delay: particle.delay,
            }}
          />
        ))}

        {/* Animated code snippets */}
        {codeSnippetsData.map((snippet, i) => (
          <motion.div
            key={`code-${i}`}
            className="text-primary/20 absolute font-mono text-xs"
            style={{
              top: snippet.top,
              left: snippet.left,
              transform: `rotate(${snippet.rotation}deg)`,
            }}
            initial={{ opacity: 0 }}
            animate={{
              opacity: [0, 0.3, 0],
              y: [0, -30],
            }}
            transition={{
              duration: snippet.duration,
              repeat: Infinity,
              delay: snippet.delay,
            }}
          >
            {`prompt = "${snippet.content}"`}
          </motion.div>
        ))}

        <motion.div
          style={{ opacity, scale }}
          className="relative mx-auto flex max-w-6xl flex-col items-center justify-center px-4 py-24 sm:py-32"
        >
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
            className="text-foreground mb-6 text-balance text-center text-4xl font-bold tracking-tight md:text-6xl"
          >
            {t('title')}
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
            className="text-foreground/50 mb-8 max-w-2xl text-balance text-center text-lg"
          >
            {t('subtitle')}
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

            <div className="text-primary text-2xl font-light">×</div>

            <div className="flex flex-col items-center">
              <div className="relative overflow-hidden">
                <Image
                  src="/media/logos/nova-transparent.png"
                  alt="Tuturuuu"
                  className="hidden object-contain md:block"
                  width={160}
                  height={160}
                />
                <Image
                  src="/media/logos/nova-transparent.png"
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
      <section className="bg-foreground/5 w-full py-16">
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
                {t('event-intro.badge')}
              </Badge>
              <h2 className="mb-4 text-3xl font-bold">
                {t('event-intro.event-title')}
              </h2>
              <p className="text-muted-foreground mb-6 text-balance">
                {t('event-intro.event-description')}
              </p>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="bg-primary/10 mt-1 rounded-full p-1.5">
                    <Target className="text-primary h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-medium">
                      {t('event-intro.features.challengesTitle')}
                    </h3>
                    <p className="text-muted-foreground text-sm">
                      {t('event-intro.features.challengesDesc')}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="bg-primary/10 mt-1 rounded-full p-1.5">
                    <GraduationCap className="text-primary h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-medium">
                      {t('event-intro.features.skillsTitle')}
                    </h3>
                    <p className="text-muted-foreground text-sm">
                      {t('event-intro.features.skillsDesc')}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="bg-primary/10 mt-1 rounded-full p-1.5">
                    <Users className="text-primary h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-medium">
                      {t('event-intro.features.communityTitle')}
                    </h3>
                    <p className="text-muted-foreground text-sm">
                      {t('event-intro.features.communityDesc')}
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
              <div className="border-primary/20 bg-foreground/5 relative aspect-video overflow-hidden rounded-xl border">
                {/* Animated gradient background */}
                <motion.div
                  className="from-primary/20 bg-linear-to-br absolute inset-0 via-purple-500/10 to-blue-500/5"
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
                {floatingParticlesData.map((particle, i) => (
                  <motion.div
                    key={i}
                    className="bg-primary/40 absolute h-1.5 w-1.5 rounded-full"
                    style={{
                      top: particle.top,
                      left: particle.left,
                    }}
                    animate={{
                      y: [0, -20],
                      x: [0, particle.xOffset],
                      opacity: [0, 1, 0],
                    }}
                    transition={{
                      duration: particle.duration,
                      repeat: Infinity,
                      delay: particle.delay,
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
                    className="from-primary/30 bg-linear-to-br mb-4 flex h-24 w-24 items-center justify-center rounded-full to-purple-500/20 backdrop-blur-sm"
                  >
                    <RocketIcon className="text-primary h-10 w-10" />
                  </motion.div>

                  <motion.h3
                    className="from-primary bg-linear-to-r mb-2 via-purple-500 to-blue-500 bg-clip-text text-center text-2xl font-bold text-transparent"
                    initial={{ y: 10, opacity: 0 }}
                    whileInView={{ y: 0, opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.2 }}
                  >
                    {t('event-intro.call-to-action.title')}
                  </motion.h3>

                  <motion.p
                    className="text-muted-foreground text-center text-sm"
                    initial={{ y: 10, opacity: 0 }}
                    whileInView={{ y: 0, opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.3 }}
                  >
                    {t('event-intro.call-to-action.desc')}
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

        {/* Animated code snippets background - only rendered on client side */}
        <div className="absolute inset-0 overflow-hidden opacity-5">
          {codeBackgroundData.map((code, i) => (
            <motion.div
              key={i}
              className="absolute font-mono text-xs"
              style={{
                top: code.top,
                left: code.left,
                transform: `rotate(${code.rotation}deg)`,
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0.3, 0.7, 0.3] }}
              transition={{
                duration: code.duration,
                repeat: Infinity,
                delay: code.delay,
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
                {t('prompt-intro.badge')}
              </Badge>
              <h2 className="mb-6 text-4xl font-bold md:text-5xl">
                {t('prompt-intro.title1')}
                <span className="from-primary bg-linear-to-r to-purple-500 bg-clip-text text-transparent">
                  {t('prompt-intro.title2')}
                </span>
              </h2>
              <p className="text-muted-foreground mx-auto mb-12 max-w-3xl text-balance text-lg">
                {t('prompt-intro.description')}
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
                <Card className="border-foreground/10 bg-foreground/5 group-hover:border-primary/30 group-hover:bg-foreground/10 group-hover:shadow-primary/5 h-full overflow-hidden transition-all duration-300 group-hover:shadow-lg">
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
                        className="bg-primary/10 rounded-full p-4"
                        whileHover={{
                          boxShadow: '0 0 20px 0 rgba(var(--primary-rgb), 0.3)',
                          scale: 1.05,
                        }}
                      >
                        <motion.div
                          animate={{ rotate: [0, 5, 0, -5, 0] }}
                          transition={{ duration: 5, repeat: Infinity }}
                        >
                          <Code className="text-primary h-8 w-8" />
                        </motion.div>
                      </motion.div>
                    </div>
                    <motion.h3
                      className="from-primary bg-linear-to-r mb-2 to-purple-500 bg-clip-text text-center text-xl font-bold text-transparent"
                      whileHover={{ scale: 1.02 }}
                    >
                      {t('prompt-intro.cards.language-title')}
                    </motion.h3>
                    <p className="text-muted-foreground text-balance text-center">
                      {t('prompt-intro.cards.language-desc')}
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
                <Card className="border-foreground/10 bg-foreground/5 group-hover:border-primary/30 group-hover:bg-foreground/10 group-hover:shadow-primary/5 h-full overflow-hidden transition-all duration-300 group-hover:shadow-lg">
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
                        className="bg-primary/10 rounded-full p-4"
                        whileHover={{
                          boxShadow: '0 0 20px 0 rgba(var(--primary-rgb), 0.3)',
                          scale: 1.05,
                        }}
                      >
                        <motion.div
                          animate={{ scale: [1, 1.1, 1] }}
                          transition={{ duration: 3, repeat: Infinity }}
                        >
                          <Target className="text-primary h-8 w-8" />
                        </motion.div>
                      </motion.div>
                    </div>
                    <motion.h3
                      className="bg-linear-to-r mb-2 from-purple-500 to-blue-500 bg-clip-text text-center text-xl font-bold text-transparent"
                      whileHover={{ scale: 1.02 }}
                    >
                      {t('prompt-intro.cards.creativity-title')}
                    </motion.h3>
                    <p className="text-muted-foreground text-balance text-center">
                      {t('prompt-intro.cards.creativity-desc')}
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
                <Card className="border-foreground/10 bg-foreground/5 group-hover:border-primary/30 group-hover:bg-foreground/10 group-hover:shadow-primary/5 h-full overflow-hidden transition-all duration-300 group-hover:shadow-lg">
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
                        className="bg-primary/10 rounded-full p-4"
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
                          <RocketIcon className="text-primary h-8 w-8" />
                        </motion.div>
                      </motion.div>
                    </div>
                    <motion.h3
                      className="to-primary bg-linear-to-r mb-2 from-blue-500 bg-clip-text text-center text-xl font-bold text-transparent"
                      whileHover={{ scale: 1.02 }}
                    >
                      {t('prompt-intro.cards.future-work-title')}
                    </motion.h3>
                    <p className="text-muted-foreground text-balance text-center">
                      {t('prompt-intro.cards.future-work-desc')}
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
                  {t('prompt-impact.badge')}
                </Badge>
                <h3 className="mb-4 text-3xl font-bold">
                  {t('prompt-impact.title')}
                </h3>
                <p className="text-muted-foreground mb-6 text-balance">
                  {t('prompt-impact.description')}
                </p>

                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="bg-primary/10 mt-1 rounded-full p-1.5">
                      <Users className="text-primary h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="font-medium">
                        {t('prompt-impact.cards.democratize-title')}
                      </h4>
                      <p className="text-muted-foreground text-sm">
                        {t('prompt-impact.cards.democratize-desc')}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="bg-primary/10 mt-1 rounded-full p-1.5">
                      <Target className="text-primary h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="font-medium">
                        {t('prompt-impact.cards.precision-title')}
                      </h4>
                      <p className="text-muted-foreground text-sm">
                        {t('prompt-impact.cards.precision-desc')}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="bg-primary/10 mt-1 rounded-full p-1.5">
                      <GraduationCap className="text-primary h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="font-medium">
                        {t('prompt-impact.cards.skill-title')}
                      </h4>
                      <p className="text-muted-foreground text-sm">
                        {t('prompt-impact.cards.skill-desc')}
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
                <div className="border-primary/10 bg-foreground/5 relative aspect-square overflow-hidden rounded-2xl border">
                  <div className="from-primary/10 bg-linear-to-br absolute inset-0 via-transparent to-transparent" />

                  {/* Interactive prompt visualization */}
                  <div className="absolute inset-0 flex items-center justify-center p-8">
                    <motion.div
                      className="border-primary/20 bg-background/80 w-full max-w-md rounded-lg border p-4 backdrop-blur-sm"
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
                        <div className="text-muted-foreground ml-auto text-xs">
                          Tuturuuu AI
                        </div>
                      </div>

                      <div className="bg-foreground/5 mb-4 rounded p-3 font-mono text-xs">
                        <motion.span
                          className="text-primary"
                          animate={{ opacity: [1, 0.5, 1] }}
                          transition={{ duration: 2, repeat: Infinity }}
                        >
                          &gt;
                        </motion.span>{' '}
                        {t('prompt-impact.example-code')}
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="bg-primary/20 h-8 w-8 rounded-full" />
                        <div className="flex-1">
                          <div className="bg-foreground/10 h-2 w-3/4 rounded" />
                          <div className="bg-foreground/10 mt-1 h-2 w-1/2 rounded" />
                        </div>
                      </div>

                      <motion.div
                        className="bg-foreground/5 mt-3 h-24 rounded"
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
                  className="border-primary/20 bg-background/80 absolute -bottom-6 -right-6 rounded-lg border p-4 backdrop-blur-sm"
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="text-primary h-4 w-4" />
                    <p className="text-sm font-medium">
                      {t('prompt-impact.cards.democratize-title')}
                    </p>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {t('prompt-impact.cards.democratize-desc')}
                  </p>
                </motion.div>
              </motion.div>
            </div>
          </div>

          {/* Why Now & Why Us */}
          <div className="border-primary/10 bg-foreground/5 mb-16 rounded-2xl border p-8">
            <div className="grid gap-8 md:grid-cols-2">
              <div>
                <h3 className="mb-4 flex items-center gap-4 text-2xl font-bold">
                  <RocketIcon className="h-5 w-5" />
                  {t('why-now-why-us.why-now.title')}
                </h3>

                <p className="text-muted-foreground mb-6 text-balance">
                  {t('why-now-why-us.why-now.description')}
                </p>

                <div className="border-primary/10 relative h-40 overflow-hidden rounded-lg border">
                  <div className="from-primary/10 bg-linear-to-r absolute inset-0 to-transparent" />
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
                        <p className="text-muted-foreground text-sm">
                          {t('why-now-why-us.why-now.tagline')}
                        </p>
                      </div>
                    </motion.div>
                  </motion.div>
                </div>
              </div>

              <div>
                <h3 className="mb-4 flex items-center gap-4 text-2xl font-bold">
                  <Users className="h-5 w-5" />
                  {t('why-now-why-us.why-us.title')}
                </h3>
                <p className="text-muted-foreground mb-6 text-balance">
                  {t('why-now-why-us.why-us.description')}
                </p>

                <div className="border-primary/10 relative h-40 overflow-hidden rounded-lg border">
                  <div className="to-primary/10 bg-linear-to-r absolute inset-0 from-transparent" />
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
                        <div className="border-primary/20 relative h-16 w-16 overflow-hidden rounded-full border-2">
                          <Image
                            src="/media/featured/competitions/neo-league/nct.jpg"
                            alt="RMIT SGS Neo Culture Tech"
                            fill
                            className="object-contain"
                          />
                        </div>
                        <p className="text-muted-foreground mt-2 text-xs">
                          {t('why-now-why-us.why-us.academic')}
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
                        <div className="border-primary/20 relative h-16 w-16 overflow-hidden rounded-full border-2">
                          <Image
                            src="/media/logos/light.png"
                            alt="Tuturuuu"
                            fill
                            className="object-contain"
                          />
                        </div>
                        <p className="text-muted-foreground mt-2 text-xs">
                          {t('why-now-why-us.why-us.technical')}
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
            <TabsList className="mb-8 grid h-full w-full grid-cols-1 gap-1 md:grid-cols-2 lg:grid-cols-4">
              <TabsTrigger value="organizers" className="gap-2">
                <Users className="h-4 w-4" />
                <span>{t('organizers.title')}</span>
              </TabsTrigger>
              <TabsTrigger value="builders" className="gap-2">
                <Code className="h-4 w-4" />
                <span>{t('platform-builder.title')}</span>
              </TabsTrigger>
              <TabsTrigger value="sponsors" className="gap-2">
                <Building className="h-4 w-4" />
                <span>{t('sponsors.badge')}</span>
              </TabsTrigger>
              <TabsTrigger value="thanks" className="gap-2">
                <Heart className="h-4 w-4" />
                <span>{t('special-thanks.title')}</span>
              </TabsTrigger>
            </TabsList>

            {/* Organizers Tab */}
            <TabsContent value="organizers">
              <div className="mb-8">
                <h2 className="mb-2 text-2xl font-bold">
                  <span className="flex items-center gap-2">
                    <Users className="text-primary h-5 w-5" />
                    {t('organizers.title')}
                  </span>
                </h2>
                <p className="text-muted-foreground">
                  {t('organizers.subtitle')}
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
                    {renderTeamMember(member, 'organizers')}
                  </React.Fragment>
                ))}
              </motion.div>
            </TabsContent>

            {/* Platform Builders Tab */}
            <TabsContent value="builders">
              <div className="mb-8">
                <h2 className="mb-2 text-2xl font-bold">
                  <span className="flex items-center gap-2">
                    <Code className="text-primary h-5 w-5" />
                    {t('platform-builder.title')}
                  </span>
                </h2>
                <p className="text-muted-foreground">
                  {t('platform-builder.subtitle')}
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
                    {renderTeamMember(member, 'platform-builder')}
                  </React.Fragment>
                ))}
              </motion.div>
            </TabsContent>

            {/* Sponsors Tab */}
            <TabsContent value="sponsors">
              <div className="mb-8">
                <h2 className="mb-2 text-2xl font-bold">
                  <span className="flex items-center gap-2">
                    <Building className="text-primary h-5 w-5" />
                    {t('sponsors.title')}
                  </span>
                </h2>
                <p className="text-muted-foreground">
                  {t('sponsors.subtitle')}
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
                  {t('sponsors.call-to-action.text')}
                </h3>
                <Link href="mailto:contact@tuturuuu.com">
                  <Button className="group">
                    {t('sponsors.call-to-action.button')}
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
                    <Heart className="text-primary h-5 w-5" />
                    {t('special-thanks.title')}
                  </span>
                </h2>
                <p className="text-muted-foreground">
                  {t('special-thanks.subtitle')}
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
                    <div className="bg-primary/10 text-primary rounded-full p-3">
                      <HandHeart className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="mb-2 text-xl font-semibold">
                        {t('special-thanks.community.title')}
                      </h3>
                      <p className="text-muted-foreground">
                        {t('special-thanks.community.contribution')}
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
      <section className="relative w-full py-16">
        <div className="absolute inset-0 bg-[radial-gradient(circle_600px_at_50%_50%,rgba(var(--primary-rgb),0.1),transparent)]" />

        {/* Animated particles - only rendered client side */}
        {moreParticlesData.map((particle, i) => (
          <motion.div
            key={`particle-${i}`}
            className="bg-primary/30 absolute h-1 w-1 rounded-full"
            style={{
              top: particle.top,
              left: particle.left,
              filter: `blur(${particle.blur})`,
            }}
            animate={{
              y: [0, -50],
              x: [0, particle.xOffset],
              opacity: [0, particle.opacity, 0],
            }}
            transition={{
              duration: particle.duration,
              repeat: Infinity,
              delay: particle.delay,
            }}
          />
        ))}

        <div className="mx-auto max-w-6xl px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="relative rounded-2xl border p-8 backdrop-blur-md"
          >
            <div className="flex flex-col items-center gap-8 md:flex-row">
              <motion.div
                className="relative shrink-0"
                whileHover={{ scale: 1.05 }}
                transition={{ type: 'spring', stiffness: 300 }}
              >
                <div className="border-primary/30 relative h-32 w-32 overflow-hidden rounded-xl border-2">
                  <Image
                    src="/media/logos/nova-transparent.png"
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
                  className="border-primary/20 bg-primary/10 absolute -bottom-3 -right-3 rounded-full border p-2 backdrop-blur-sm"
                  animate={{ rotate: [0, 10, 0, -10, 0] }}
                  transition={{ duration: 5, repeat: Infinity }}
                >
                  <Code className="text-primary h-5 w-5" />
                </motion.div>
              </motion.div>

              <div>
                <h2 className="mb-4 text-3xl font-bold">
                  {t('tech-sponsor.title')}
                  <span className="from-primary bg-linear-to-r to-purple-500 bg-clip-text text-transparent">
                    Tuturuuu
                  </span>
                </h2>
                <motion.p
                  className="text-muted-foreground mb-4"
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.2 }}
                >
                  {t('tech-sponsor.intro')}
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
                    <div className="bg-primary/10 mt-1 rounded-full p-1.5">
                      <Code className="text-primary h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="font-medium">
                        {t('tech-sponsor.sections.infrastructure.title')}
                      </h3>
                      <p className="text-muted-foreground text-sm">
                        {t('tech-sponsor.sections.infrastructure.description')}
                      </p>
                    </div>
                  </motion.div>

                  <motion.div
                    variants={itemVariants}
                    className="flex items-start gap-3"
                  >
                    <div className="bg-primary/10 mt-1 rounded-full p-1.5">
                      <Target className="text-primary h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="font-medium">
                        {t('tech-sponsor.sections.challenges.title')}
                      </h3>
                      <p className="text-muted-foreground text-sm">
                        {t('tech-sponsor.sections.challenges.description')}
                      </p>
                    </div>
                  </motion.div>

                  <motion.div
                    variants={itemVariants}
                    className="flex items-start gap-3"
                  >
                    <div className="bg-primary/10 mt-1 rounded-full p-1.5">
                      <GraduationCap className="text-primary h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="font-medium">
                        {t('tech-sponsor.sections.resources.title')}
                      </h3>
                      <p className="text-muted-foreground text-sm">
                        {t('tech-sponsor.sections.resources.description')}
                      </p>
                    </div>
                  </motion.div>

                  <motion.div
                    variants={itemVariants}
                    className="flex items-start gap-3"
                  >
                    <div className="bg-primary/10 mt-1 rounded-full p-1.5">
                      <Users className="text-primary h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="font-medium">
                        {t('tech-sponsor.sections.mentorship.title')}
                      </h3>
                      <p className="text-muted-foreground text-sm">
                        {t('tech-sponsor.sections.mentorship.description')}
                      </p>
                    </div>
                  </motion.div>
                </motion.div>

                <motion.div
                  className="border-primary/10 text-muted-foreground mt-6 border-t pt-4 text-sm"
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.6 }}
                >
                  <p className="italic">{t('tech-sponsor.quote.text')}</p>
                  <p className="text-foreground mt-2 font-medium">
                    — {t('tech-sponsor.quote.author')}
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
