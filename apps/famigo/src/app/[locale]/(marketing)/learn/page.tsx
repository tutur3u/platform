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
      title: 'Overview of Language Models & LLMs (Large Language Models)',
      description: t('module-1-description'),
      icon: <GraduationCap className="h-5 w-5" />,
      sections: [
        {
          title: 'Introduction to Large Language Models',
          content: t('what-is-prompt-engineering-description'),
          duration: '5 mins',
          isCompleted: false,
        },
        {
          title: 'What is a Large Language Model (LLM)?',
          content: 'Explanation of LLMs, their scale, and parameters.',
          duration: '5 min',
          isCompleted: false,
        },
        {
          title: 'Key Technology: Transformers',
          content:
            'In-depth explanation of the Transformer architecture, including self-attention and its importance.',
          duration: '10 min',
          isCompleted: false,
        },
        {
          title: 'Use Cases for LLMs',
          content:
            'Exploration of practical applications such as text generation, translation, and summarization.',
          duration: '5 min',
          isCompleted: false,
        },
        {
          title: 'Challenges & Considerations',
          content:
            'Discussing the limitations of LLMs, including resources, biases, and costs.',
          duration: '5 min',
          isCompleted: false,
        },
        {
          title: 'Further Learning (Google’s Machine Learning Crash Course)',
          content: 'Overview of how to continue learning.',
          duration: '5 min',
          isCompleted: false,
        },
      ],
    },
    {
      id: 'basic-techniques',
      title: 'What is Prompt Engineering?',
      description: t('module-2-description'),
      icon: <BookOpen className="h-5 w-5" />,
      sections: [
        {
          title: 'What Is Prompt Engineering?',
          content:
            'Introduction to the concept of prompt engineering and its importance.',
          duration: '5 min',
          isCompleted: false,
        },
        {
          title: 'Why Is Prompt Engineering Important?',
          content:
            'Exploring the growing demand and the role of prompt engineers in AI development.',
          duration: '5 min',
          isCompleted: false,
        },
        {
          title: 'Elements of Prompt Engineering',
          content:
            'Detailing key components such as role, instruction/task, context, and examples.',
          duration: '10 min',
          isCompleted: false,
        },
        {
          title: 'Prompting Best Practices',
          content:
            'Discussing how to craft effective prompts with best practices.',
          duration: '10 min',
          isCompleted: false,
        },
        {
          title: 'Types of Prompts',
          content:
            'Explanation of direct prompting, role prompting, chain-of-thought prompting, and iterative techniques.',
          duration: '10 min',
          isCompleted: false,
        },
        {
          title: 'Prompt Iteration Strategies',
          content:
            'Practical advice on how to improve prompts through refinement, clarity, and format specification.',
          duration: '10 min',
          isCompleted: false,
        },
      ],
    },
    {
      id: 'advanced-strategies',
      title: 'Prompt Engineering for Generative AI',
      description: t('module-3-description'),
      icon: <Sparkles className="h-5 w-5" />,
      sections: [
        {
          title: 'Give ChatGPT a Persona',
          content:
            'Explanation on how to assign personas to guide the models responses.',
          duration: '5 min',
          isCompleted: false,
        },
        {
          title: 'Add Delimiters',
          content:
            'The use of delimiters for sectioning off parts of text that need special handling.',
          duration: '5 min',
          isCompleted: false,
        },
        {
          title: 'Provide Step-by-Step Instructions (Chain-of-Thought)',
          content: 'Explanation of how to break down tasks into smaller steps.',
          duration: '5 min',
          isCompleted: false,
        },
        {
          title: 'Provide Examples (One-shot, Few-shot, Multi-shot)',
          content:
            'Guidance on how to use examples to better train and guide the models understanding.',
          duration: '10 min',
          isCompleted: false,
        },
      ],
    },
    {
      id: 'best-practices',
      title: 'Ohter steps',
      description: t('module-4-description'),
      icon: <Sparkles className="h-5 w-5" />,
      sections: [
        {
          title: 'How to Craft Effective Prompts',
          content: 'The importance of clear, precise instructions.',
          duration: '15 min',
          isCompleted: false,
        },
        {
          title: 'General Best Practices',
          content: 'How to refine prompts based on model responses.',
          duration: '5 min',
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
