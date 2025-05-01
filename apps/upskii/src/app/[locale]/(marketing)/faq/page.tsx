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
import Link from 'next/link';

export default function FAQPage() {
  // FAQ data organized by categories
  const faqCategories = [
    {
      name: 'General',
      questions: [
        {
          question: 'What is this educational platform?',
          answer:
            'Our platform is a comprehensive educational ecosystem designed for both teachers and students. It provides tools for course creation, interactive learning, live classes, AI-powered features, and certification.',
        },
        {
          question: 'How do I create an account?',
          answer:
            "You can sign up using your email address or Google account. After verification, you'll be able to customize your profile and access all platform features.",
        },
        {
          question: 'Is the platform available in multiple languages?',
          answer:
            'Yes, our platform fully supports both English and Vietnamese languages. You can easily switch between languages from your account settings or the language toggle in the navigation menu.',
        },
        {
          question: 'Is the platform free to use?',
          answer:
            'We offer both free and premium courses. Teachers can set their own pricing for courses, and we also provide free educational resources and tools for all users.',
        },
      ],
    },
    {
      name: 'For Students',
      questions: [
        {
          question: 'How do I enroll in a course?',
          answer:
            'Browse our course catalog, select a course you\'re interested in, and click the "Enroll" button. For paid courses, you\'ll be prompted to complete the payment process before gaining access.',
        },
        {
          question: 'Can I access course materials offline?',
          answer:
            "Some course materials like PDFs can be downloaded for offline use. Video content requires an internet connection to stream, but we're working on offline viewing options for the future.",
        },
        {
          question: 'How do I receive a certificate after completing a course?',
          answer:
            'Certificates are automatically issued when you complete all required course materials and pass any assessments with the minimum required score. You can download and share your certificates from your profile page.',
        },
        {
          question: 'What if I need help with course content?',
          answer:
            'Each course has a discussion section where you can ask questions. You can also contact the instructor directly, or use our AI-powered learning assistant for immediate feedback and clarification.',
        },
      ],
    },
    {
      name: 'For Educators',
      questions: [
        {
          question: 'How do I become a verified teacher?',
          answer:
            'To become a verified teacher, go to your profile settings and select "Apply to Teach". You\'ll need to provide identification and credentials for verification. Once approved, you can create and publish courses.',
        },
        {
          question: 'What tools are available for creating courses?',
          answer:
            'Our platform provides a comprehensive course builder with options to upload videos, documents, create quizzes, assignments, and interactive content. You can also use our AI tools to help generate educational content and assessments.',
        },
        {
          question: 'How are payments processed for paid courses?',
          answer:
            'We handle all payment processing and distribute revenue to teachers according to our revenue-sharing model. Payments are processed securely, and earnings can be withdrawn through various payment methods.',
        },
        {
          question: 'Can I host live classes?',
          answer:
            'Yes, our platform includes integrated video conferencing features for hosting live classes, webinars, and one-on-one sessions with students. You can schedule events, record sessions, and share screens during live classes.',
        },
      ],
    },
    {
      name: 'Technical',
      questions: [
        {
          question: 'What devices and browsers are supported?',
          answer:
            'Our platform works on all modern browsers (Chrome, Firefox, Safari, Edge) and is responsive for mobile devices, tablets, and desktop computers. We recommend using the latest version of your preferred browser for the best experience.',
        },
        {
          question: 'How secure is my data on the platform?',
          answer:
            'We take data security seriously and employ industry-standard encryption and security practices. Personal information is protected, and we comply with international data protection regulations.',
        },
        {
          question: 'What should I do if I encounter technical issues?',
          answer:
            'For technical support, visit our Help Center or contact our support team through the "Contact" page. Include details about the issue, including any error messages, your device, and browser information.',
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
            Support
          </Badge>
          <h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl">
            Frequently Asked Questions
          </h1>
          <p className="text-muted-foreground mx-auto max-w-2xl text-lg">
            Find answers to the most common questions about our educational
            platform.
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
        <h2 className="text-2xl font-bold">Still have questions?</h2>
        <p className="text-muted-foreground mb-6 mt-2">
          If you couldn't find the answer to your question, please contact our
          support team.
        </p>
        <Link href="/contact">
          <Button size="lg">Contact Support</Button>
        </Link>
      </motion.div>
    </div>
  );
}
