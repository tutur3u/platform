'use client';

import { getFeatures } from './features';
import GetStartedButton from './get-started-button';
import GradientHeadline from './gradient-headline';
import { cn } from '@/lib/utils';
import { Badge } from '@repo/ui/components/ui/badge';
import { Card } from '@repo/ui/components/ui/card';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import {
  Archive,
  Banknote,
  Brain,
  Calendar,
  CircleCheck,
  Container,
  FileText,
  HardDrive,
  Rocket,
  Users,
  Workflow,
  Zap,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import Link from 'next/link';
import { useRef, useState } from 'react';

export default function MarketingPage() {
  const t = useTranslations();
  const features = getFeatures(t);

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

  return (
    <div
      className="relative flex w-full flex-col items-center"
      suppressHydrationWarning
    >
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
              <GradientHeadline title={t('home.headline')} />
            </h1>
            <h2 className="text-foreground mb-12 max-w-3xl text-balance text-lg font-bold tracking-tight md:text-2xl lg:text-3xl">
              {t('home.subheadline')}
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
      >
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(var(--primary-rgb),0.03)_1px,transparent_1px)] bg-[size:20px_20px]" />
        </div>

        <div className="relative mx-auto max-w-6xl px-4">
          <motion.div variants={itemVariants} className="mb-16 text-center">
            <span className="bg-primary/10 text-primary mb-4 inline-block rounded-full px-4 py-1.5 text-sm font-medium">
              Features
            </span>
            <h2 className="group mb-4 text-center text-4xl font-bold">
              {t('common.features')}
              <span className="ml-2 inline-block">
                <Zap className="text-primary h-8 w-8 transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110" />
              </span>
            </h2>
            <p className="text-muted-foreground mx-auto max-w-2xl">
              Discover powerful features designed to enhance your productivity
              and streamline your workflow.
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
                      {features?.[0]?.icon}
                    </div>
                    <h3 className="mb-4 text-2xl font-bold">
                      {features?.[0]?.title}
                    </h3>
                    <p className="text-muted-foreground text-lg">
                      {features?.[0]?.subtitle}
                    </p>
                    {features?.[0]?.url && (
                      <Link
                        href={features[0].url}
                        className="text-primary mt-8 inline-flex items-center gap-2 font-medium group-hover:underline"
                      >
                        {t('common.learn_more')}
                        <Rocket className="h-4 w-4 transition-transform duration-300 group-hover:-translate-y-1 group-hover:translate-x-1" />
                      </Link>
                    )}
                  </div>
                </div>
              </Card>
            </motion.div>

            {/* Regular feature cards */}
            {features.slice(1).map((feature, i) => (
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
                      {feature.subtitle}
                    </p>
                    {feature.url && (
                      <Link
                        href={feature.url}
                        className="text-primary mt-auto inline-flex items-center gap-2 pt-4 opacity-0 transition-all duration-300 group-hover:opacity-100"
                      >
                        {t('common.learn_more')}
                        <Rocket className="h-4 w-4 transition-transform duration-300 group-hover:-translate-y-1 group-hover:translate-x-1" />
                      </Link>
                    )}
                  </div>
                  <div className="from-primary/50 to-primary absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* Interactive Product Showcase */}
      <motion.section
        initial="hidden"
        whileInView="show"
        viewport={{ once: true }}
        variants={containerVariants}
        className="bg-primary/5 relative w-full overflow-hidden py-24"
      >
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(var(--primary-rgb),0.03)_1px,transparent_1px)] bg-[size:100px]" />
          <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(var(--primary-rgb),0.03)_1px,transparent_1px)] bg-[size:100px]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(var(--primary-rgb),0.05)_1px,transparent_1px)] bg-[size:20px_20px]" />
        </div>

        <div className="relative mx-auto max-w-6xl px-4">
          <motion.div variants={itemVariants} className="mb-16 text-center">
            <span className="bg-primary/10 text-primary mb-4 inline-block rounded-full px-4 py-1.5 text-sm font-medium">
              Products
            </span>
            <motion.h2
              variants={itemVariants}
              className="group mb-4 text-center text-4xl font-bold"
            >
              {t('common.products')}
              <span className="animate-spin-slow ml-2 inline-block transition-transform duration-300 group-hover:scale-110">
                <Container className="text-primary h-8 w-8" />
              </span>
            </motion.h2>
            <p className="text-muted-foreground mx-auto max-w-2xl">
              Explore our suite of powerful products designed to help you work
              smarter, not harder.
            </p>
          </motion.div>

          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {[
              {
                title: t('common.ai-assistant'),
                description: t('common.ai-assistant-description'),
                href: '/products/ai',
                icon: Brain,
                className: 'lg:col-span-full',
                badge: t('common.coming_soon'),
                highlight: true,
              },
              {
                title: t('common.meet-together'),
                description: t('common.meet-together-description'),
                href: '/meet-together',
                icon: Users,
              },
              {
                title: t('common.calendar'),
                description: t('common.calendar-description'),
                href: '/products/calendar',
                icon: Calendar,
                badge: t('common.coming_soon'),
              },
              {
                title: t('common.crm'),
                description: t('common.crm-description'),
                href: '/products/crm',
                icon: Users,
                badge: t('common.coming_soon'),
              },
              {
                title: t('common.documents'),
                description: t('common.documents-description'),
                href: '/products/documents',
                icon: FileText,
                badge: t('common.coming_soon'),
              },
              {
                title: t('common.drive'),
                description: t('common.drive-description'),
                href: '/products/drive',
                icon: HardDrive,
                badge: t('common.coming_soon'),
              },
              {
                title: t('common.finance'),
                description: t('common.finance-description'),
                href: '/products/finance',
                icon: Banknote,
                badge: t('common.coming_soon'),
              },
              {
                title: t('common.inventory'),
                description: t('common.inventory-description'),
                href: '/products/inventory',
                icon: Archive,
                badge: t('common.coming_soon'),
              },
              {
                title: t('common.tasks'),
                description: t('common.tasks-description'),
                href: '/products/tasks',
                icon: CircleCheck,
                badge: t('common.coming_soon'),
              },
              {
                title: t('common.workflows'),
                description: t('common.workflows-description'),
                href: '/products/workflows',
                icon: Workflow,
                badge: t('common.coming_soon'),
              },
            ].map((product) => (
              <motion.div
                key={product.title}
                variants={cardVariants}
                whileHover="hover"
                className={cn(
                  'text-primary group inline-block h-full',
                  product.className
                )}
              >
                <Link href={product.href}>
                  <Card className="hover:shadow-primary/5 relative h-full overflow-hidden p-6 transition-all duration-300 hover:shadow-xl">
                    {product.highlight && (
                      <div className="from-primary/10 absolute inset-0 bg-gradient-to-br via-transparent to-transparent opacity-50" />
                    )}
                    <div className="relative">
                      <div className="absolute -inset-4 rounded-xl opacity-0 blur-xl transition-all duration-300 group-hover:opacity-100" />
                      <div className="bg-primary/10 mb-6 inline-flex rounded-full p-3">
                        <product.icon className="text-primary h-8 w-8 transition-transform duration-300 group-hover:rotate-3 group-hover:scale-110" />
                      </div>
                      <div className="flex items-center justify-between">
                        <h3 className="mb-4 text-xl font-bold">
                          {product.title}
                        </h3>
                        {product.badge && (
                          <Badge
                            variant="secondary"
                            className="ml-2 animate-pulse"
                          >
                            {product.badge}
                          </Badge>
                        )}
                      </div>
                      <p className="text-muted-foreground">
                        {product.description}
                      </p>
                      <div className="mt-4 flex items-center gap-2 font-medium group-hover:underline">
                        {t('common.learn_more')}
                        <Rocket className="h-4 w-4 transition-transform duration-300 group-hover:-translate-y-1 group-hover:translate-x-1" />
                      </div>
                    </div>
                  </Card>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.section>
    </div>
  );
}
