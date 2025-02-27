'use client';

import GradientHeadline from '../gradient-headline';
import AnimatedTimeline from './animated-timeline';
import FloatingNav from './floating-nav';
import KeyboardGuide from './keyboard-guide';
import ParallaxBackground from './parallax-background';
import ScrollProgress from './scroll-progress';
import ScrollToTop from './scroll-to-top';
import { useKeyboardNav } from './use-keyboard-nav';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { GetStartedButton } from '@tuturuuu/ui/custom/get-started-button';
import { Separator } from '@tuturuuu/ui/separator';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Brain,
  CalendarDays,
  CheckCircle,
  Clock,
  Code,
  FileCode2,
  GraduationCap,
  LineChart,
  MapPin,
  MessageSquareCode,
  RocketIcon,
  School,
  Sparkles,
  Star,
  Target,
  Trophy,
  UserCheck,
  Users,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function MarketingPage() {
  const t = useTranslations();
  const [scrollProgress, setScrollProgress] = useState(0);

  const sections = [
    { id: 'hero', label: 'Top' },
    { id: 'neo-league', label: 'NEO League' },
    { id: 'features', label: 'Features' },
    { id: 'learning', label: 'Learning' },
    { id: 'ai', label: 'AI Features' },
  ];

  const { isNavigating } = useKeyboardNav(sections);

  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const cardVariants = {
    hidden: { scale: 0.95, opacity: 0 },
    show: {
      scale: 1,
      opacity: 1,
      transition: {
        type: 'spring',
        stiffness: 100,
        damping: 15,
      },
    },
    hover: {
      scale: 1.02,
      transition: {
        type: 'spring',
        stiffness: 400,
        damping: 10,
      },
    },
  };

  useEffect(() => {
    const handleScroll = () => {
      const winScroll = window.scrollY;
      const height = document.documentElement.scrollHeight - window.innerHeight;
      const scrolled = (winScroll / height) * 100;
      setScrollProgress(scrolled);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <>
      <ScrollProgress />
      <FloatingNav />
      <KeyboardGuide />
      <ScrollToTop />

      <>
        {/* Keyboard Navigation Indicator */}
        {isNavigating && (
          <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-background/80 px-4 py-2 text-sm backdrop-blur-sm">
            Keyboard navigation active - Use ↑/↓ to navigate
          </div>
        )}

        {/* Scroll Progress Indicator */}
        <motion.div
          className="fixed top-0 right-0 left-0 z-50 h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500"
          style={{
            scaleX: scrollProgress / 100,
            transformOrigin: '0%',
          }}
        />

        <div className="relative flex h-full min-h-screen w-full flex-col items-center">
          {/* Enhanced Animated Background Patterns */}
          <div className="pointer-events-none fixed inset-0 overflow-hidden">
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
              className="absolute top-0 -left-32 h-[20rem] w-[20rem] rounded-full bg-gradient-to-br from-purple-500/30 via-pink-500/20 to-transparent blur-3xl sm:-left-64 sm:h-[40rem] sm:w-[40rem]"
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
              className="absolute top-[30%] -right-32 h-[17.5rem] w-[17.5rem] rounded-full bg-gradient-to-br from-blue-500/30 via-cyan-500/20 to-transparent blur-3xl sm:-right-64 sm:h-[35rem] sm:w-[35rem]"
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

          {/* Improved Hero Section */}
          <section id="hero" aria-label="Welcome to Nova">
            <ParallaxBackground />
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1 }}
              className="relative mx-auto flex max-w-6xl flex-col items-center justify-center px-4 py-32"
            >
              {/* Enhanced Floating Badge */}
              <motion.div
                animate={{
                  y: [0, -10, 0],
                  rotate: [0, 2, -2, 0],
                }}
                transition={{
                  duration: 5,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              >
                <Badge
                  variant="outline"
                  className="mb-8 border-primary/50 text-primary backdrop-blur-sm"
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  Welcome to the Future of Prompt Engineering
                </Badge>
              </motion.div>

              <h1 className="mb-6 text-center text-4xl font-bold tracking-tight text-balance text-foreground md:text-6xl lg:text-7xl">
                Master the Art of
                <br />
                <GradientHeadline title="Prompt Engineering" />
              </h1>

              <div className="mb-8 max-w-2xl text-center text-lg text-balance text-muted-foreground">
                Your playground for crafting, testing, and perfecting AI
                prompts. Join a community of innovators solving real-world
                problems through advanced prompt engineering.
              </div>

              <div className="mb-12 flex flex-col items-center gap-4 sm:flex-row">
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <GetStartedButton text={t('home.get-started')} />
                </motion.div>
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Link href="/challenges">
                    <Button
                      variant="outline"
                      className="group relative overflow-hidden"
                    >
                      <span className="relative z-10 flex items-center">
                        Explore Challenges
                        <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                      </span>
                    </Button>
                  </Link>
                </motion.div>
              </div>
            </motion.div>
          </section>

          {/* NEO League Section with Enhanced Visuals */}
          <section id="neo-league" aria-label="NEO League Information">
            <motion.section
              variants={containerVariants}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true }}
              className="relative w-full overflow-hidden py-24"
            >
              <div className="relative mx-auto max-w-6xl px-4">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  className="text-center"
                >
                  <Badge
                    variant="outline"
                    className="mb-4 animate-pulse border-primary/50 bg-background/50 text-primary backdrop-blur-sm"
                  >
                    <Trophy className="mr-2 h-4 w-4" />
                    Featured Event
                  </Badge>

                  <h2 className="mb-4 bg-gradient-to-r from-primary via-dynamic-purple to-dynamic-blue bg-clip-text text-4xl font-bold text-balance text-transparent">
                    NEO League Season 1
                  </h2>

                  <div className="mb-6 bg-gradient-to-r from-dynamic-purple to-dynamic-red bg-clip-text text-3xl font-bold text-transparent">
                    Prompt The Future
                  </div>
                </motion.div>

                {/* Replace existing timeline with AnimatedTimeline */}
                <AnimatedTimeline
                  events={[
                    {
                      date: '05 April 2025',
                      title: 'Opening Ceremony',
                      type: 'Virtual',
                      icon: <CalendarDays className="h-5 w-5" />,
                      description:
                        'Join us for the kickoff of NEO League Season 1',
                    },
                    {
                      date: '12 April 2025',
                      title: 'Top 50 Selection',
                      type: 'Virtual',
                      icon: <Trophy className="h-5 w-5" />,
                      description:
                        'First round of selections for top performers',
                    },
                    {
                      date: '19 April 2025',
                      title: 'Top 30 Selection',
                      type: 'Virtual',
                      icon: <Star className="h-5 w-5" />,
                      description: 'Final online round to determine finalists',
                    },
                    {
                      date: '26 April 2025',
                      title: 'Final Competition',
                      type: 'On-site',
                      icon: <Trophy className="h-5 w-5" />,
                      description: 'On-site finals and awards ceremony',
                    },
                  ]}
                />

                <Separator className="my-12" />

                {/* Enhanced Requirements and Info Cards */}
                <div className="mt-16 grid gap-6 md:grid-cols-2">
                  <motion.div
                    variants={cardVariants}
                    whileHover="hover"
                    className="group"
                  >
                    <Card className="h-full overflow-hidden bg-foreground/5">
                      <div className="relative overflow-hidden rounded-xl p-6">
                        <div className="relative">
                          <h3 className="mb-4 flex items-center gap-2 text-xl font-bold">
                            <UserCheck className="h-5 w-5 text-primary" />
                            Admission Requirements
                          </h3>
                          <ul className="space-y-3">
                            <li className="flex items-center gap-2 text-muted-foreground">
                              <MapPin className="h-4 w-4" />
                              <span>Based in Ho Chi Minh City</span>
                            </li>
                            <li className="flex items-center gap-2 text-muted-foreground">
                              <School className="h-4 w-4" />
                              <span>Undergraduate Students</span>
                            </li>
                            <li className="flex items-center gap-2 text-muted-foreground">
                              <Clock className="h-4 w-4" />
                              <span>18+ years old</span>
                            </li>
                          </ul>
                        </div>
                      </div>
                    </Card>
                  </motion.div>

                  <motion.div
                    variants={cardVariants}
                    whileHover="hover"
                    className="group"
                  >
                    <Card className="h-full overflow-hidden bg-foreground/5">
                      <div className="relative overflow-hidden rounded-xl p-6">
                        <div className="relative">
                          <h3 className="mb-4 flex items-center gap-2 text-xl font-bold">
                            <Target className="h-5 w-5 text-primary" />
                            Program Objectives
                          </h3>
                          <ul className="space-y-3">
                            {[
                              'Democratize Prompt Engineering across all backgrounds',
                              'Develop practical AI skills and problem-solving abilities',
                              'Build a global community of AI innovators',
                              'Foster creative solutions to real-world challenges',
                              'Advance AI literacy and ethical understanding',
                            ].map((objective, index) => (
                              <li
                                key={index}
                                className="flex items-start gap-2 text-muted-foreground"
                              >
                                <CheckCircle className="mt-1 h-4 w-4 flex-shrink-0 text-primary" />
                                <span>{objective}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                </div>

                {/* Enhanced CTA Button */}
                <motion.div
                  className="mt-12 text-center"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Button size="lg" disabled>
                    <span className="relative z-10 flex items-center gap-2">
                      Register for NEO League
                      <RocketIcon className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </span>
                  </Button>
                </motion.div>
              </div>
            </motion.section>
          </section>

          {/* Features Section */}
          <section id="features" aria-label="Platform Features">
            <div className="w-full py-24">
              <div className="mx-auto max-w-6xl px-4">
                <div className="mb-16 text-center">
                  <Badge variant="outline" className="mb-4">
                    Platform Features
                  </Badge>
                  <h2 className="mb-4 text-3xl font-bold md:text-4xl">
                    Everything You Need to Excel in Prompt Engineering
                  </h2>
                  <p className="text-muted-foreground">
                    A comprehensive suite of tools designed for modern prompt
                    engineers
                  </p>
                </div>

                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {[
                    {
                      title: 'Interactive Challenges',
                      description:
                        'Practice with real-world scenarios and level up your prompt engineering skills',
                      icon: <Target className="h-6 w-6" />,
                      badge: 'Popular',
                    },
                    {
                      title: 'AI Model Integration',
                      description:
                        'Test your prompts across multiple AI models including GPT-4, Claude, and more',
                      icon: <Brain className="h-6 w-6" />,
                    },
                    {
                      title: 'Performance Analytics',
                      description:
                        'Track your progress and optimize your prompts with detailed metrics',
                      icon: <LineChart className="h-6 w-6" />,
                    },
                    {
                      title: 'Community Showcase',
                      description:
                        'Share your solutions and learn from other prompt engineers',
                      icon: <Users className="h-6 w-6" />,
                    },
                    {
                      title: 'Learning Resources',
                      description:
                        'Access comprehensive guides and best practices for prompt engineering',
                      icon: <GraduationCap className="h-6 w-6" />,
                    },
                    {
                      title: 'Prompt Version Control',
                      description:
                        'Track changes and maintain different versions of your prompts',
                      icon: <Code className="h-6 w-6" />,
                      badge: 'New',
                    },
                  ].map((feature, index) => (
                    <div key={index}>
                      <Card className="h-full overflow-hidden border-primary/10">
                        <div className="flex h-full flex-col space-y-4 bg-primary/5 p-6 transition-all duration-300 group-hover:bg-primary/10">
                          <div className="flex items-center justify-between">
                            <div className="rounded-full bg-primary/10 p-3 text-primary">
                              {feature.icon}
                            </div>
                            {feature.badge && (
                              <Badge
                                variant="secondary"
                                className="bg-primary/10"
                              >
                                {feature.badge}
                              </Badge>
                            )}
                          </div>
                          <h3 className="text-xl font-bold">{feature.title}</h3>
                          <p className="flex-1 text-muted-foreground">
                            {feature.description}
                          </p>
                        </div>
                      </Card>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* CTA Section */}
          <section aria-label="Get Started">
            <motion.section
              variants={containerVariants}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true }}
              className="w-full py-24"
            >
              <div className="mx-auto max-w-4xl px-4">
                <Card className="overflow-hidden border-primary/10">
                  <div className="relative bg-primary/5 p-8 md:p-12">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_500px_at_50%_50%,rgba(var(--primary-rgb),0.15),transparent)]" />
                    <div className="relative space-y-6 text-center">
                      <RocketIcon className="mx-auto h-12 w-12 text-primary" />
                      <h2 className="text-3xl font-bold md:text-4xl">
                        Ready to Start Your Journey?
                      </h2>
                      <p className="mx-auto max-w-2xl text-muted-foreground">
                        Join thousands of prompt engineers who are shaping the
                        future of AI interaction. Start crafting powerful
                        prompts today.
                      </p>
                      <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
                        <GetStartedButton text={t('home.get-started')} />
                        <Link href="/learn">
                          <Button variant="outline" className="group">
                            Browse Learning Resources
                            <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                          </Button>
                        </Link>
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <FileCode2 className="h-4 w-4 text-primary" />
                          <span>No coding required</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <MessageSquareCode className="h-4 w-4 text-primary" />
                          <span>Active community support</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-primary" />
                          <span>Regular challenges & contests</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>
            </motion.section>
          </section>
        </div>
      </>
    </>
  );
}
