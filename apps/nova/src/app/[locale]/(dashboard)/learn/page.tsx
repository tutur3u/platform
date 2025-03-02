'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  BookOpen,
  Clock,
  GraduationCap,
  Sparkles,
} from 'lucide-react';

const lessonContents = [
  {
    id: 'introduction',
    title: 'Introduction to Prompt Engineering',
    description:
      'Learn the fundamentals and key concepts of prompt engineering',
    icon: <GraduationCap className="h-5 w-5" />,
    sections: [
      {
        title: 'What is Prompt Engineering?',
        content:
          'Prompt engineering is the practice of designing and refining input prompts for AI language models to generate desired outputs. It involves crafting clear, specific, and effective instructions that guide the AI in producing accurate and relevant responses.',
        duration: '10 min',
        isCompleted: false,
      },
      {
        title: 'Why is Prompt Engineering Important?',
        content:
          'Prompt engineering is crucial because it directly impacts the quality and usefulness of AI-generated content. Well-crafted prompts can significantly improve the accuracy, relevance, and coherence of AI outputs.',
        duration: '15 min',
        isCompleted: false,
      },
    ],
  },
  {
    id: 'basic-techniques',
    title: 'Basic Techniques in Prompt Engineering',
    description: 'Master fundamental strategies for effective prompting',
    icon: <BookOpen className="h-5 w-5" />,
    sections: [
      {
        title: 'Zero-shot & Few-shot Prompting',
        content:
          'Learn the differences between zero-shot and few-shot prompting, and when to use each approach effectively.',
        duration: '20 min',
        isCompleted: false,
      },
      {
        title: 'Chain-of-Thought Prompting',
        content:
          'Master the technique of breaking down complex problems into logical steps for better AI responses.',
        duration: '25 min',
        isCompleted: false,
      },
    ],
  },
  {
    id: 'advanced-strategies',
    title: 'Advanced Strategies',
    description: 'Explore advanced techniques for complex prompt engineering',
    icon: <Sparkles className="h-5 w-5" />,
    sections: [
      {
        title: 'Iterative Refinement',
        content:
          'Learn how to iteratively improve prompts based on AI outputs for optimal results.',
        duration: '20 min',
        isCompleted: false,
      },
      {
        title: 'Meta-prompting',
        content:
          'Discover advanced techniques for using prompts to generate other prompts automatically.',
        duration: '30 min',
        isCompleted: false,
      },
    ],
  },
];

export default function LearnPage() {
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
          Master the Art of Prompt Engineering
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
                      <Button size="sm" className="gap-2">
                        Start
                        <ArrowRight className="h-3 w-3" />
                      </Button>
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
