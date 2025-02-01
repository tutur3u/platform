'use client';

import { Badge } from '@repo/ui/components/ui/badge';
import { Card } from '@repo/ui/components/ui/card';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  BookText,
  Brain,
  Code2,
  Globe,
  Laptop,
  Lightbulb,
  Rocket,
  Sparkles,
  Timer,
  Zap,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

const categories = [
  { name: 'AI & Technology', icon: <Brain className="h-4 w-4" /> },
  { name: 'Engineering', icon: <Code2 className="h-4 w-4" /> },
  { name: 'Productivity', icon: <Zap className="h-4 w-4" /> },
  { name: 'Innovation', icon: <Lightbulb className="h-4 w-4" /> },
  { name: 'Business', icon: <Globe className="h-4 w-4" /> },
  { name: 'Development', icon: <Laptop className="h-4 w-4" /> },
];

export default function BlogPage() {
  const t = useTranslations();

  return (
    <main className="relative container space-y-24 py-24">
      {/* Hero Section */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center"
      >
        <Badge variant="secondary" className="mb-6">
          {t('common.blog')}
        </Badge>
        <h1 className="mb-6 text-5xl font-bold text-balance text-foreground">
          Insights & Innovation
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-foreground/80">
          Our blog is coming soon! We&apos;re preparing insightful articles
          about technology, innovation, and business transformation.
        </p>
      </motion.section>

      {/* Coming Soon Section */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="mx-auto max-w-3xl text-center"
      >
        <Card className="relative overflow-hidden bg-foreground/5 p-12">
          {/* Animated Background */}
          <div className="absolute inset-0 overflow-hidden">
            <div className="animate-aurora absolute inset-0 opacity-20" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_500px_at_50%_50%,rgba(var(--primary-rgb),0.15),transparent)]" />
          </div>

          {/* Content */}
          <div className="relative">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="mb-8 flex justify-center"
            >
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Rocket className="h-12 w-12" />
              </div>
            </motion.div>

            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              <h2 className="mb-4 text-3xl font-bold">
                Exciting Content Coming Soon!
              </h2>
              <p className="mx-auto mb-8 max-w-xl text-lg text-foreground/60">
                We&apos;re crafting high-quality articles covering:
              </p>

              {/* Categories Preview */}
              <div className="mb-8 grid gap-4 text-center md:grid-cols-2 lg:grid-cols-3">
                {categories.map((category, index) => (
                  <motion.div
                    key={index}
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.6 + index * 0.1 }}
                    className="flex items-center justify-center gap-2 rounded-lg bg-foreground/10 p-3"
                  >
                    <div className="text-primary">{category.icon}</div>
                    <span className="text-sm font-medium">{category.name}</span>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* Newsletter Section */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="mx-auto max-w-md"
            >
              <div className="mb-6 flex items-center justify-center gap-2 text-lg font-medium">
                <Sparkles className="h-5 w-5 text-primary" />
                <span>Be the first to know when we launch!</span>
              </div>

              <div className="flex gap-4">
                <input
                  type="email"
                  placeholder="Enter your email"
                  className="flex-1 rounded-lg bg-foreground/10 px-4 py-2 outline-hidden placeholder:text-foreground/40"
                />
                <button className="flex items-center gap-2 rounded-lg bg-foreground px-6 py-2 font-medium text-background transition-colors hover:bg-foreground/90">
                  Notify Me
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>

              <p className="mt-4 flex items-center justify-center gap-2 text-sm text-foreground/40">
                <Timer className="h-4 w-4" />
                <span>Expected launch: Q2 2024</span>
              </p>
            </motion.div>

            {/* Social Proof */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 1 }}
              className="mt-12 flex flex-wrap items-center justify-center gap-8"
            >
              <Link
                href="/contact"
                className="flex items-center gap-2 text-sm text-foreground/60 transition-colors hover:text-foreground"
              >
                <BookText className="h-4 w-4" />
                <span>Submit a guest post</span>
              </Link>

              <Link
                href="https://github.com/tutur3u"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-foreground/60 transition-colors hover:text-foreground"
              >
                <Globe className="h-4 w-4" />
                <span>Follow our journey</span>
              </Link>
            </motion.div>
          </div>
        </Card>
      </motion.section>
    </main>
  );
}
