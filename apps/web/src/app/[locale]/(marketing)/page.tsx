'use client';

import FloatingElements from './floating-elements';
import GetStartedButton from './get-started-button';
import GradientHeadline from './gradient-headline';
import { fireConfetti, fireRocket } from '@/lib/confetti';
import { Badge } from '@repo/ui/components/ui/badge';
import { Card } from '@repo/ui/components/ui/card';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import {
  InfinityIcon,
  ArrowRight,
  Award,
  Banknote,
  Bot,
  Brain,
  Building2,
  Calendar,
  ChartBar,
  CheckCircle,
  Code2,
  Container,
  Database,
  Factory,
  FileText,
  Github,
  Globe,
  Globe2,
  GraduationCap,
  HardDrive,
  HardHat,
  LayoutGrid,
  MessageCircle,
  Package,
  Pill,
  Plus,
  Rocket,
  Shield,
  Sparkles,
  Star,
  Stethoscope,
  Store,
  Target,
  Timer,
  TrendingUp,
  Users,
  Users2,
  UtensilsCrossed,
  Zap,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import Link from 'next/link';
import { useRef, useState } from 'react';

export default function MarketingPage() {
  const t = useTranslations();

  // Get benefits items with proper typing
  const businessBenefits = (t.raw('landing.benefits.for_businesses.items') ||
    []) as string[];
  const teamBenefits = (t.raw('landing.benefits.for_teams.items') ||
    []) as string[];

  // Industry keys for type safety
  const industries = [
    'manufacturing',
    'healthcare',
    'education',
    'retail',
    'real_estate',
    'hospitality',
    'construction',
    'pharmacies',
  ] as const;

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    show: { y: 0, opacity: 1 },
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

  const logoRef = useRef<HTMLDivElement>(null);
  const [, setMousePosition] = useState({ x: 0, y: 0 });
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const rotateX = useSpring(useTransform(mouseY, [-100, 100], [30, -30]));
  const rotateY = useSpring(useTransform(mouseX, [-100, 100], [-30, 30]));

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!logoRef.current) return;
    const rect = logoRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    setMousePosition({ x, y });
    mouseX.set(x);
    mouseY.set(y);
  };

  // Add confetti effects on hover for certain elements
  const handleFeatureHover = () => {
    fireConfetti({
      origin: { x: Math.random(), y: Math.random() },
      elementCount: 30,
      spread: 60,
      startVelocity: 15,
    });
  };

  const handleCtaHover = () => {
    fireRocket();
  };

  return (
    <div
      className="relative -mt-[53px] flex w-full flex-col items-center"
      suppressHydrationWarning
    >
      <FloatingElements />

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1 }}
        className="relative min-h-[calc(100vh-3.5rem+53px)] w-full bg-gradient-to-b from-background via-background to-dynamic-light-pink/10"
      >
        {/* Enhanced Animated Background Patterns */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
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

        {/* Main Content */}
        <div className="relative mx-auto flex max-w-6xl flex-col items-center justify-center px-4 py-32">
          {/* Enhanced 3D Floating Logo */}
          <motion.div
            ref={logoRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => {
              mouseX.set(0);
              mouseY.set(0);
            }}
            style={{ perspective: 1000 }}
            className="group relative mb-12"
          >
            <motion.div
              style={{
                rotateX,
                rotateY,
                transformStyle: 'preserve-3d',
              }}
              className="relative"
            >
              <div className="absolute inset-0 -z-10 rounded-full bg-gradient-to-br from-primary/20 via-transparent to-transparent opacity-50 blur-lg transition-all duration-300 group-hover:opacity-100" />
              <Image
                src="/media/logos/transparent.png"
                width={200}
                height={200}
                alt="Tuturuuu Logo"
                priority
                className="relative transition-all duration-300 group-hover:scale-110 group-hover:brightness-110"
              />
            </motion.div>
          </motion.div>

          {/* Enhanced Headline and CTA */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="relative text-center"
          >
            <div className="absolute -inset-x-4 -inset-y-2 rounded-xl bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 opacity-0 blur-xl transition-all duration-300 group-hover:opacity-100" />
            <h1 className="relative mx-auto mb-4 text-center text-2xl font-bold tracking-tight text-foreground md:text-4xl lg:text-6xl">
              <span className="absolute -inset-1 rounded-lg bg-gradient-to-r from-primary/20 to-primary/10 opacity-0 blur transition-all duration-300 group-hover:opacity-100" />
              <GradientHeadline title={t('landing.headline')} />
            </h1>
            <h2 className="mb-12 text-lg font-bold tracking-tight text-balance text-foreground md:text-2xl lg:text-3xl">
              {t('landing.subheadline')}
            </h2>

            <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-center">
              <GetStartedButton href="/login" />
            </div>

            {/* Trust Indicators */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="mt-12 flex flex-wrap items-center justify-center gap-6"
            >
              {[
                {
                  icon: <Shield className="h-5 w-5" />,
                  text: 'Enterprise-grade security',
                },
                {
                  icon: <Globe className="h-5 w-5" />,
                  text: 'Available worldwide',
                },
                {
                  icon: <Package className="h-5 w-5" />,
                  text: 'Integrated Product Suite',
                },
                {
                  icon: <Code2 className="h-5 w-5" />,
                  text: '4,000+ Open Source Commits',
                },
              ].map((item, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.4 + index * 0.1 }}
                  className="flex items-center gap-2 text-primary/80"
                >
                  {item.icon}
                  <span className="text-sm font-medium text-muted-foreground">
                    {item.text}
                  </span>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        </div>

        {/* Enhanced Scroll Indicator */}
        <motion.div
          animate={{ y: [0, 10, 0] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="absolute inset-x-0 bottom-12 flex w-full flex-col items-center"
        >
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <span className="text-sm font-medium">
              {t('common.scroll_to_explore')}
            </span>
            <motion.div
              animate={{ scale: [1, 1.2, 1], rotate: [0, 10, -10, 0] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="relative h-8 w-8"
            >
              <div className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
              <div className="relative flex h-full w-full items-center justify-center rounded-full bg-primary/10">
                ↓
              </div>
            </motion.div>
          </div>
        </motion.div>
      </motion.div>

      {/* Features Bento Grid Section */}
      <motion.section
        id="features"
        initial="hidden"
        whileInView="show"
        viewport={{ once: true }}
        variants={containerVariants}
        className="relative w-full py-24"
        onMouseEnter={handleFeatureHover}
      >
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(var(--primary-rgb),0.03)_1px,transparent_1px)] bg-[size:20px_20px]" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(var(--primary-rgb),0.02)_1px,transparent_1px)] bg-[size:100px] opacity-20" />
          <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(var(--primary-rgb),0.02)_1px,transparent_1px)] bg-[size:100px] opacity-20" />
        </div>

        <div className="relative mx-auto max-w-6xl px-4">
          <motion.div variants={itemVariants} className="mb-16 text-center">
            <span className="mb-4 inline-block rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
              Powerful Platform Features
            </span>
            <h2 className="group mb-4 text-center text-4xl font-bold">
              {t('landing.features.title')}
              <span className="ml-2 inline-block">
                <Zap className="h-8 w-8 text-primary transition-transform duration-300 group-hover:scale-110 group-hover:rotate-12" />
              </span>
            </h2>
            <p className="mx-auto max-w-2xl text-muted-foreground">
              {t('landing.features.subtitle')}
            </p>
          </motion.div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {/* Large feature card */}
            <motion.div
              variants={cardVariants}
              whileHover="hover"
              className="group row-span-2 md:col-span-2 lg:col-span-2"
            >
              <Card className="relative h-full overflow-hidden">
                <div className="relative flex h-full flex-col bg-primary/5 p-8 transition-all duration-300 group-hover:bg-primary/10">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent opacity-0 transition-all duration-300 group-hover:opacity-100" />
                  <div className="relative">
                    <div className="mb-6 inline-flex rounded-full bg-primary/10 p-3">
                      <Brain className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="mb-4 text-2xl font-bold">
                      {t('landing.features.ai_powered.title')}
                    </h3>
                    <p className="text-lg text-muted-foreground">
                      {t('landing.features.ai_powered.description')}
                    </p>
                    <div className="mt-8 grid grid-cols-2 gap-4">
                      <div className="flex items-center gap-3 rounded-lg border border-primary/10 bg-background/50 p-4 backdrop-blur-sm">
                        <Sparkles className="h-5 w-5 text-primary" />
                        <span className="text-sm font-medium">
                          Smart Automation
                        </span>
                      </div>
                      <div className="flex items-center gap-3 rounded-lg border border-primary/10 bg-background/50 p-4 backdrop-blur-sm">
                        <Target className="h-5 w-5 text-primary" />
                        <span className="text-sm font-medium">
                          Predictive Analytics
                        </span>
                      </div>
                      <div className="flex items-center gap-3 rounded-lg border border-primary/10 bg-background/50 p-4 backdrop-blur-sm">
                        <Bot className="h-5 w-5 text-primary" />
                        <span className="text-sm font-medium">
                          AI Assistants
                        </span>
                      </div>
                      <div className="flex items-center gap-3 rounded-lg border border-primary/10 bg-background/50 p-4 backdrop-blur-sm">
                        <Database className="h-5 w-5 text-primary" />
                        <span className="text-sm font-medium">
                          Smart Data Processing
                        </span>
                      </div>
                    </div>
                    <div className="mt-8 flex items-center gap-8">
                      <div className="flex items-center gap-2">
                        <Award className="h-5 w-5 text-primary" />
                        <span className="text-sm text-muted-foreground">
                          Industry Leading
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-5 w-5 text-primary" />
                        <span className="text-sm text-muted-foreground">
                          200% Productivity Boost
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="absolute right-0 bottom-0 left-0 h-1 bg-gradient-to-r from-primary/20 to-primary/5 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                </div>
              </Card>
            </motion.div>

            {/* Regular feature cards with enhanced design */}
            {[
              {
                title: t('landing.features.collaboration.title'),
                description: t('landing.features.collaboration.description'),
                icon: <Users2 className="h-8 w-8" />,
                gradient: 'from-blue-500/20 to-transparent',
                metrics: { users: '50K+', satisfaction: '98%' },
              },
              {
                title: t('landing.features.task_management.title'),
                description: t('landing.features.task_management.description'),
                icon: <CheckCircle className="h-8 w-8" />,
                gradient: 'from-green-500/20 to-transparent',
                metrics: { tasks: '1M+', completion: '2x faster' },
              },
              {
                title: t('landing.features.document_management.title'),
                description: t(
                  'landing.features.document_management.description'
                ),
                icon: <FileText className="h-8 w-8" />,
                gradient: 'from-orange-500/20 to-transparent',
                metrics: { storage: 'Unlimited', types: 'All formats' },
              },
              {
                title: t('landing.features.finance_tracking.title'),
                description: t('landing.features.finance_tracking.description'),
                icon: <Banknote className="h-8 w-8" />,
                gradient: 'from-yellow-500/20 to-transparent',
                metrics: { savings: '40%+', accuracy: '99.9%' },
              },
              {
                title: t('landing.features.open_source.title'),
                description: t('landing.features.open_source.description'),
                icon: <Github className="h-8 w-8" />,
                gradient: 'from-purple-500/20 to-transparent',
                metrics: { stars: '10K+', contributors: '5K+' },
              },
            ].map((feature, i) => (
              <motion.div
                key={i}
                variants={cardVariants}
                whileHover="hover"
                className="group"
              >
                <Card className="relative h-full overflow-hidden transition-all duration-300 hover:shadow-xl">
                  <div className="flex h-full flex-col p-6">
                    <div
                      className={`absolute inset-0 bg-gradient-to-br opacity-0 ${feature.gradient} transition-opacity duration-300 group-hover:opacity-100`}
                    />
                    <div className="relative">
                      <div className="mb-6 inline-flex rounded-full bg-primary/10 p-3">
                        <div className="text-primary transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3">
                          {feature.icon}
                        </div>
                      </div>
                      <h3 className="mb-2 text-xl font-bold">
                        {feature.title}
                      </h3>
                      <p className="mb-4 text-sm text-muted-foreground">
                        {feature.description}
                      </p>
                      <div className="mt-auto flex items-center justify-between">
                        {Object.entries(feature.metrics).map(([key, value]) => (
                          <div key={key} className="flex items-center gap-2">
                            <span className="text-sm font-bold text-primary">
                              {value}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {key}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* Products Grid */}
      <motion.section
        variants={itemVariants}
        className="mx-auto mt-24 max-w-6xl px-4"
      >
        <div className="mb-16 text-center">
          <span className="mb-4 inline-block rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
            Integrated Product Suite
          </span>
          <h2 className="group mb-4 text-center text-4xl font-bold">
            {t('landing.products.title')}
            <span className="ml-2 inline-block">
              <Container className="h-8 w-8 text-primary transition-transform duration-300 group-hover:scale-110 group-hover:rotate-12" />
            </span>
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            {t('landing.products.subtitle')}
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[
            {
              title: t('landing.products.meet_together.title'),
              description: t('landing.products.meet_together.description'),
              icon: <Users className="h-6 w-6" />,
              gradient: 'from-blue-500/20 to-purple-500/20',
              features: [
                'HD Video Calls',
                'Screen Sharing',
                'Meeting Recording',
              ],
              metrics: { users: '100K+', calls: '1M+/month' },
              href: '/products/meet-together',
              status: 'beta',
            },
            {
              title: t('landing.products.calendar.title'),
              description: t('landing.products.calendar.description'),
              icon: <Calendar className="h-6 w-6" />,
              gradient: 'from-green-500/20 to-emerald-500/20',
              features: [
                'Smart Scheduling',
                'Time Zone Support',
                'Calendar Sync',
              ],
              metrics: { events: '5M+', accuracy: '99.9%' },
              href: '/products/calendar',
              status: 'coming_soon',
            },
            {
              title: t('landing.products.documents.title'),
              description: t('landing.products.documents.description'),
              icon: <FileText className="h-6 w-6" />,
              gradient: 'from-orange-500/20 to-red-500/20',
              features: ['Real-time Editing', 'Version Control', 'Templates'],
              metrics: { docs: '10M+', users: '500K+' },
              href: '/products/documents',
              status: 'coming_soon',
            },
            {
              title: t('landing.products.drive.title'),
              description: t('landing.products.drive.description'),
              icon: <HardDrive className="h-6 w-6" />,
              gradient: 'from-yellow-500/20 to-orange-500/20',
              features: ['Secure Storage', 'File Sharing', 'Backup'],
              metrics: { storage: '1PB+', files: '100M+' },
              href: '/products/drive',
              status: 'coming_soon',
            },
            {
              title: t('landing.products.crm.title'),
              description: t('landing.products.crm.description'),
              icon: <Users2 className="h-6 w-6" />,
              gradient: 'from-purple-500/20 to-pink-500/20',
              features: ['Contact Management', 'Sales Pipeline', 'Analytics'],
              metrics: { leads: '1M+', conversion: '+45%' },
              href: '/products/crm',
              status: 'coming_soon',
            },
            {
              title: t('landing.products.finance.title'),
              description: t('landing.products.finance.description'),
              icon: <Banknote className="h-6 w-6" />,
              gradient: 'from-cyan-500/20 to-blue-500/20',
              features: ['Invoicing', 'Expense Tracking', 'Reports'],
              metrics: { processed: '$1B+', savings: '30%' },
              href: '/products/finance',
              status: 'coming_soon',
            },
          ].map((product) => (
            <Link
              key={product.title}
              href={product.href}
              className="group transition-transform duration-300 hover:scale-[1.02]"
            >
              <Card className="relative h-full overflow-hidden">
                <div className="flex h-full flex-col bg-primary/5 p-6 transition-all duration-300 group-hover:bg-primary/10">
                  <div
                    className={`absolute inset-0 bg-gradient-to-br opacity-0 ${product.gradient} transition-opacity duration-300 group-hover:opacity-100`}
                  />
                  <div className="relative">
                    <div className="mb-4 flex items-center justify-between text-primary">
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-primary/10 bg-background/50 backdrop-blur-sm">
                          {product.icon}
                        </div>
                        <h3 className="text-xl font-bold">{product.title}</h3>
                      </div>
                      {product.status && (
                        <Badge variant="secondary" className="text-xs">
                          {t(`common.${product.status}` as any)}
                        </Badge>
                      )}
                    </div>
                    <p className="mb-6 line-clamp-2 text-muted-foreground">
                      {product.description}
                    </p>
                    <div className="space-y-4">
                      <div className="flex flex-wrap gap-4">
                        {product.features.map((feature, index) => (
                          <div
                            key={index}
                            className="flex items-center gap-2 rounded-full border border-primary/10 bg-background/50 px-3 py-1 backdrop-blur-sm"
                          >
                            <CheckCircle className="h-3 w-3 text-primary" />
                            <span className="text-xs font-medium">
                              {feature}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center justify-between">
                        {Object.entries(product.metrics).map(([key, value]) => (
                          <div key={key} className="flex items-center gap-2">
                            <span className="text-sm font-bold text-primary">
                              {value}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {key}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="mt-6 flex items-center gap-2 text-sm font-medium text-primary">
                      {t('common.learn_more')}
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </motion.section>

      {/* Industry Solutions */}
      <motion.section
        variants={itemVariants}
        className="mx-auto mt-24 max-w-6xl"
      >
        <div className="mb-16 text-center">
          <span className="mb-4 inline-block rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
            Industry-Specific Solutions
          </span>
          <h2 className="group mb-4 text-center text-4xl font-bold">
            {t('landing.solutions.title')}
            <span className="ml-2 inline-block">
              <Building2 className="h-8 w-8 text-primary transition-transform duration-300 group-hover:scale-110 group-hover:rotate-12" />
            </span>
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            {t('landing.solutions.subtitle')}
          </p>
        </div>

        <div className="grid gap-6 px-4 md:grid-cols-2 lg:grid-cols-4">
          {industries.map((industry) => (
            <Link key={industry} href={`/solutions/${industry}`}>
              <Card className="group relative h-full overflow-hidden">
                <div className="flex h-full flex-col items-center justify-center bg-primary/5 p-6 text-center transition-all duration-300 hover:bg-primary/10">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(var(--primary-rgb),0.05)_1px,transparent_1px)] bg-[size:10px_10px] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  <div className="relative flex flex-col items-center">
                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                      {industry === 'manufacturing' && (
                        <Factory className="h-8 w-8 text-primary" />
                      )}
                      {industry === 'healthcare' && (
                        <Stethoscope className="h-8 w-8 text-primary" />
                      )}
                      {industry === 'education' && (
                        <GraduationCap className="h-8 w-8 text-primary" />
                      )}
                      {industry === 'retail' && (
                        <Store className="h-8 w-8 text-primary" />
                      )}
                      {industry === 'real_estate' && (
                        <Building2 className="h-8 w-8 text-primary" />
                      )}
                      {industry === 'hospitality' && (
                        <UtensilsCrossed className="h-8 w-8 text-primary" />
                      )}
                      {industry === 'construction' && (
                        <HardHat className="h-8 w-8 text-primary" />
                      )}
                      {industry === 'pharmacies' && (
                        <Pill className="h-8 w-8 text-primary" />
                      )}
                    </div>
                    <h3 className="mb-2 text-lg font-bold">
                      {t(`landing.solutions.industries.${industry}` as const)}
                    </h3>
                    <div className="mt-auto flex items-center justify-center gap-2 font-medium text-primary opacity-0 transition-all duration-300 group-hover:opacity-100">
                      {t('common.learn_more')}
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </motion.section>

      {/* Benefits Section */}
      <motion.section
        variants={itemVariants}
        className="mx-auto my-24 max-w-6xl px-4"
      >
        <div className="mb-16 text-center">
          <span className="mb-4 inline-block rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
            Why Choose Tuturuuu
          </span>
          <h2 className="group mb-4 text-center text-4xl font-bold">
            {t('landing.benefits.title')}
            <span className="ml-2 inline-block">
              <Star className="h-8 w-8 text-primary transition-transform duration-300 group-hover:scale-110 group-hover:rotate-12" />
            </span>
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            {t('landing.benefits.subtitle')}
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-2">
          <motion.div
            variants={cardVariants}
            whileHover="hover"
            className="group"
          >
            <Card className="relative h-full overflow-hidden bg-primary/5 p-8">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(var(--primary-rgb),0.05)_1px,transparent_1px)] bg-[size:10px_10px] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <div className="relative">
                <div className="mb-6 inline-flex rounded-full border border-primary/10 bg-background/50 p-3 backdrop-blur-sm">
                  <Building2 className="h-8 w-8 text-primary" />
                </div>
                <h3 className="mb-6 text-2xl font-bold">
                  {t('landing.benefits.for_businesses.title')}
                </h3>
                <div className="space-y-4">
                  {businessBenefits.map((benefit: string) => (
                    <div key={benefit} className="flex items-start gap-3">
                      <div className="flex h-6 w-6 flex-none items-center justify-center rounded-full border border-primary/10 bg-background/50 backdrop-blur-sm">
                        <CheckCircle className="h-4 w-4 text-primary" />
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {benefit}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </motion.div>

          <motion.div
            variants={cardVariants}
            whileHover="hover"
            className="group"
          >
            <Card className="relative h-full overflow-hidden bg-primary/5 p-8">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(var(--primary-rgb),0.05)_1px,transparent_1px)] bg-[size:10px_10px] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <div className="relative">
                <div className="mb-6 inline-flex rounded-full border border-primary/10 bg-background/50 p-3 backdrop-blur-sm">
                  <Users2 className="h-8 w-8 text-primary" />
                </div>
                <h3 className="mb-6 text-2xl font-bold">
                  {t('landing.benefits.for_teams.title')}
                </h3>
                <div className="space-y-4">
                  {teamBenefits.map((benefit: string) => (
                    <div key={benefit} className="flex items-start gap-3">
                      <div className="flex h-6 w-6 flex-none items-center justify-center rounded-full border border-primary/10 bg-background/50 backdrop-blur-sm">
                        <CheckCircle className="h-4 w-4 text-primary" />
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {benefit}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </motion.div>
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-3">
          <motion.div
            variants={cardVariants}
            whileHover="hover"
            className="group"
          >
            <Card className="relative overflow-hidden border-primary/10 bg-background/50 p-6 backdrop-blur-sm">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <Shield className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h4 className="font-bold">Enterprise Security</h4>
                  <p className="text-sm text-muted-foreground">
                    Bank-grade data protection
                  </p>
                </div>
              </div>
            </Card>
          </motion.div>

          <motion.div
            variants={cardVariants}
            whileHover="hover"
            className="group"
          >
            <Card className="relative overflow-hidden border-primary/10 bg-background/50 p-6 backdrop-blur-sm">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <Zap className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h4 className="font-bold">Lightning Fast</h4>
                  <p className="text-sm text-muted-foreground">
                    Optimized for performance
                  </p>
                </div>
              </div>
            </Card>
          </motion.div>

          <motion.div
            variants={cardVariants}
            whileHover="hover"
            className="group"
          >
            <Card className="relative overflow-hidden border-primary/10 bg-background/50 p-6 backdrop-blur-sm">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <Globe2 className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h4 className="font-bold">Global Scale</h4>
                  <p className="text-sm text-muted-foreground">
                    Available worldwide 24/7
                  </p>
                </div>
              </div>
            </Card>
          </motion.div>
        </div>
      </motion.section>

      {/* Transformation Section */}
      <motion.section
        variants={itemVariants}
        className="mx-auto mt-24 max-w-6xl px-4"
      >
        <div className="mb-16 text-center">
          <span className="mb-4 inline-block rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
            Digital Transformation Journey
          </span>
          <h2 className="group mb-4 text-center text-4xl font-bold">
            {t('landing.transformation.title')}
            <span className="ml-2 inline-block">
              <Rocket className="h-8 w-8 text-primary transition-transform duration-300 group-hover:scale-110 group-hover:rotate-12" />
            </span>
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            {t('landing.transformation.subtitle')}
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          {(t.raw('landing.transformation.steps') as any[]).map(
            (step, index) => (
              <motion.div
                key={index}
                variants={cardVariants}
                whileHover="hover"
                className="group"
              >
                <Card className="relative h-full overflow-hidden">
                  <div className="flex h-full flex-col bg-primary/5 p-8 transition-all duration-300 group-hover:bg-primary/10">
                    <div className="absolute inset-0">
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(var(--primary-rgb),0.05)_1px,transparent_1px)] bg-[size:10px_10px] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(var(--primary-rgb),0.02)_1px,transparent_1px)] bg-[size:100px] opacity-0 transition-opacity duration-300 group-hover:opacity-20" />
                      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(var(--primary-rgb),0.02)_1px,transparent_1px)] bg-[size:100px] opacity-0 transition-opacity duration-300 group-hover:opacity-20" />
                    </div>
                    <div className="relative">
                      <div className="relative mb-6">
                        <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-foreground text-background">
                          <div className="absolute -inset-1 animate-pulse rounded-full bg-primary/20 blur-sm" />
                          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                          <span className="relative text-2xl font-bold">
                            {index + 1}
                          </span>
                        </div>
                        <div className="absolute -top-2 -right-2">
                          {index === 0 && (
                            <Rocket className="h-6 w-6 text-primary" />
                          )}
                          {index === 1 && (
                            <Target className="h-6 w-6 text-primary" />
                          )}
                          {index === 2 && (
                            <Sparkles className="h-6 w-6 text-primary" />
                          )}
                        </div>
                      </div>
                      <h3 className="mb-4 text-xl font-bold">{step.title}</h3>
                      <p className="mb-6 text-muted-foreground">
                        {step.description}
                      </p>
                      {step.features && (
                        <div className="space-y-3">
                          {step.features.map((feature: string, i: number) => (
                            <motion.div
                              key={i}
                              initial={false}
                              whileHover={{ scale: 1.02, x: 4 }}
                              className="flex items-center gap-3 rounded-lg border border-primary/10 bg-background/50 p-3 backdrop-blur-sm"
                            >
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                                <CheckCircle className="h-4 w-4 text-primary" />
                              </div>
                              <span className="text-sm font-medium">
                                {feature}
                              </span>
                            </motion.div>
                          ))}
                        </div>
                      )}
                      <div className="mt-6 flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          <Timer className="h-4 w-4 text-primary" />
                          <span className="text-xs text-muted-foreground">
                            Quick setup
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Shield className="h-4 w-4 text-primary" />
                          <span className="text-xs text-muted-foreground">
                            Enterprise ready
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="absolute right-0 bottom-0 left-0 h-1 bg-gradient-to-r from-primary/20 to-primary/5 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  </div>
                </Card>
              </motion.div>
            )
          )}
        </div>
      </motion.section>

      {/* Testimonials Section */}
      <motion.section
        variants={itemVariants}
        className="mx-auto mt-24 max-w-6xl"
      >
        <div className="mb-16 text-center">
          <span className="mb-4 inline-block rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
            {t('landing.testimonials.title')}
          </span>
          <h2 className="group mb-4 text-center text-4xl font-bold">
            {t('landing.testimonials.title')}
            <span className="ml-2 inline-block">
              <MessageCircle className="h-8 w-8 text-primary transition-transform duration-300 group-hover:scale-110 group-hover:rotate-12" />
            </span>
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            {t('landing.testimonials.subtitle')}
          </p>
        </div>

        <div className="grid gap-8 px-4 md:grid-cols-3">
          {(t.raw('landing.testimonials.items') as any[]).map(
            (testimonial, index) => (
              <motion.div
                key={index}
                variants={cardVariants}
                whileHover="hover"
                className="group"
              >
                <Card className="h-full overflow-hidden">
                  <div className="flex h-full flex-col bg-primary/5 p-6 transition-all duration-300 group-hover:bg-primary/10">
                    <div className="mb-4 text-primary">
                      <Sparkles className="h-6 w-6" />
                    </div>
                    <blockquote className="mb-4 flex-grow text-lg italic">
                      "{testimonial.quote}"
                    </blockquote>
                    <div>
                      <p className="font-bold">{testimonial.author}</p>
                      <p className="text-sm text-muted-foreground">
                        {testimonial.role}, {testimonial.company}
                      </p>
                    </div>
                  </div>
                </Card>
              </motion.div>
            )
          )}
        </div>
      </motion.section>

      {/* AI Revolution Section */}
      <motion.section
        variants={itemVariants}
        className="mx-auto mt-24 max-w-6xl px-4"
      >
        <div className="mb-16 text-center">
          <span className="mb-4 inline-block rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
            {t('landing.ai_revolution.title')}
          </span>
          <h2 className="group mb-4 text-center text-4xl font-bold">
            {t('landing.ai_revolution.title')}
            <span className="ml-2 inline-block">
              <Brain className="h-8 w-8 text-primary transition-transform duration-300 group-hover:scale-110 group-hover:rotate-12" />
            </span>
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            {t('landing.ai_revolution.subtitle')}
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-2">
          {(t.raw('landing.ai_revolution.items') as any[]).map(
            (item, index) => (
              <motion.div
                key={index}
                variants={cardVariants}
                whileHover="hover"
                className="group"
              >
                <Card className="h-full overflow-hidden">
                  <div className="flex h-full flex-col bg-primary/5 p-8 transition-all duration-300 group-hover:bg-primary/10">
                    <h3 className="mb-4 text-2xl font-bold">{item.title}</h3>
                    <p className="text-lg text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                </Card>
              </motion.div>
            )
          )}
        </div>
      </motion.section>

      {/* Universal Value Section */}
      <motion.section
        variants={itemVariants}
        className="mx-auto mt-24 max-w-6xl px-4"
      >
        <div className="mb-16 text-center">
          <span className="mb-4 inline-block rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
            {t('landing.universal_value.title')}
          </span>
          <h2 className="group mb-4 text-center text-4xl font-bold">
            {t('landing.universal_value.title')}
            <span className="ml-2 inline-block">
              <Globe2 className="h-8 w-8 text-primary transition-transform duration-300 group-hover:scale-110 group-hover:rotate-12" />
            </span>
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            {t('landing.universal_value.subtitle')}
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          {[
            {
              title: t(
                'landing.universal_value.categories.business_size.title'
              ),
              items: t.raw(
                'landing.universal_value.categories.business_size.items'
              ),
              icon: <LayoutGrid className="h-6 w-6" />,
            },
            {
              title: t('landing.universal_value.categories.industries.title'),
              items: t.raw(
                'landing.universal_value.categories.industries.items'
              ),
              icon: <Building2 className="h-6 w-6" />,
            },
            {
              title: t('landing.universal_value.categories.use_cases.title'),
              items: t.raw(
                'landing.universal_value.categories.use_cases.items'
              ),
              icon: <Target className="h-6 w-6" />,
            },
          ].map((category, index) => (
            <motion.div
              key={index}
              variants={cardVariants}
              whileHover="hover"
              className="group"
            >
              <Card className="h-full overflow-hidden">
                <div className="flex h-full flex-col bg-primary/5 p-6 transition-all duration-300 group-hover:bg-primary/10">
                  <div className="mb-4 flex items-center gap-2 text-primary">
                    {category.icon}
                    <h3 className="text-xl font-bold">{category.title}</h3>
                  </div>
                  <ul className="space-y-2">
                    {(category.items as string[]).map((item, itemIndex) => (
                      <li
                        key={itemIndex}
                        className="flex items-center gap-2 text-sm"
                      >
                        <InfinityIcon className="h-4 w-4 text-primary" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* AI Features Section */}
      <motion.section
        variants={itemVariants}
        className="mx-auto mt-24 max-w-6xl px-4"
      >
        <div className="mb-16 text-center">
          <span className="mb-4 inline-block rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
            AI-Powered Innovation
          </span>
          <h2 className="group mb-4 text-center text-4xl font-bold">
            {t('landing.ai_features.title')}
            <span className="ml-2 inline-block">
              <Sparkles className="h-8 w-8 text-primary transition-transform duration-300 group-hover:scale-110 group-hover:rotate-12" />
            </span>
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            {t('landing.ai_features.subtitle')}
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {(t.raw('landing.ai_features.features') as any[]).map(
            (feature, index) => (
              <motion.div
                key={index}
                variants={cardVariants}
                whileHover="hover"
                className="group"
              >
                <Card className="relative h-full overflow-hidden">
                  <div className="flex h-full flex-col bg-primary/5 p-6 transition-all duration-300 group-hover:bg-primary/10">
                    <div className="absolute inset-0">
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(var(--primary-rgb),0.05)_1px,transparent_1px)] bg-[size:10px_10px] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(var(--primary-rgb),0.02)_1px,transparent_1px)] bg-[size:100px] opacity-0 transition-opacity duration-300 group-hover:opacity-20" />
                    </div>
                    <div className="relative">
                      <div className="mb-6 flex items-center justify-between">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                          {index === 0 && (
                            <Brain className="h-6 w-6 text-primary" />
                          )}
                          {index === 1 && (
                            <Bot className="h-6 w-6 text-primary" />
                          )}
                          {index === 2 && (
                            <Sparkles className="h-6 w-6 text-primary" />
                          )}
                          {index === 3 && (
                            <Target className="h-6 w-6 text-primary" />
                          )}
                          {index === 4 && (
                            <Database className="h-6 w-6 text-primary" />
                          )}
                          {index === 5 && (
                            <ChartBar className="h-6 w-6 text-primary" />
                          )}
                        </div>
                        {feature.status && (
                          <Badge variant="secondary" className="text-xs">
                            {feature.status}
                          </Badge>
                        )}
                      </div>
                      <h3 className="mb-2 text-xl font-bold">
                        {feature.title}
                      </h3>
                      <p className="mb-6 text-muted-foreground">
                        {feature.description}
                      </p>
                      {feature.capabilities && (
                        <div className="space-y-3">
                          {feature.capabilities.map(
                            (capability: string, i: number) => (
                              <motion.div
                                key={i}
                                initial={false}
                                whileHover={{ scale: 1.02, x: 4 }}
                                className="flex items-center gap-3 rounded-lg border border-primary/10 bg-background/50 p-3 backdrop-blur-sm"
                              >
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                                  <CheckCircle className="h-4 w-4 text-primary" />
                                </div>
                                <span className="text-sm font-medium">
                                  {capability}
                                </span>
                              </motion.div>
                            )
                          )}
                        </div>
                      )}
                      {feature.metrics && (
                        <div className="mt-6 flex items-center justify-between">
                          {Object.entries(feature.metrics).map(
                            ([key, value]) => (
                              <div
                                key={key}
                                className="flex items-center gap-2"
                              >
                                <span className="text-sm font-bold text-primary">
                                  {value as string}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {key}
                                </span>
                              </div>
                            )
                          )}
                        </div>
                      )}
                    </div>
                    <div className="absolute right-0 bottom-0 left-0 h-1 bg-gradient-to-r from-primary/20 to-primary/5 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  </div>
                </Card>
              </motion.div>
            )
          )}
        </div>
      </motion.section>

      {/* Success Metrics Section */}
      <motion.section
        variants={itemVariants}
        className="mx-auto mt-24 max-w-6xl px-4"
      >
        <div className="mb-16 text-center">
          <span className="mb-4 inline-block rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
            Success By Numbers
          </span>
          <h2 className="group mb-4 text-center text-4xl font-bold">
            {t('landing.success_metrics.title')}
            <span className="ml-2 inline-block">
              <ChartBar className="h-8 w-8 text-primary transition-transform duration-300 group-hover:scale-110 group-hover:rotate-12" />
            </span>
          </h2>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            {t('landing.success_metrics.subtitle')}
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {(t.raw('landing.success_metrics.metrics') as any[]).map(
            (metric, index) => (
              <motion.div
                key={index}
                variants={cardVariants}
                whileHover="hover"
                className="group"
              >
                <Card className="relative h-full overflow-hidden">
                  <div className="flex h-full flex-col items-center justify-center bg-primary/5 p-6 text-center transition-all duration-300 group-hover:bg-primary/10">
                    <div className="absolute inset-0">
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(var(--primary-rgb),0.05)_1px,transparent_1px)] bg-[size:10px_10px] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(var(--primary-rgb),0.02)_1px,transparent_1px)] bg-[size:100px] opacity-0 transition-opacity duration-300 group-hover:opacity-20" />
                    </div>
                    <div className="relative flex flex-col items-center">
                      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                        {index === 0 && (
                          <Users2 className="h-8 w-8 text-primary" />
                        )}
                        {index === 1 && (
                          <Globe2 className="h-8 w-8 text-primary" />
                        )}
                        {index === 2 && (
                          <TrendingUp className="h-8 w-8 text-primary" />
                        )}
                        {index === 3 && (
                          <Star className="h-8 w-8 text-primary" />
                        )}
                      </div>
                      <motion.span
                        initial={{ scale: 0.5, opacity: 0 }}
                        whileInView={{ scale: 1, opacity: 1 }}
                        viewport={{ once: true }}
                        className="relative mb-2 block text-5xl font-bold text-primary"
                      >
                        {metric.value}
                      </motion.span>
                      <span className="block text-sm text-muted-foreground">
                        {metric.label}
                      </span>
                      {metric.growth && (
                        <div className="mt-2 flex items-center justify-center gap-1 text-sm text-emerald-500">
                          <TrendingUp className="h-4 w-4" />
                          <span>{metric.growth}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              </motion.div>
            )
          )}
        </div>
      </motion.section>

      {/* Final CTA Section */}
      <motion.section
        variants={itemVariants}
        className="relative mx-auto mt-24 w-full max-w-3xl overflow-hidden py-24"
        onMouseEnter={handleCtaHover}
      >
        {/* Background Effects */}
        <div className="absolute inset-0">
          <div className="animate-aurora absolute inset-0 opacity-10" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_500px_at_50%_50%,rgba(var(--primary-rgb),0.15),transparent)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(var(--primary-rgb),0.1)_1px,transparent_1px)] bg-[size:20px_20px]" />
        </div>

        <div className="relative mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="rounded-2xl border border-primary/10 bg-background/50 p-8 shadow-xl backdrop-blur-md"
          >
            <div className="text-center">
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                whileInView={{ scale: 1, opacity: 1 }}
                viewport={{ once: true }}
                className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10"
              >
                <Rocket className="h-8 w-8 text-primary" />
              </motion.div>
              <h2 className="mb-4 text-4xl font-bold">
                {t('landing.cta.title')}
              </h2>
              <p className="mx-auto mb-8 max-w-3xl text-lg text-muted-foreground">
                {t('landing.cta.subtitle')}
              </p>
              <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
                <Link
                  href="/login"
                  className="group relative w-full overflow-hidden rounded-lg bg-foreground px-8 py-3 text-background transition-transform hover:scale-105 sm:w-auto"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-primary/0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  <span className="relative flex items-center justify-center gap-2 font-medium">
                    {t('landing.cta.primary_button')}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </Link>
                <Link
                  href="/contact"
                  className="group relative w-full overflow-hidden rounded-lg bg-primary/10 px-8 py-3 transition-transform hover:scale-105 sm:w-auto"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-primary/5 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  <span className="relative flex items-center justify-center gap-2 font-medium">
                    {t('landing.cta.secondary_button')}
                    <Plus className="h-4 w-4 transition-transform group-hover:rotate-90" />
                  </span>
                </Link>
              </div>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-6">
                <div className="flex items-center gap-2">
                  <Timer className="h-5 w-5 text-primary" />
                  <span className="text-sm text-muted-foreground">
                    {t('landing.cta.no_card_required')}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-primary" />
                  <span className="text-sm text-muted-foreground">
                    Enterprise-grade security
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Globe2 className="h-5 w-5 text-primary" />
                  <span className="text-sm text-muted-foreground">
                    Available worldwide
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </motion.section>
    </div>
  );
}
