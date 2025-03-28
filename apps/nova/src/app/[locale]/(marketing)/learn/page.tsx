'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  ArrowRight,
  BookOpen,
  Clock,
  GraduationCap,
  Sparkles,
} from '@tuturuuu/ui/icons';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

export default function LearnPage() {
  const t = useTranslations('nova');

  const lessonContents = [
    {
      id: 'introduction',
      title: t('module-1'),
      description: t('module-1-description'),
      icon: <GraduationCap className="h-5 w-5" />,
      sections: [
        {
          title: t('what-is-prompt-engineering'),
          content: t('what-is-prompt-engineering-description'),
          duration: '10 min',
          isCompleted: false,
        },
        {
          title: t('why-is-prompt-engineering'),
          content: t('why-is-prompt-engineering-description'),
          duration: '15 min',
          isCompleted: false,
        },
      ],
    },
    {
      id: 'basic-techniques',
      title: t('module-2'),
      description: t('module-2-description'),
      icon: <BookOpen className="h-5 w-5" />,
      sections: [
        {
          title: t('zero-shot'),
          content: t('zero-shot-description'),
          duration: '20 min',
          isCompleted: false,
        },
        {
          title: t('chain-of-thought'),
          content: t('chain-of-thought-description'),
          duration: '25 min',
          isCompleted: false,
        },
      ],
    },
    {
      id: 'advanced-strategies',
      title: t('module-3'),
      description: t('module-3-description'),
      icon: <Sparkles className="h-5 w-5" />,
      sections: [
        {
          title: t('iterative-refinement'),
          content: t('iterative-refinement-description'),
          duration: '20 min',
          isCompleted: false,
        },
        {
          title: t('Meta-prompting'),
          content: t('Meta-prompting-description'),
          duration: '30 min',
          isCompleted: false,
        },
      ],
    },
    {
      id: 'best-practices',
      title: t('module-4'),
      description: t('module-4-description'),
      icon: <Sparkles className="h-5 w-5" />,
      sections: [
        {
          title: t('iterative-refinement'),
          content: t('iterative-refinement-description'),
          duration: '20 min',
          isCompleted: false,
        },
        {
          title: t('Meta-prompting'),
          content: t('Meta-prompting-description'),
          duration: '30 min',
          isCompleted: false,
        },
      ],
    },
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  return (
    <div className="container relative mx-auto space-y-16 p-6">
      <div className="from-background to-background/50 absolute inset-0 bg-gradient-to-b" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative space-y-4 text-center"
      >
        <Badge variant="outline" className="inline-flex">
          <GraduationCap className="mr-2 h-4 w-4" />
          Interactive Learning Path
        </Badge>
        <h1 className="text-4xl font-bold tracking-tight">
          {t('learning-subtitle')}
        </h1>
        <p className="text-muted-foreground mx-auto max-w-2xl">
          Follow our comprehensive curriculum to become an expert in crafting
          effective AI prompts
        </p>
      </motion.div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="relative grid gap-8"
      >
        {lessonContents.map((module, moduleIndex) => (
          <motion.div
            key={module.id}
            className="bg-card group relative rounded-xl border p-6 shadow-sm transition-shadow hover:shadow-md"
            whileHover={{ y: -2 }}
          >
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 text-primary rounded-lg p-2">
                  {module.icon}
                </div>
                <div>
                  <h2 className="text-2xl font-semibold">{module.title}</h2>
                  <p className="text-muted-foreground text-sm">
                    {module.description}
                  </p>
                </div>
              </div>
              <Badge variant="outline">
                Module {moduleIndex + 1}/{lessonContents.length}
              </Badge>
            </div>

            <div className="grid gap-4">
              {module.sections.map((section, index) => (
                <motion.div
                  key={index}
                  className="bg-card/50 hover:bg-card group relative overflow-hidden rounded-lg border p-4 transition-colors"
                  whileHover={{ scale: 1.01 }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <h3 className="font-medium">{section.title}</h3>
                      <p className="text-muted-foreground text-sm">
                        {section.content}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge variant="secondary">
                        <Clock className="mr-2 h-3 w-3" />
                        {section.duration}
                      </Badge>
                      <Link href={`/learn/${module.id}`}>
                        <Button size="sm" className="gap-2">
                          {t('start-button')}
                          <ArrowRight className="h-3 w-3" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}
