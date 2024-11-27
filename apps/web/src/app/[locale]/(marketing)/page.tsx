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
  FileText,
  Gift,
  HardDrive,
  Rocket,
  Users,
  Wand2,
  Workflow,
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
        className="from-background via-background to-dynamic-light-pink/10 relative min-h-[calc(100vh-4rem)] w-full bg-gradient-to-b"
      >
        {/* Animated Background Patterns */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="animate-aurora absolute inset-0 opacity-20" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_500px_at_50%_50%,rgba(var(--primary-rgb),0.15),transparent)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_800px_at_100%_100%,rgba(var(--primary-rgb),0.1),transparent)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_600px_at_0%_0%,rgba(var(--primary-rgb),0.1),transparent)]" />
          {/* <ScatteredIcons /> */}
        </div>

        {/* Main Content */}
        <div className="relative mx-auto flex max-w-6xl flex-col items-center justify-center px-4 py-48">
          {/* 3D Floating Logo */}
          <motion.div
            ref={logoRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => {
              mouseX.set(0);
              mouseY.set(0);
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
                className="relative transition-transform duration-200 group-hover:scale-110"
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
            <h1 className="text-foreground mx-auto mb-2 text-center text-2xl font-bold tracking-tight md:text-4xl lg:text-6xl">
              <GradientHeadline title={t('home.headline')} />
            </h1>
            <h2 className="text-foreground mb-8 max-w-3xl text-balance text-lg font-bold tracking-tight md:text-2xl lg:text-3xl">
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
            <span className="text-sm">Scroll to explore</span>
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
            >
              ↓
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
        className="w-full py-24"
      >
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="mb-12 text-center text-4xl font-bold">
            Platform Features
            <span className="ml-2 inline-block">
              <Wand2 className="text-primary h-8 w-8" />
            </span>
          </h2>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {/* Large feature card */}
            <Card className="row-span-2 md:col-span-2 lg:col-span-2">
              <div className="bg-primary/5 flex h-full flex-col p-8">
                {features?.[0]?.icon}
                <h3 className="mb-4 text-2xl font-bold">
                  {features?.[0]?.title}
                </h3>
                <p className="text-muted-foreground">
                  {features?.[0]?.subtitle}
                </p>
                {features?.[0]?.url && (
                  <Link
                    href={features[0].url}
                    className="text-primary mt-auto inline-flex items-center gap-2 pt-4 hover:underline"
                  >
                    Learn more
                    <Rocket className="h-4 w-4" />
                  </Link>
                )}
              </div>
            </Card>

            {/* Regular feature cards */}
            {features.slice(1).map((feature, i) => (
              <Card
                key={i}
                className="group relative overflow-hidden transition-all hover:-translate-y-1 hover:shadow-xl"
              >
                <div className="flex h-full flex-col p-6">
                  <div className="text-primary mb-4">{feature.icon}</div>
                  <h3 className="mb-2 text-xl font-bold">{feature.title}</h3>
                  <p className="text-muted-foreground text-sm">
                    {feature.subtitle}
                  </p>
                  {feature.url && (
                    <Link
                      href={feature.url}
                      className="text-primary mt-auto inline-flex items-center gap-2 pt-4 opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      Learn more
                      <Rocket className="h-4 w-4" />
                    </Link>
                  )}
                </div>
                <div className="from-primary/50 to-primary absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r opacity-0 transition-opacity group-hover:opacity-100" />
              </Card>
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
        className="bg-primary/5 w-full py-24"
      >
        <div className="mx-auto max-w-6xl px-4">
          <motion.h2
            variants={itemVariants}
            className="mb-12 text-center text-4xl font-bold"
          >
            Our Products
            <span className="animate-spin-slow ml-2 inline-block">
              <Gift className="text-primary h-8 w-8" />
            </span>
          </motion.h2>

          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {[
              {
                title: 'AI Assistant',
                description:
                  'Leverage AI to automate tasks and enhance productivity.',
                href: '/products/ai',
                icon: Brain,
                className: 'lg:col-span-full',
                badge: 'Coming Soon',
              },
              {
                title: 'Meet Together',
                description:
                  'Schedule meetings effortlessly across time zones and teams.',
                href: '/calendar/meet-together',
                icon: Users,
              },
              {
                title: 'Calendar',
                description:
                  'Comprehensive calendar and event management system.',
                href: '/products/calendar',
                icon: Calendar,
                badge: 'Coming Soon',
              },
              {
                title: 'CRM',
                description:
                  'Build and maintain valuable customer relationships.',
                href: '/products/crm',
                icon: Users,
                badge: 'Coming Soon',
              },
              {
                title: 'Documents',
                description:
                  'AI-powered document management and collaboration.',
                href: '/products/documents',
                icon: FileText,
                badge: 'Coming Soon',
              },
              {
                title: 'Drive',
                description: 'Secure cloud storage with seamless file sharing.',
                href: '/products/drive',
                icon: HardDrive,
                badge: 'Coming Soon',
              },
              {
                title: 'Finance',
                description:
                  'Track finances and manage transactions efficiently.',
                href: '/products/finance',
                icon: Banknote,
                badge: 'Coming Soon',
              },
              {
                title: 'Inventory',
                description:
                  'Streamline inventory control and stock management.',
                href: '/products/inventory',
                icon: Archive,
                badge: 'Coming Soon',
              },
              {
                title: 'Tasks',
                description: 'Organize and track projects with clarity.',
                href: '/products/tasks',
                icon: CircleCheck,
                badge: 'Coming Soon',
              },
              {
                title: 'Workflows',
                description: 'Automate and optimize your business processes.',
                href: '/products/workflows',
                icon: Workflow,
                badge: 'Coming Soon',
              },
            ].map((product) => (
              <motion.div
                key={product.title}
                variants={itemVariants}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={cn(
                  'text-primary group inline-block h-full',
                  product.className
                )}
              >
                <Link href={product.href}>
                  <Card className="h-full p-6">
                    <product.icon className="text-primary mb-4 h-8 w-8" />
                    <div className="flex items-center justify-between">
                      <h3 className="mb-4 text-xl font-bold">
                        {product.title}
                      </h3>
                      {product.badge && (
                        <Badge variant="secondary" className="ml-2">
                          {product.badge}
                        </Badge>
                      )}
                    </div>
                    <p className="text-muted-foreground">
                      {product.description}
                    </p>
                    <div className="mt-4 flex items-center gap-2 group-hover:underline">
                      Learn More
                      <Rocket className="h-4 w-4 transition-transform group-hover:translate-x-1" />
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
