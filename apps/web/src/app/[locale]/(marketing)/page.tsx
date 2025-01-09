'use client';

import FloatingElements from './floating-elements';
import GetStartedButton from './get-started-button';
import GradientHeadline from './gradient-headline';
import { fireConfetti, fireRocket } from '@/lib/confetti';
import { Card } from '@repo/ui/components/ui/card';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import {
  InfinityIcon,
  Archive,
  ArrowRight,
  Banknote,
  Brain,
  Building2,
  Calendar,
  ChartBar,
  CheckCircle,
  Container,
  FileText,
  Github,
  Globe2,
  HardDrive,
  LayoutGrid,
  Lightbulb,
  MessageCircle,
  Plus,
  Rocket,
  Sparkles,
  Star,
  StepForward,
  Target,
  Timer,
  Users,
  Users2,
  Workflow,
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
      className="relative flex w-full flex-col items-center"
      suppressHydrationWarning
    >
      <FloatingElements />

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1 }}
        className="from-background via-background to-dynamic-light-pink/10 relative min-h-[calc(100vh-3.5rem)] w-full bg-gradient-to-b"
      >
        {/* Animated Background Patterns */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="animate-aurora absolute inset-0 opacity-20" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_500px_at_50%_50%,rgba(var(--primary-rgb),0.15),transparent)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_800px_at_100%_100%,rgba(var(--primary-rgb),0.1),transparent)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_600px_at_0%_0%,rgba(var(--primary-rgb),0.1),transparent)]" />
          <div className="absolute inset-0">
            <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(var(--primary-rgb),0.05)_1px,transparent_1px)] bg-[size:100px] opacity-20" />
            <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(var(--primary-rgb),0.05)_1px,transparent_1px)] bg-[size:100px] opacity-20" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(var(--primary-rgb),0.1)_1px,transparent_1px)] bg-[size:40px_40px]" />
          </div>
        </div>

        {/* Main Content */}
        <div className="relative mx-auto flex max-w-6xl flex-col items-center justify-center px-4 py-48">
          {/* 3D Floating Logo */}
          <motion.div
            ref={logoRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => {
              mouseX.set(0);
              mouseY.set(-0);
            }}
            style={{ perspective: 1000 }}
            className="group relative mb-8"
          >
            <motion.div
              style={{
                rotateX,
                rotateY,
                transformStyle: 'preserve-3d',
              }}
              className="relative"
            >
              <Image
                src="/media/logos/transparent.png"
                width={180}
                height={180}
                alt="Tuturuuu Logo"
                priority
                className="relative transition-all duration-300 group-hover:scale-110 group-hover:brightness-110"
              />
            </motion.div>
          </motion.div>

          {/* Headline and CTA */}
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
            <h2 className="text-foreground mb-12 max-w-3xl text-balance text-lg font-bold tracking-tight md:text-2xl lg:text-3xl">
              {t('landing.subheadline')}
            </h2>

            <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <GetStartedButton href="/login" />
            </div>
          </motion.div>
        </div>

        {/* Scroll Indicator */}
        <motion.div
          animate={{ y: [0, 10, 0] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="absolute inset-x-0 bottom-24 flex w-full flex-col items-center"
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
        </div>

        <div className="relative mx-auto max-w-6xl px-4">
          <motion.div variants={itemVariants} className="mb-16 text-center">
            <span className="bg-primary/10 text-primary mb-4 inline-block rounded-full px-4 py-1.5 text-sm font-medium">
              {t('landing.features.title')}
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
              <Card className="h-full overflow-hidden">
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
                  </div>
                </div>
              </Card>
            </motion.div>

            {/* Regular feature cards */}
            {[
              {
                title: t('landing.features.collaboration.title'),
                description: t('landing.features.collaboration.description'),
                icon: <Users2 className="h-8 w-8" />,
              },
              {
                title: t('landing.features.task_management.title'),
                description: t('landing.features.task_management.description'),
                icon: <CheckCircle className="h-8 w-8" />,
              },
              {
                title: t('landing.features.document_management.title'),
                description: t(
                  'landing.features.document_management.description'
                ),
                icon: <FileText className="h-8 w-8" />,
              },
              {
                title: t('landing.features.finance_tracking.title'),
                description: t('landing.features.finance_tracking.description'),
                icon: <Banknote className="h-8 w-8" />,
              },
              {
                title: t('landing.features.open_source.title'),
                description: t('landing.features.open_source.description'),
                icon: <Github className="h-8 w-8" />,
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
                    <div className="bg-primary/10 mb-6 inline-flex rounded-full p-3">
                      <div className="text-primary transition-transform duration-300 group-hover:rotate-3 group-hover:scale-110">
                        {feature.icon}
                      </div>
                    </div>
                    <h3 className="mb-2 text-xl font-bold">{feature.title}</h3>
                    <p className="text-muted-foreground text-sm">
                      {feature.description}
                    </p>
                  </div>
                  <div className="from-primary/50 to-primary absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* Products Grid */}
      <motion.section
        variants={itemVariants}
        className="mx-auto mt-24 max-w-6xl"
      >
        <div className="mb-16 text-center">
          <span className="bg-primary/10 text-primary mb-4 inline-block rounded-full px-4 py-1.5 text-sm font-medium">
            {t('landing.products.title')}
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

        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              title: t('landing.products.meet_together.title'),
              description: t('landing.products.meet_together.description'),
              icon: <Users className="h-6 w-6" />,
            },
            {
              title: t('landing.products.calendar.title'),
              description: t('landing.products.calendar.description'),
              icon: <Calendar className="h-6 w-6" />,
            },
            {
              title: t('landing.products.documents.title'),
              description: t('landing.products.documents.description'),
              icon: <FileText className="h-6 w-6" />,
            },
            {
              title: t('landing.products.drive.title'),
              description: t('landing.products.drive.description'),
              icon: <HardDrive className="h-6 w-6" />,
            },
            {
              title: t('landing.products.crm.title'),
              description: t('landing.products.crm.description'),
              icon: <Users2 className="h-6 w-6" />,
            },
            {
              title: t('landing.products.finance.title'),
              description: t('landing.products.finance.description'),
              icon: <Banknote className="h-6 w-6" />,
            },
            {
              title: t('landing.products.inventory.title'),
              description: t('landing.products.inventory.description'),
              icon: <Archive className="h-6 w-6" />,
            },
            {
              title: t('landing.products.tasks.title'),
              description: t('landing.products.tasks.description'),
              icon: <CheckCircle className="h-6 w-6" />,
            },
            {
              title: t('landing.products.workflows.title'),
              description: t('landing.products.workflows.description'),
              icon: <Workflow className="h-6 w-6" />,
            },
          ].map((product) => (
            <motion.div
              key={product.title}
              variants={cardVariants}
              whileHover="hover"
              className="group"
            >
              <Card className="h-full overflow-hidden">
                <div className="bg-primary/5 group-hover:bg-primary/10 flex h-full flex-col p-6 transition-all duration-300">
                  <div className="text-primary mb-4">{product.icon}</div>
                  <h3 className="mb-2 text-xl font-bold">{product.title}</h3>
                  <p className="text-muted-foreground">{product.description}</p>
                </div>
              </Card>
            </motion.div>
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
            {t('landing.solutions.title')}
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

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {industries.map((industry) => (
            <Link key={industry} href={`/solutions/${industry}`}>
              <Card className="group h-full overflow-hidden">
                <div className="bg-primary/5 hover:bg-primary/10 flex h-full flex-col items-center justify-center p-6 text-center transition-all duration-300">
                  <h3 className="text-lg font-bold">
                    {t(`landing.solutions.industries.${industry}` as const)}
                  </h3>
                  <div className="text-primary mt-4 flex items-center gap-2 font-medium group-hover:underline">
                    {t('common.learn_more')}
                    <Rocket className="h-4 w-4 transition-transform duration-300 group-hover:-translate-y-1 group-hover:translate-x-1" />
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
        className="mx-auto my-24 max-w-6xl"
      >
        <div className="mb-16 text-center">
          <span className="bg-primary/10 text-primary mb-4 inline-block rounded-full px-4 py-1.5 text-sm font-medium">
            {t('landing.benefits.title')}
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
          <Card className="bg-primary/5 p-8">
            <h3 className="mb-6 text-2xl font-bold">
              {t('landing.benefits.for_businesses.title')}
            </h3>
            <div className="space-y-4">
              {businessBenefits.map((benefit: string) => (
                <div key={benefit} className="flex items-center gap-2">
                  <CheckCircle className="text-primary h-5 w-5" />
                  <span>{benefit}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="bg-primary/5 p-8">
            <h3 className="mb-6 text-2xl font-bold">
              {t('landing.benefits.for_teams.title')}
            </h3>
            <div className="space-y-4">
              {teamBenefits.map((benefit: string) => (
                <div key={benefit} className="flex items-center gap-2">
                  <CheckCircle className="text-primary h-5 w-5" />
                  <span>{benefit}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </motion.section>

      {/* How It Works Section */}
      <motion.section
        variants={itemVariants}
        className="mx-auto mt-24 max-w-6xl"
      >
        <div className="mb-16 text-center">
          <span className="bg-primary/10 text-primary mb-4 inline-block rounded-full px-4 py-1.5 text-sm font-medium">
            {t('landing.how_it_works.title')}
          </span>
          <h2 className="group mb-4 text-center text-4xl font-bold">
            {t('landing.how_it_works.title')}
            <span className="ml-2 inline-block">
              <StepForward className="text-primary h-8 w-8 transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110" />
            </span>
          </h2>
          <p className="text-muted-foreground mx-auto max-w-2xl">
            {t('landing.how_it_works.subtitle')}
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-4">
          {['step1', 'step2', 'step3', 'step4'].map((step, index) => (
            <motion.div
              key={step}
              variants={cardVariants}
              whileHover="hover"
              className="group relative"
            >
              <div className="bg-primary/5 group-hover:bg-primary/10 absolute -inset-px rounded-xl transition-all duration-300" />
              <div className="relative p-6">
                <div className="bg-foreground text-background mb-4 flex h-12 w-12 items-center justify-center rounded-full shadow-lg">
                  <span className="text-xl font-bold">{index + 1}</span>
                </div>
                <h3 className="mb-2 text-xl font-bold">
                  {t(`landing.how_it_works.steps.${step}.title` as any)}
                </h3>
                <p className="text-muted-foreground">
                  {t(`landing.how_it_works.steps.${step}.description` as any)}
                </p>
                <div className="from-primary/20 to-primary/5 absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              </div>
            </motion.div>
          ))}
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

        <div className="grid gap-8 md:grid-cols-3">
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
                    <div className="from-primary/20 to-primary/5 mt-auto h-1 bg-gradient-to-r opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
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
            {t('landing.ai_features.title')}
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
                <Card className="h-full overflow-hidden">
                  <div className="bg-primary/5 group-hover:bg-primary/10 flex h-full flex-col p-6 transition-all duration-300">
                    <div className="text-primary mb-4">
                      <Lightbulb className="h-6 w-6" />
                    </div>
                    <h3 className="mb-2 text-xl font-bold">{feature.title}</h3>
                    <p className="text-muted-foreground">
                      {feature.description}
                    </p>
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
            {t('landing.success_metrics.title')}
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
                <Card className="h-full overflow-hidden">
                  <div className="bg-primary/5 group-hover:bg-primary/10 flex h-full flex-col items-center justify-center p-6 text-center transition-all duration-300">
                    <span className="text-primary mb-2 text-5xl font-bold">
                      {metric.value}
                    </span>
                    <span className="text-muted-foreground text-sm">
                      {metric.label}
                    </span>
                  </div>
                </Card>
              </motion.div>
            )
          )}
        </div>
      </motion.section>

      {/* Transformation Section */}
      <motion.section
        variants={itemVariants}
        className="mx-auto mt-24 max-w-6xl px-4"
      >
        <div className="mb-16 text-center">
          <span className="bg-primary/10 text-primary mb-4 inline-block rounded-full px-4 py-1.5 text-sm font-medium">
            {t('landing.transformation.title')}
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
                <Card className="h-full overflow-hidden">
                  <div className="bg-primary/5 group-hover:bg-primary/10 flex h-full flex-col p-6 transition-all duration-300">
                    <div className="bg-foreground text-background mb-4 flex h-12 w-12 items-center justify-center rounded-full shadow-lg">
                      <span className="text-xl font-bold">{index + 1}</span>
                    </div>
                    <h3 className="mb-2 text-xl font-bold">{step.title}</h3>
                    <p className="text-muted-foreground">{step.description}</p>
                    <div className="from-primary/20 to-primary/5 mt-auto h-1 bg-gradient-to-r opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
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
        className="mx-auto mt-24 w-full py-24"
        onMouseEnter={handleCtaHover}
      >
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="mb-4 text-4xl font-bold">{t('landing.cta.title')}</h2>
          <p className="text-muted-foreground mb-8 text-lg">
            {t('landing.cta.subtitle')}
          </p>
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Link
              href="/login"
              className="bg-foreground hover:bg-foreground/90 text-background inline-flex items-center gap-2 rounded-lg px-8 py-3 font-medium transition-all duration-300"
            >
              {t('landing.cta.primary_button')}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/contact"
              className="bg-primary/10 hover:bg-primary/20 inline-flex items-center gap-2 rounded-lg px-8 py-3 font-medium transition-all duration-300"
            >
              {t('landing.cta.secondary_button')}
              <Plus className="h-4 w-4" />
            </Link>
          </div>
          <p className="text-muted-foreground mt-4 flex items-center justify-center gap-2 text-sm">
            <Timer className="h-4 w-4" />
            {t('landing.cta.no_card_required')}
          </p>
        </div>
      </motion.section>

      {/* Add animated cursor effect */}
      <div className="pointer-events-none fixed inset-0 z-50">
        <motion.div
          className="bg-primary/20 h-4 w-4 rounded-full blur-sm"
          animate={{
            x: mouseX.get(),
            y: mouseY.get(),
            scale: [1, 1.2, 1],
          }}
          transition={{
            type: 'spring',
            damping: 10,
            stiffness: 100,
            mass: 0.1,
          }}
        />
      </div>
    </div>
  );
}
