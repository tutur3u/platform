'use client';

import {
  ArrowRight,
  BookText,
  Brain,
  Calendar,
  Code2,
  FileText,
  Globe,
  Laptop,
  Lightbulb,
  Mail,
  Rocket,
  Search,
  Sparkles,
  TrendingUp,
  Users,
  Zap,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { cn } from '@tuturuuu/utils/format';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { GITHUB_OWNER, GITHUB_REPO } from '@/constants/common';

const categories = [
  {
    name: 'AI & Technology',
    icon: Brain,
    description: 'Latest trends in artificial intelligence and emerging tech',
    color: 'purple',
  },
  {
    name: 'Engineering',
    icon: Code2,
    description: 'Software development practices and technical insights',
    color: 'blue',
  },
  {
    name: 'Productivity',
    icon: Zap,
    description: 'Tips and strategies to maximize your efficiency',
    color: 'yellow',
  },
  {
    name: 'Innovation',
    icon: Lightbulb,
    description: 'Breakthrough ideas and creative problem-solving',
    color: 'orange',
  },
  {
    name: 'Business',
    icon: Globe,
    description: 'Strategy, growth, and entrepreneurship insights',
    color: 'green',
  },
  {
    name: 'Development',
    icon: Laptop,
    description: 'Modern development tools and workflows',
    color: 'cyan',
  },
];

const upcomingTopics = [
  {
    title: 'Building Mira: Our Journey to Creating a JARVIS for Everyone',
    category: 'AI & Technology',
    icon: Brain,
    color: 'purple',
    readTime: '12 min read',
  },
  {
    title:
      'The Third Era of Technology: From Passive Tools to Proactive Partners',
    category: 'Innovation',
    icon: Lightbulb,
    color: 'orange',
    readTime: '8 min read',
  },
  {
    title: 'Open Source at Scale: Lessons from Building Tuturuuu',
    category: 'Engineering',
    icon: Code2,
    color: 'blue',
    readTime: '15 min read',
  },
  {
    title: 'Eliminating Digital Friction: A Product Design Philosophy',
    category: 'Productivity',
    icon: Zap,
    color: 'yellow',
    readTime: '10 min read',
  },
  {
    title: 'Building from Vietnam: Creating World-Class Technology Locally',
    category: 'Business',
    icon: Globe,
    color: 'green',
    readTime: '7 min read',
  },
  {
    title: 'Modern Monorepo Architecture: Our Tech Stack Explained',
    category: 'Development',
    icon: Laptop,
    color: 'cyan',
    readTime: '18 min read',
  },
];

export default function BlogPage() {
  const t = useTranslations();

  return (
    <main className="relative mx-auto w-full overflow-x-hidden text-balance">
      {/* Dynamic Floating Orbs */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.2, 0.3, 0.2],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="absolute top-0 -left-32 h-96 w-96 rounded-full bg-linear-to-br from-dynamic-purple/40 via-dynamic-pink/30 to-transparent blur-3xl sm:-left-64 sm:h-[40rem] sm:w-[40rem]"
        />
        <motion.div
          animate={{
            scale: [1, 1.15, 1],
            opacity: [0.15, 0.25, 0.15],
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="absolute top-[40%] -right-32 h-80 w-80 rounded-full bg-linear-to-br from-dynamic-blue/40 via-dynamic-cyan/30 to-transparent blur-3xl sm:-right-64 sm:h-[35rem] sm:w-[35rem]"
        />
        <motion.div
          animate={{
            scale: [1, 1.3, 1],
            opacity: [0.2, 0.3, 0.2],
          }}
          transition={{
            duration: 12,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="absolute -bottom-32 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-linear-to-br from-dynamic-green/30 via-dynamic-emerald/20 to-transparent blur-3xl sm:-bottom-64 sm:h-[45rem] sm:w-[45rem]"
        />
      </div>

      {/* Grid Pattern Overlay */}
      <div className="pointer-events-none fixed inset-0 -z-10 opacity-30">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(var(--primary-rgb),0.08)_1px,transparent_1px)] bg-[size:32px_32px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(var(--primary-rgb),0.04)_1px,transparent_1px)] bg-[size:120px]" />
      </div>

      {/* Hero Section */}
      <section className="relative px-4 pt-24 pb-16 sm:px-6 sm:pt-32 sm:pb-20 lg:px-8 lg:pt-40 lg:pb-24">
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="text-center"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1, duration: 0.5 }}
            >
              <Badge
                variant="secondary"
                className="mb-6 border-dynamic-purple/30 bg-dynamic-purple/10 text-dynamic-purple transition-all hover:scale-105 hover:bg-dynamic-purple/20 hover:shadow-dynamic-purple/20 hover:shadow-lg"
              >
                <BookText className="mr-1.5 h-3.5 w-3.5" />
                {t('common.blog')}
              </Badge>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.8 }}
              className="mb-6 text-balance font-bold text-4xl tracking-tight sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl"
            >
              Insights &{' '}
              <span className="animate-gradient bg-linear-to-r from-dynamic-purple via-dynamic-pink to-dynamic-orange bg-clip-text text-transparent">
                Innovation
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.8 }}
              className="mx-auto mb-8 max-w-3xl text-balance text-base text-foreground/70 leading-relaxed sm:text-lg md:text-xl lg:text-2xl"
            >
              Exploring the future of technology, productivity, and human
              potential. Deep dives into AI, engineering, and building products
              that matter.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.8 }}
              className="mb-12 flex flex-col flex-wrap items-center justify-center gap-3 sm:flex-row sm:gap-4"
            >
              <Button
                size="lg"
                className="group w-full shadow-lg transition-all hover:scale-105 hover:shadow-xl sm:w-auto"
                asChild
              >
                <Link href="#subscribe">
                  <Mail className="mr-2 h-5 w-5" />
                  Subscribe for Updates
                  <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="w-full transition-all hover:scale-105 sm:w-auto"
                asChild
              >
                <Link href="#upcoming">
                  <Calendar className="mr-2 h-5 w-5" />
                  View Upcoming Topics
                </Link>
              </Button>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Coming Soon Featured Section */}
      <section className="relative px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <Card className="overflow-hidden border-dynamic-purple/30 bg-linear-to-br from-dynamic-purple/10 via-dynamic-pink/5 to-background p-8 md:p-12">
              <div className="grid gap-8 lg:grid-cols-2">
                <div className="flex flex-col justify-center">
                  <Badge
                    variant="secondary"
                    className="mb-4 w-fit border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green"
                  >
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                    Coming Soon
                  </Badge>
                  <h2 className="mb-4 font-bold text-3xl sm:text-4xl">
                    Exciting Content on the Way
                  </h2>
                  <p className="mb-6 text-foreground/70 text-lg leading-relaxed">
                    We&apos;re crafting high-quality articles that dive deep
                    into technology, innovation, and the future of human-AI
                    collaboration. Be the first to know when we publish.
                  </p>
                  <div className="flex items-center gap-2 text-foreground/60 text-sm">
                    <Calendar className="h-4 w-4 text-dynamic-blue" />
                    <span>Expected launch: Q2 2025</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Card className="border-dynamic-purple/30 bg-dynamic-purple/5 p-4 text-center">
                    <Rocket className="mx-auto mb-2 h-8 w-8 text-dynamic-purple" />
                    <div className="font-bold text-2xl text-dynamic-purple">
                      6+
                    </div>
                    <div className="text-foreground/60 text-xs">
                      Topics Ready
                    </div>
                  </Card>
                  <Card className="border-dynamic-blue/30 bg-dynamic-blue/5 p-4 text-center">
                    <Users className="mx-auto mb-2 h-8 w-8 text-dynamic-blue" />
                    <div className="font-bold text-2xl text-dynamic-blue">
                      Expert
                    </div>
                    <div className="text-foreground/60 text-xs">Authors</div>
                  </Card>
                  <Card className="border-dynamic-green/30 bg-dynamic-green/5 p-4 text-center">
                    <TrendingUp className="mx-auto mb-2 h-8 w-8 text-dynamic-green" />
                    <div className="font-bold text-2xl text-dynamic-green">
                      Weekly
                    </div>
                    <div className="text-foreground/60 text-xs">Publishing</div>
                  </Card>
                  <Card className="border-dynamic-orange/30 bg-dynamic-orange/5 p-4 text-center">
                    <FileText className="mx-auto mb-2 h-8 w-8 text-dynamic-orange" />
                    <div className="font-bold text-2xl text-dynamic-orange">
                      Deep
                    </div>
                    <div className="text-foreground/60 text-xs">Dives</div>
                  </Card>
                </div>
              </div>
            </Card>
          </motion.div>
        </div>
      </section>

      {/* Content Categories */}
      <section className="relative px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-16 text-center"
          >
            <h2 className="mb-4 font-bold text-4xl sm:text-5xl">
              What We&apos;ll{' '}
              <span className="bg-linear-to-r from-dynamic-cyan via-dynamic-blue to-dynamic-purple bg-clip-text text-transparent">
                Cover
              </span>
            </h2>
            <p className="mx-auto max-w-2xl text-foreground/60 text-lg">
              Deep, thoughtful content across the technologies and ideas that
              shape our future
            </p>
          </motion.div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((category, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <Card
                  className={cn(
                    'group h-full p-6 transition-all hover:shadow-lg',
                    `border-dynamic-${category.color}/30 bg-linear-to-br from-dynamic-${category.color}/5 via-background to-background hover:border-dynamic-${category.color}/50 hover:shadow-dynamic-${category.color}/10`
                  )}
                >
                  <div
                    className={cn(
                      'mb-4 flex h-12 w-12 items-center justify-center rounded-xl transition-transform group-hover:rotate-12 group-hover:scale-110',
                      `bg-dynamic-${category.color}/10`
                    )}
                  >
                    <category.icon
                      className={cn(
                        'h-6 w-6',
                        `text-dynamic-${category.color}`
                      )}
                    />
                  </div>
                  <h3 className="mb-2 font-semibold text-lg">
                    {category.name}
                  </h3>
                  <p className="text-foreground/60 text-sm leading-relaxed">
                    {category.description}
                  </p>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Upcoming Articles */}
      <section
        id="upcoming"
        className="relative scroll-mt-20 px-4 py-24 sm:px-6 lg:px-8"
      >
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-16 text-center"
          >
            <h2 className="mb-4 font-bold text-4xl sm:text-5xl">
              Upcoming{' '}
              <span className="bg-linear-to-r from-dynamic-green via-dynamic-cyan to-dynamic-blue bg-clip-text text-transparent">
                Articles
              </span>
            </h2>
            <p className="mx-auto max-w-2xl text-foreground/60 text-lg">
              A preview of the in-depth stories and insights we&apos;re
              preparing
            </p>
          </motion.div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {upcomingTopics.map((topic, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <Card
                  className={cn(
                    'group h-full p-6 transition-all hover:shadow-lg',
                    `border-dynamic-${topic.color}/30 bg-linear-to-br from-dynamic-${topic.color}/5 via-background to-background hover:border-dynamic-${topic.color}/50 hover:shadow-dynamic-${topic.color}/10`
                  )}
                >
                  <div
                    className={cn(
                      'mb-4 flex h-12 w-12 items-center justify-center rounded-xl transition-transform group-hover:scale-110',
                      `bg-dynamic-${topic.color}/10`
                    )}
                  >
                    <topic.icon
                      className={cn('h-6 w-6', `text-dynamic-${topic.color}`)}
                    />
                  </div>
                  <Badge
                    variant="secondary"
                    className={cn(
                      'mb-3',
                      `border-dynamic-${topic.color}/30 bg-dynamic-${topic.color}/10 text-dynamic-${topic.color}`
                    )}
                  >
                    {topic.category}
                  </Badge>
                  <h3 className="mb-3 font-bold text-lg leading-tight">
                    {topic.title}
                  </h3>
                  <div className="flex items-center gap-2 text-foreground/50 text-sm">
                    <Search className="h-3.5 w-3.5" />
                    {topic.readTime}
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Newsletter Section */}
      <section
        id="subscribe"
        className="relative scroll-mt-20 px-4 py-24 sm:px-6 lg:px-8"
      >
        <div className="mx-auto max-w-5xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <Card className="relative overflow-hidden border-dynamic-purple/30 bg-linear-to-br from-dynamic-purple/10 via-dynamic-pink/5 to-background p-12">
              {/* Decorative Elements */}
              <div className="absolute inset-0 overflow-hidden opacity-10">
                <div className="absolute top-10 left-10 h-40 w-40 rounded-full bg-dynamic-purple blur-3xl" />
                <div className="absolute right-20 bottom-20 h-40 w-40 rounded-full bg-dynamic-pink blur-3xl" />
              </div>

              <div className="relative text-center">
                <Sparkles className="mx-auto mb-6 h-16 w-16 text-dynamic-purple" />
                <h2 className="mb-4 font-bold text-4xl sm:text-5xl">
                  Stay in the Loop
                </h2>
                <p className="mx-auto mb-8 max-w-2xl text-foreground/70 text-lg leading-relaxed">
                  Be the first to know when we launch our blog. Get exclusive
                  insights, updates, and behind-the-scenes stories delivered
                  directly to your inbox.
                </p>

                <div className="mx-auto max-w-md">
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row">
                    <input
                      type="email"
                      placeholder="Enter your email"
                      className="flex-1 rounded-lg border border-border bg-background px-4 py-3 outline-hidden placeholder:text-foreground/40 focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                    <Button size="lg" className="sm:w-auto">
                      Notify Me
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-foreground/50 text-sm">
                    We respect your privacy. Unsubscribe at any time.
                  </p>
                </div>

                <div className="mt-12 flex flex-wrap items-center justify-center gap-8">
                  <Link
                    href="/contact"
                    className="flex items-center gap-2 text-foreground/60 text-sm transition-colors hover:text-foreground"
                  >
                    <BookText className="h-4 w-4" />
                    <span>Submit a guest post</span>
                  </Link>

                  <Link
                    href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-foreground/60 text-sm transition-colors hover:text-foreground"
                  >
                    <Globe className="h-4 w-4" />
                    <span>Follow our journey</span>
                  </Link>
                </div>
              </div>
            </Card>
          </motion.div>
        </div>
      </section>
    </main>
  );
}
