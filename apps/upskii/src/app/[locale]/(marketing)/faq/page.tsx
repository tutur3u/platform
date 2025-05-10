'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { HelpCircle } from '@tuturuuu/ui/icons';
import { Separator } from '@tuturuuu/ui/separator';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import Link from 'next/link';

export default function FAQPage() {
  const t = useTranslations('boarding-pages.faq');
  // FAQ data organized by categories
  const faqCategories = [
    {
      name: t('categories.general'),
      questions: [
        {
          question: t('general.problem-1.question'),
          answer: t('general.problem-1.answer'),
        },
        {
          question: t('general.problem-2.question'),
          answer: t('general.problem-2.answer'),
        },
        {
          question: t('general.problem-3.question'),
          answer: t('general.problem-3.answer'),
        },
        {
          question: t('general.problem-4.question'),
          answer: t('general.problem-4.answer'),
        },
      ],
    },
    {
      name: t('categories.for-students'),
      questions: [
        {
          question: t('for-students.problem-1.question'),
          answer: t('for-students.problem-1.answer'),
        },
        {
          question: t('for-students.problem-2.question'),
          answer: t('for-students.problem-2.answer'),
        },
        {
          question: t('for-students.problem-3.question'),
          answer: t('for-students.problem-3.answer'),
        },
        {
          question: t('for-students.problem-4.question'),
          answer: t('for-students.problem-4.answer'),
        },
      ],
    },
    {
      name: t('categories.for-educators'),
      questions: [
        {
          question: t('for-educators.problem-1.question'),
          answer: t('for-educators.problem-1.answer'),
        },
        {
          question: t('for-educators.problem-2.question'),
          answer: t('for-educators.problem-2.answer'),
        },
        {
          question: t('for-educators.problem-3.question'),
          answer: t('for-educators.problem-3.answer'),
        },
        {
          question: t('for-educators.problem-4.question'),
          answer: t('for-educators.problem-4.answer'),
        },
      ],
    },
    {
      name: t('categories.technical'),
      questions: [
        {
          question: t('technical.problem-1.question'),
          answer: t('technical.problem-1.answer'),
        },
        {
          question: t('technical.problem-2.question'),
          answer: t('technical.problem-2.answer'),
        },
        {
          question: t('technical.problem-3.question'),
          answer: t('technical.problem-3.answer'),
        },
      ],
    },
  ];

  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:py-24">
      <div className="mb-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8 text-center"
        >
          <Badge variant="outline" className="mb-4">
            <HelpCircle className="mr-2 h-4 w-4" />
            {t('badge')}
          </Badge>
          <h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl">
            {t('title')}
          </h1>
          <p className="text-muted-foreground mx-auto max-w-2xl text-lg">
            {t('description')}
          </p>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="space-y-10"
      >
        {faqCategories.map((category, categoryIndex) => (
          <div key={categoryIndex}>
            <h2 className="text-2xl font-bold">{category.name}</h2>
            <Separator className="my-4" />
            <Accordion type="single" collapsible className="w-full">
              {category.questions.map((faq, faqIndex) => (
                <AccordionItem
                  key={faqIndex}
                  value={`item-${categoryIndex}-${faqIndex}`}
                >
                  <AccordionTrigger className="text-left">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="prose text-muted-foreground max-w-none">
                    <p>{faq.answer}</p>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        ))}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
        className="mt-16 text-center"
      >
        <h2 className="text-2xl font-bold">{t('still-have-questions')}</h2>
        <p className="text-muted-foreground mb-6 mt-2">
          {t('cant-find-answer')}
        </p>
        <Link href="/contact">
          <Button size="lg">{t('contact-support')}</Button>
        </Link>
      </motion.div>
    </div>
  );
}
