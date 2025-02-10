'use client';

import FloatingElements from './floating-elements';
import GetStartedButton from './get-started-button';
import GradientHeadline from './gradient-headline';
import { fireConfetti, fireRocket } from '@/lib/confetti';
import { Badge } from '@tutur3u/ui/components/ui/badge';
import { Card } from '@tutur3u/ui/components/ui/card';
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
        className="from-background via-background to-dynamic-light-pink/10 relative min-h-[calc(100vh-3.5rem+53px)] w-full bg-gradient-to-b"
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
            className="absolute -left-32 top-0 h-[20rem] w-[20rem] rounded-full bg-gradient-to-br from-purple-500/30 via-pink-500/20 to-transparent blur-3xl sm:-left-64 sm:h-[40rem] sm:w-[40rem]"
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
            className="absolute -right-32 top-[30%] h-[17.5rem] w-[17.5rem] rounded-full bg-gradient-to-br from-blue-500/30 via-cyan-500/20 to-transparent blur-3xl sm:-right-64 sm:h-[35rem] sm:w-[35rem]"
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
              <div className="from-primary/20 absolute inset-0 -z-10 rounded-full bg-gradient-to-br via-transparent to-transparent opacity-50 blur-lg transition-all duration-300 group-hover:opacity-100" />
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
            <div className="from-primary/20 via-primary/10 to-primary/20 absolute -inset-x-4 -inset-y-2 rounded-xl bg-gradient-to-r opacity-0 blur-xl transition-all duration-300 group-hover:opacity-100" />
            <h1 className="text-foreground relative mx-auto mb-4 text-center text-2xl font-bold tracking-tight md:text-4xl lg:text-6xl">
              <span className="from-primary/20 to-primary/10 absolute -inset-1 rounded-lg bg-gradient-to-r opacity-0 blur transition-all duration-300 group-hover:opacity-100" />
              <GradientHeadline title={t('landing.headline')} />
            </h1>
            <h2 className="text-foreground mb-12 text-balance text-lg font-bold tracking-tight md:text-2xl lg:text-3xl">
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
                  className="text-primary/80 flex items-center gap-2"
                >
                  {item.icon}
                  <span className="text-muted-foreground text-sm font-medium">
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
          <div className="text-muted-foreground flex flex-col items-center gap-2">
            <span className="text-sm font-medium">
              {t('common.scroll_to_explore')}
            </span>
            <motion.div
              animate={{ scale: [1, 1.2, 1], rotate: [0, 10, -10, 0] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="relative h-8 w-8"
            >
              <div className="bg-primary/20 absolute inset-0 animate-ping rounded-full" />
              <div className="bg-primary/10 relative flex h-full w-full items-center justify-center rounded-full">
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
            <span className="bg-primary/10 text-primary mb-4 inline-block rounded-full px-4 py-1.5 text-sm font-medium">
              Powerful Platform Features
            </span>
            <h2 className="group mb-4 text-center text-4xl font-bold">
              {t('landing.features.title')}
              <span className="ml-2 inline-block">
                <Zap className="text-primary h-8 w-8 transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110" />
              </span>
            </h2>
            <p className="text-muted-foreground mx-auto max-w-2xl">
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
                <div className="bg-primary/5 group-hover:bg-primary/10 relative flex h-full flex-col p-8 transition-all duration-300">
                  <div className="from-primary/10 absolute inset-0 bg-gradient-to-br via-transparent to-transparent opacity-0 transition-all duration-300 group-hover:opacity-100" />
                  <div className="relative">
                    <div className="bg-primary/10 mb-6 inline-flex rounded-full p-3">
                      <Brain className="text-primary h-8 w-8" />
                    </div>
                    <h3 className="mb-4 text-2xl font-bold">
                      {t('landing.features.ai_powered.title')}
                    </h3>
                    <p className="text-muted-foreground text-lg">
                      {t('landing.features.ai_powered.description')}
                    </p>
                    <div className="mt-8 grid grid-cols-2 gap-4">
                      <div className="border-primary/10 bg-background/50 flex items-center gap-3 rounded-lg border p-4 backdrop-blur-sm">
                        <Sparkles className="text-primary h-5 w-5" />
                        <span className="text-sm font-medium">
                          Smart Automation
                        </span>
                      </div>
                      <div className="border-primary/10 bg-background/50 flex items-center gap-3 rounded-lg border p-4 backdrop-blur-sm">
                        <Target className="text-primary h-5 w-5" />
                        <span className="text-sm font-medium">
                          Predictive Analytics
                        </span>
                      </div>
                      <div className="border-primary/10 bg-background/50 flex items-center gap-3 rounded-lg border p-4 backdrop-blur-sm">
                        <Bot className="text-primary h-5 w-5" />
                        <span className="text-sm font-medium">
                          AI Assistants
                        </span>
                      </div>
                      <div className="border-primary/10 bg-background/50 flex items-center gap-3 rounded-lg border p-4 backdrop-blur-sm">
                        <Database className="text-primary h-5 w-5" />
                        <span className="text-sm font-medium">
                          Smart Data Processing
                        </span>
                      </div>
                    </div>
                    <div className="mt-8 flex items-center gap-8">
                      <div className="flex items-center gap-2">
                        <Award className="text-primary h-5 w-5" />
                        <span className="text-muted-foreground text-sm">
                          Industry Leading
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <TrendingUp className="text-primary h-5 w-5" />
                        <span className="text-muted-foreground text-sm">
                          200% Productivity Boost
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="from-primary/20 to-primary/5 absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
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
                      <div className="bg-primary/10 mb-6 inline-flex rounded-full p-3">
                        <div className="text-primary transition-transform duration-300 group-hover:rotate-3 group-hover:scale-110">
                          {feature.icon}
                        </div>
                      </div>
                      <h3 className="mb-2 text-xl font-bold">
                        {feature.title}
                      </h3>
                      <p className="text-muted-foreground mb-4 text-sm">
                        {feature.description}
                      </p>
                      <div className="mt-auto flex items-center justify-between">
                        {Object.entries(feature.metrics).map(([key, value]) => (
                          <div key={key} className="flex items-center gap-2">
                            <span className="text-primary text-sm font-bold">
                              {value}
                            </span>
                            <span className="text-muted-foreground text-xs">
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
          <span className="bg-primary/10 text-primary mb-4 inline-block rounded-full px-4 py-1.5 text-sm font-medium">
            Integrated Product Suite
          </span>
          <h2 className="group mb-4 text-center text-4xl font-bold">
            {t('landing.products.title')}
            <span className="ml-2 inline-block">
              <Container className="text-primary h-8 w-8 transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110" />
            </span>
          </h2>
          <p className="text-muted-foreground mx-auto max-w-2xl">
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
                <div className="bg-primary/5 group-hover:bg-primary/10 flex h-full flex-col p-6 transition-all duration-300">
                  <div
                    className={`absolute inset-0 bg-gradient-to-br opacity-0 ${product.gradient} transition-opacity duration-300 group-hover:opacity-100`}
                  />
                  <div className="relative">
                    <div className="text-primary mb-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="border-primary/10 bg-background/50 flex h-12 w-12 items-center justify-center rounded-full border backdrop-blur-sm">
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
                    <p className="text-muted-foreground mb-6 line-clamp-2">
                      {product.description}
                    </p>
                    <div className="space-y-4">
                      <div className="flex flex-wrap gap-4">
                        {product.features.map((feature, index) => (
                          <div
                            key={index}
                            className="border-primary/10 bg-background/50 flex items-center gap-2 rounded-full border px-3 py-1 backdrop-blur-sm"
                          >
                            <CheckCircle className="text-primary h-3 w-3" />
                            <span className="text-xs font-medium">
                              {feature}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center justify-between">
                        {Object.entries(product.metrics).map(([key, value]) => (
                          <div key={key} className="flex items-center gap-2">
                            <span className="text-primary text-sm font-bold">
                              {value}
                            </span>
                            <span className="text-muted-foreground text-xs">
                              {key}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="text-primary mt-6 flex items-center gap-2 text-sm font-medium">
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
          <span className="bg-primary/10 text-primary mb-4 inline-block rounded-full px-4 py-1.5 text-sm font-medium">
            Industry-Specific Solutions
          </span>
          <h2 className="group mb-4 text-center text-4xl font-bold">
            {t('landing.solutions.title')}
            <span className="ml-2 inline-block">
              <Building2 className="text-primary h-8 w-8 transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110" />
            </span>
          </h2>
          <p className="text-muted-foreground mx-auto max-w-2xl">
            {t('landing.solutions.subtitle')}
          </p>
        </div>

        <div className="grid gap-6 px-4 md:grid-cols-2 lg:grid-cols-4">
          {industries.map((industry) => (
            <Link key={industry} href={`/solutions/${industry}`}>
              <Card className="group relative h-full overflow-hidden">
                <div className="bg-primary/5 hover:bg-primary/10 flex h-full flex-col items-center justify-center p-6 text-center transition-all duration-300">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(var(--primary-rgb),0.05)_1px,transparent_1px)] bg-[size:10px_10px] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  <div className="relative flex flex-col items-center">
                    <div className="bg-primary/10 mb-4 flex h-16 w-16 items-center justify-center rounded-full">
                      {industry === 'manufacturing' && (
                        <Factory className="text-primary h-8 w-8" />
                      )}
                      {industry === 'healthcare' && (
                        <Stethoscope className="text-primary h-8 w-8" />
                      )}
                      {industry === 'education' && (
                        <GraduationCap className="text-primary h-8 w-8" />
                      )}
                      {industry === 'retail' && (
                        <Store className="text-primary h-8 w-8" />
                      )}
                      {industry === 'real_estate' && (
                        <Building2 className="text-primary h-8 w-8" />
                      )}
                      {industry === 'hospitality' && (
                        <UtensilsCrossed className="text-primary h-8 w-8" />
                      )}
                      {industry === 'construction' && (
                        <HardHat className="text-primary h-8 w-8" />
                      )}
                      {industry === 'pharmacies' && (
                        <Pill className="text-primary h-8 w-8" />
                      )}
                    </div>
                    <h3 className="mb-2 text-lg font-bold">
                      {t(`landing.solutions.industries.${industry}` as const)}
                    </h3>
                    <div className="text-primary mt-auto flex items-center justify-center gap-2 font-medium opacity-0 transition-all duration-300 group-hover:opacity-100">
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
          <span className="bg-primary/10 text-primary mb-4 inline-block rounded-full px-4 py-1.5 text-sm font-medium">
            Why Choose Tuturuuu
          </span>
          <h2 className="group mb-4 text-center text-4xl font-bold">
            {t('landing.benefits.title')}
            <span className="ml-2 inline-block">
              <Star className="text-primary h-8 w-8 transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110" />
            </span>
          </h2>
          <p className="text-muted-foreground mx-auto max-w-2xl">
            {t('landing.benefits.subtitle')}
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-2">
          <motion.div
            variants={cardVariants}
            whileHover="hover"
            className="group"
          >
            <Card className="bg-primary/5 relative h-full overflow-hidden p-8">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(var(--primary-rgb),0.05)_1px,transparent_1px)] bg-[size:10px_10px] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <div className="relative">
                <div className="border-primary/10 bg-background/50 mb-6 inline-flex rounded-full border p-3 backdrop-blur-sm">
                  <Building2 className="text-primary h-8 w-8" />
                </div>
                <h3 className="mb-6 text-2xl font-bold">
                  {t('landing.benefits.for_businesses.title')}
                </h3>
                <div className="space-y-4">
                  {businessBenefits.map((benefit: string) => (
                    <div key={benefit} className="flex items-start gap-3">
                      <div className="border-primary/10 bg-background/50 flex h-6 w-6 flex-none items-center justify-center rounded-full border backdrop-blur-sm">
                        <CheckCircle className="text-primary h-4 w-4" />
                      </div>
                      <span className="text-muted-foreground text-sm">
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
            <Card className="bg-primary/5 relative h-full overflow-hidden p-8">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(var(--primary-rgb),0.05)_1px,transparent_1px)] bg-[size:10px_10px] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <div className="relative">
                <div className="border-primary/10 bg-background/50 mb-6 inline-flex rounded-full border p-3 backdrop-blur-sm">
                  <Users2 className="text-primary h-8 w-8" />
                </div>
                <h3 className="mb-6 text-2xl font-bold">
                  {t('landing.benefits.for_teams.title')}
                </h3>
                <div className="space-y-4">
                  {teamBenefits.map((benefit: string) => (
                    <div key={benefit} className="flex items-start gap-3">
                      <div className="border-primary/10 bg-background/50 flex h-6 w-6 flex-none items-center justify-center rounded-full border backdrop-blur-sm">
                        <CheckCircle className="text-primary h-4 w-4" />
                      </div>
                      <span className="text-muted-foreground text-sm">
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
            <Card className="border-primary/10 bg-background/50 relative overflow-hidden p-6 backdrop-blur-sm">
              <div className="flex items-center gap-4">
                <div className="bg-primary/10 flex h-12 w-12 items-center justify-center rounded-full">
                  <Shield className="text-primary h-6 w-6" />
                </div>
                <div>
                  <h4 className="font-bold">Enterprise Security</h4>
                  <p className="text-muted-foreground text-sm">
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
            <Card className="border-primary/10 bg-background/50 relative overflow-hidden p-6 backdrop-blur-sm">
              <div className="flex items-center gap-4">
                <div className="bg-primary/10 flex h-12 w-12 items-center justify-center rounded-full">
                  <Zap className="text-primary h-6 w-6" />
                </div>
                <div>
                  <h4 className="font-bold">Lightning Fast</h4>
                  <p className="text-muted-foreground text-sm">
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
            <Card className="border-primary/10 bg-background/50 relative overflow-hidden p-6 backdrop-blur-sm">
              <div className="flex items-center gap-4">
                <div className="bg-primary/10 flex h-12 w-12 items-center justify-center rounded-full">
                  <Globe2 className="text-primary h-6 w-6" />
                </div>
                <div>
                  <h4 className="font-bold">Global Scale</h4>
                  <p className="text-muted-foreground text-sm">
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
          <span className="bg-primary/10 text-primary mb-4 inline-block rounded-full px-4 py-1.5 text-sm font-medium">
            Digital Transformation Journey
          </span>
          <h2 className="group mb-4 text-center text-4xl font-bold">
            {t('landing.transformation.title')}
            <span className="ml-2 inline-block">
              <Rocket className="text-primary h-8 w-8 transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110" />
            </span>
          </h2>
          <p className="text-muted-foreground mx-auto max-w-2xl">
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
                  <div className="bg-primary/5 group-hover:bg-primary/10 flex h-full flex-col p-8 transition-all duration-300">
                    <div className="absolute inset-0">
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(var(--primary-rgb),0.05)_1px,transparent_1px)] bg-[size:10px_10px] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(var(--primary-rgb),0.02)_1px,transparent_1px)] bg-[size:100px] opacity-0 transition-opacity duration-300 group-hover:opacity-20" />
                      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(var(--primary-rgb),0.02)_1px,transparent_1px)] bg-[size:100px] opacity-0 transition-opacity duration-300 group-hover:opacity-20" />
                    </div>
                    <div className="relative">
                      <div className="relative mb-6">
                        <div className="bg-foreground text-background relative flex h-16 w-16 items-center justify-center rounded-full">
                          <div className="bg-primary/20 absolute -inset-1 animate-pulse rounded-full blur-sm" />
                          <div className="from-primary/20 to-primary/5 absolute inset-0 rounded-full bg-gradient-to-br opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                          <span className="relative text-2xl font-bold">
                            {index + 1}
                          </span>
                        </div>
                        <div className="absolute -right-2 -top-2">
                          {index === 0 && (
                            <Rocket className="text-primary h-6 w-6" />
                          )}
                          {index === 1 && (
                            <Target className="text-primary h-6 w-6" />
                          )}
                          {index === 2 && (
                            <Sparkles className="text-primary h-6 w-6" />
                          )}
                        </div>
                      </div>
                      <h3 className="mb-4 text-xl font-bold">{step.title}</h3>
                      <p className="text-muted-foreground mb-6">
                        {step.description}
                      </p>
                      {step.features && (
                        <div className="space-y-3">
                          {step.features.map((feature: string, i: number) => (
                            <motion.div
                              key={i}
                              initial={false}
                              whileHover={{ scale: 1.02, x: 4 }}
                              className="border-primary/10 bg-background/50 flex items-center gap-3 rounded-lg border p-3 backdrop-blur-sm"
                            >
                              <div className="bg-primary/10 flex h-8 w-8 items-center justify-center rounded-full">
                                <CheckCircle className="text-primary h-4 w-4" />
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
                          <Timer className="text-primary h-4 w-4" />
                          <span className="text-muted-foreground text-xs">
                            Quick setup
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Shield className="text-primary h-4 w-4" />
                          <span className="text-muted-foreground text-xs">
                            Enterprise ready
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="from-primary/20 to-primary/5 absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
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
          <span className="bg-primary/10 text-primary mb-4 inline-block rounded-full px-4 py-1.5 text-sm font-medium">
            {t('landing.testimonials.title')}
          </span>
          <h2 className="group mb-4 text-center text-4xl font-bold">
            {t('landing.testimonials.title')}
            <span className="ml-2 inline-block">
              <MessageCircle className="text-primary h-8 w-8 transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110" />
            </span>
          </h2>
          <p className="text-muted-foreground mx-auto max-w-2xl">
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
                  <div className="bg-primary/5 group-hover:bg-primary/10 flex h-full flex-col p-6 transition-all duration-300">
                    <div className="text-primary mb-4">
                      <Sparkles className="h-6 w-6" />
                    </div>
                    <blockquote className="mb-4 flex-grow text-lg italic">
                      "{testimonial.quote}"
                    </blockquote>
                    <div>
                      <p className="font-bold">{testimonial.author}</p>
                      <p className="text-muted-foreground text-sm">
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
          <span className="bg-primary/10 text-primary mb-4 inline-block rounded-full px-4 py-1.5 text-sm font-medium">
            {t('landing.ai_revolution.title')}
          </span>
          <h2 className="group mb-4 text-center text-4xl font-bold">
            {t('landing.ai_revolution.title')}
            <span className="ml-2 inline-block">
              <Brain className="text-primary h-8 w-8 transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110" />
            </span>
          </h2>
          <p className="text-muted-foreground mx-auto max-w-2xl">
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
                  <div className="bg-primary/5 group-hover:bg-primary/10 flex h-full flex-col p-8 transition-all duration-300">
                    <h3 className="mb-4 text-2xl font-bold">{item.title}</h3>
                    <p className="text-muted-foreground text-lg">
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
          <span className="bg-primary/10 text-primary mb-4 inline-block rounded-full px-4 py-1.5 text-sm font-medium">
            {t('landing.universal_value.title')}
          </span>
          <h2 className="group mb-4 text-center text-4xl font-bold">
            {t('landing.universal_value.title')}
            <span className="ml-2 inline-block">
              <Globe2 className="text-primary h-8 w-8 transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110" />
            </span>
          </h2>
          <p className="text-muted-foreground mx-auto max-w-2xl">
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
                <div className="bg-primary/5 group-hover:bg-primary/10 flex h-full flex-col p-6 transition-all duration-300">
                  <div className="text-primary mb-4 flex items-center gap-2">
                    {category.icon}
                    <h3 className="text-xl font-bold">{category.title}</h3>
                  </div>
                  <ul className="space-y-2">
                    {(category.items as string[]).map((item, itemIndex) => (
                      <li
                        key={itemIndex}
                        className="flex items-center gap-2 text-sm"
                      >
                        <InfinityIcon className="text-primary h-4 w-4" />
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
          <span className="bg-primary/10 text-primary mb-4 inline-block rounded-full px-4 py-1.5 text-sm font-medium">
            AI-Powered Innovation
          </span>
          <h2 className="group mb-4 text-center text-4xl font-bold">
            {t('landing.ai_features.title')}
            <span className="ml-2 inline-block">
              <Sparkles className="text-primary h-8 w-8 transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110" />
            </span>
          </h2>
          <p className="text-muted-foreground mx-auto max-w-2xl">
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
                  <div className="bg-primary/5 group-hover:bg-primary/10 flex h-full flex-col p-6 transition-all duration-300">
                    <div className="absolute inset-0">
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(var(--primary-rgb),0.05)_1px,transparent_1px)] bg-[size:10px_10px] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(var(--primary-rgb),0.02)_1px,transparent_1px)] bg-[size:100px] opacity-0 transition-opacity duration-300 group-hover:opacity-20" />
                    </div>
                    <div className="relative">
                      <div className="mb-6 flex items-center justify-between">
                        <div className="bg-primary/10 flex h-12 w-12 items-center justify-center rounded-full">
                          {index === 0 && (
                            <Brain className="text-primary h-6 w-6" />
                          )}
                          {index === 1 && (
                            <Bot className="text-primary h-6 w-6" />
                          )}
                          {index === 2 && (
                            <Sparkles className="text-primary h-6 w-6" />
                          )}
                          {index === 3 && (
                            <Target className="text-primary h-6 w-6" />
                          )}
                          {index === 4 && (
                            <Database className="text-primary h-6 w-6" />
                          )}
                          {index === 5 && (
                            <ChartBar className="text-primary h-6 w-6" />
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
                      <p className="text-muted-foreground mb-6">
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
                                className="border-primary/10 bg-background/50 flex items-center gap-3 rounded-lg border p-3 backdrop-blur-sm"
                              >
                                <div className="bg-primary/10 flex h-8 w-8 items-center justify-center rounded-full">
                                  <CheckCircle className="text-primary h-4 w-4" />
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
                                <span className="text-primary text-sm font-bold">
                                  {value as string}
                                </span>
                                <span className="text-muted-foreground text-xs">
                                  {key}
                                </span>
                              </div>
                            )
                          )}
                        </div>
                      )}
                    </div>
                    <div className="from-primary/20 to-primary/5 absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
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
          <span className="bg-primary/10 text-primary mb-4 inline-block rounded-full px-4 py-1.5 text-sm font-medium">
            Success By Numbers
          </span>
          <h2 className="group mb-4 text-center text-4xl font-bold">
            {t('landing.success_metrics.title')}
            <span className="ml-2 inline-block">
              <ChartBar className="text-primary h-8 w-8 transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110" />
            </span>
          </h2>
          <p className="text-muted-foreground mx-auto max-w-2xl">
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
                  <div className="bg-primary/5 group-hover:bg-primary/10 flex h-full flex-col items-center justify-center p-6 text-center transition-all duration-300">
                    <div className="absolute inset-0">
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(var(--primary-rgb),0.05)_1px,transparent_1px)] bg-[size:10px_10px] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(var(--primary-rgb),0.02)_1px,transparent_1px)] bg-[size:100px] opacity-0 transition-opacity duration-300 group-hover:opacity-20" />
                    </div>
                    <div className="relative flex flex-col items-center">
                      <div className="bg-primary/10 mb-4 flex h-16 w-16 items-center justify-center rounded-full">
                        {index === 0 && (
                          <Users2 className="text-primary h-8 w-8" />
                        )}
                        {index === 1 && (
                          <Globe2 className="text-primary h-8 w-8" />
                        )}
                        {index === 2 && (
                          <TrendingUp className="text-primary h-8 w-8" />
                        )}
                        {index === 3 && (
                          <Star className="text-primary h-8 w-8" />
                        )}
                      </div>
                      <motion.span
                        initial={{ scale: 0.5, opacity: 0 }}
                        whileInView={{ scale: 1, opacity: 1 }}
                        viewport={{ once: true }}
                        className="text-primary relative mb-2 block text-5xl font-bold"
                      >
                        {metric.value}
                      </motion.span>
                      <span className="text-muted-foreground block text-sm">
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
            className="border-primary/10 bg-background/50 rounded-2xl border p-8 shadow-xl backdrop-blur-md"
          >
            <div className="text-center">
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                whileInView={{ scale: 1, opacity: 1 }}
                viewport={{ once: true }}
                className="bg-primary/10 mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full"
              >
                <Rocket className="text-primary h-8 w-8" />
              </motion.div>
              <h2 className="mb-4 text-4xl font-bold">
                {t('landing.cta.title')}
              </h2>
              <p className="text-muted-foreground mx-auto mb-8 max-w-3xl text-lg">
                {t('landing.cta.subtitle')}
              </p>
              <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
                <Link
                  href="/login"
                  className="bg-foreground text-background group relative w-full overflow-hidden rounded-lg px-8 py-3 transition-transform hover:scale-105 sm:w-auto"
                >
                  <div className="from-primary/20 to-primary/0 absolute inset-0 bg-gradient-to-r opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  <span className="relative flex items-center justify-center gap-2 font-medium">
                    {t('landing.cta.primary_button')}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </Link>
                <Link
                  href="/contact"
                  className="bg-primary/10 group relative w-full overflow-hidden rounded-lg px-8 py-3 transition-transform hover:scale-105 sm:w-auto"
                >
                  <div className="from-primary/10 to-primary/5 absolute inset-0 bg-gradient-to-r opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  <span className="relative flex items-center justify-center gap-2 font-medium">
                    {t('landing.cta.secondary_button')}
                    <Plus className="h-4 w-4 transition-transform group-hover:rotate-90" />
                  </span>
                </Link>
              </div>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-6">
                <div className="flex items-center gap-2">
                  <Timer className="text-primary h-5 w-5" />
                  <span className="text-muted-foreground text-sm">
                    {t('landing.cta.no_card_required')}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Shield className="text-primary h-5 w-5" />
                  <span className="text-muted-foreground text-sm">
                    Enterprise-grade security
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Globe2 className="text-primary h-5 w-5" />
                  <span className="text-muted-foreground text-sm">
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
