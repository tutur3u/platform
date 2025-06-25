'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import {
  BarChart3,
  Bell,
  Book,
  BookOpen,
  Brain,
  Calendar,
  Clock,
  FileText,
  GraduationCap,
  LineChart,
  MessageSquare,
  Monitor,
  Settings,
  Star,
  Users,
  Video,
} from '@tuturuuu/ui/icons';
import { motion, type Variants } from 'framer-motion';
import Link from 'next/link';
import GradientHeadline from '../../gradient-headline';

export default function EducationPage() {
  const features = [
    {
      title: 'Learning Management',
      description: 'Comprehensive course creation and delivery platform.',
      icon: <BookOpen className="h-6 w-6" />,
    },
    {
      title: 'Student Progress',
      description: 'Track and analyze student performance.',
      icon: <BarChart3 className="h-6 w-6" />,
    },
    {
      title: 'Virtual Classroom',
      description: 'Interactive online learning environment.',
      icon: <Monitor className="h-6 w-6" />,
    },
    {
      title: 'Assignment Management',
      description: 'Create, distribute, and grade assignments.',
      icon: <FileText className="h-6 w-6" />,
    },
    {
      title: 'Communication Tools',
      description: 'Seamless interaction between students and teachers.',
      icon: <MessageSquare className="h-6 w-6" />,
    },
    {
      title: 'Resource Library',
      description: 'Centralized repository for learning materials.',
      icon: <Book className="h-6 w-6" />,
    },
  ];

  const benefits = [
    {
      title: 'AI Learning',
      description: 'Personalized learning paths.',
      icon: <Brain className="h-6 w-6" />,
    },
    {
      title: 'Real-time Updates',
      description: 'Instant progress notifications.',
      icon: <Bell className="h-6 w-6" />,
    },
    {
      title: 'Time Management',
      description: 'Schedule optimization tools.',
      icon: <Clock className="h-6 w-6" />,
    },
    {
      title: 'Resource Planning',
      description: 'Efficient resource allocation.',
      icon: <Settings className="h-6 w-6" />,
    },
  ];

  const enhancedFaqs = [
    {
      question: 'How quickly can we implement the system?',
      answer:
        'Implementation typically takes 2-4 weeks, including setup, training, and data migration.',
    },
    {
      question: 'Can it integrate with existing school systems?',
      answer:
        'Yes, our platform integrates with most Student Information Systems (SIS) and other educational tools.',
    },
    {
      question: 'What kind of support do you provide?',
      answer:
        'We offer comprehensive support including technical assistance, training sessions, and dedicated account managers.',
    },
    {
      question: 'Is it suitable for different education levels?',
      answer:
        'Yes, our platform is customizable for K-12, higher education, and professional training programs.',
    },
    {
      question: 'How do you handle data privacy?',
      answer:
        'We comply with FERPA, GDPR, and other education data privacy regulations to ensure student data protection.',
    },
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.2 },
    },
  } satisfies Variants;

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { duration: 0.5 },
    },
  } satisfies Variants;

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="container mx-auto mt-8 flex max-w-6xl flex-col gap-6 px-3 py-16 lg:gap-14 lg:py-24"
    >
      {/* Hero Section */}
      <motion.div variants={itemVariants} className="mb-8 text-center">
        <Badge variant="secondary" className="mb-4">
          Education Management Solutions
        </Badge>
        <h1 className="mb-4 text-center text-2xl font-bold tracking-tight text-balance md:text-4xl lg:text-6xl">
          <GradientHeadline>
            Transform Your Educational Institution
          </GradientHeadline>
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
          Empower educators and students with our comprehensive education
          management platform.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Button size="lg" asChild>
            <Link href="/contact">Get Started</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/pricing">View Pricing</Link>
          </Button>
        </div>
      </motion.div>

      {/* Hero Image */}
      {/* <motion.div
        variants={itemVariants}
        whileHover={{ scale: 1.02 }}
        className="from-primary/10 to-primary/5 relative mx-auto mb-24 aspect-[1.67] w-full max-w-5xl overflow-hidden rounded-xl border bg-linear-to-br"
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <Image
            src={
              activeTheme === 'dark'
                ? '/media/marketing/education/education-dark.jpeg'
                : '/media/marketing/education/education-light.jpeg'
            }
            alt="Education Management Interface"
            width={2980}
            height={1786}
            className="object-cover"
          />
        </div>
      </motion.div> */}

      {/* Trust Indicators */}
      <section className="mb-24">
        <Card className="border-primary bg-primary/5 p-8">
          <div className="mx-auto flex max-w-4xl flex-col items-center gap-4 text-center">
            <GraduationCap className="h-12 w-12 text-primary" />
            <h2 className="text-2xl font-bold">
              Trusted by Leading Educational Institutions
            </h2>
            <p className="text-muted-foreground">
              Join thousands of schools and universities who have transformed
              their educational experience with our platform.
            </p>
          </div>
        </Card>
      </section>

      {/* Features Grid */}
      <motion.section variants={itemVariants} className="mb-24">
        <h2 className="mb-12 text-center text-3xl font-bold">
          Comprehensive Education Management
        </h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <motion.div
              key={feature.title}
              variants={itemVariants}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Card className="h-full p-6 transition-colors hover:border-primary">
                <div className="mb-4 flex items-center gap-3">
                  <div className="text-primary">{feature.icon}</div>
                  <h3 className="text-xl font-semibold">{feature.title}</h3>
                </div>
                <p className="text-muted-foreground">{feature.description}</p>
              </Card>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* Benefits Bento Grid */}
      <motion.section variants={itemVariants} className="mb-24">
        <h2 className="mb-12 text-center text-3xl font-bold">Key Benefits</h2>
        <div className="grid gap-4 md:grid-cols-4 md:grid-rows-2">
          <Card className="bg-primary/5 md:col-span-2 md:row-span-2">
            <div className="flex h-full flex-col p-6">
              <Users className="mb-4 h-8 w-8 text-primary" />
              <h3 className="mb-2 text-xl font-bold">
                Enhanced Learning Experience
              </h3>
              <p className="text-muted-foreground">
                Improve student engagement and outcomes with interactive
                learning tools and personalized instruction.
              </p>
              <div className="mt-4 grow rounded-lg bg-background/50 p-4">
                <div className="space-y-2">
                  <div className="h-2 w-3/4 rounded bg-primary/20" />
                  <div className="h-2 w-1/2 rounded bg-primary/20" />
                  <div className="h-2 w-2/3 rounded bg-primary/20" />
                </div>
              </div>
            </div>
          </Card>

          {benefits.map((benefit) => (
            <Card key={benefit.title} className="group overflow-hidden">
              <motion.div
                className="flex h-full flex-col p-6"
                whileHover={{ y: -5 }}
              >
                {benefit.icon}
                <h3 className="mb-2 font-bold">{benefit.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {benefit.description}
                </p>
                <div className="mt-4 h-1 w-0 bg-primary/10 transition-all group-hover:w-full" />
              </motion.div>
            </Card>
          ))}
        </div>
      </motion.section>

      {/* Core Features */}
      <motion.section variants={itemVariants} className="mb-24">
        <h2 className="mb-12 text-center text-3xl font-bold">Core Features</h2>
        <div className="grid gap-6 md:grid-cols-3">
          <Card className="p-6 text-center">
            <Video className="mx-auto mb-4 h-8 w-8 text-primary" />
            <h3 className="mb-2 font-bold">Video Learning</h3>
            <p className="text-sm text-muted-foreground">
              Interactive video lessons
            </p>
          </Card>
          <Card className="p-6 text-center">
            <LineChart className="mx-auto mb-4 h-8 w-8 text-primary" />
            <h3 className="mb-2 font-bold">Performance Analytics</h3>
            <p className="text-sm text-muted-foreground">
              Detailed progress tracking
            </p>
          </Card>
          <Card className="p-6 text-center">
            <Calendar className="mx-auto mb-4 h-8 w-8 text-primary" />
            <h3 className="mb-2 font-bold">Schedule Management</h3>
            <p className="text-sm text-muted-foreground">
              Automated timetabling
            </p>
          </Card>
        </div>
      </motion.section>

      {/* Success Story */}
      <motion.section variants={itemVariants} className="mb-24">
        <Card className="overflow-hidden">
          <div className="grid md:grid-cols-2">
            <div className="p-8">
              <Star className="mb-4 h-8 w-8 text-primary" />
              <h2 className="mb-4 text-2xl font-bold">Success Story</h2>
              <p className="mb-4 text-muted-foreground">
                "This platform has revolutionized how we deliver education.
                We've seen remarkable improvements in student engagement,
                performance, and overall learning outcomes."
              </p>
              <p className="font-semibold">- Dr. Michael Chen</p>
              <p className="text-sm text-muted-foreground">
                Dean of Academic Affairs, International University
              </p>
            </div>
            <div className="flex items-center justify-center bg-primary/5 p-8">
              <div className="grid gap-4 text-center">
                <div>
                  <div className="mb-2 text-3xl font-bold text-primary">
                    40%
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Improved Engagement
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-3xl font-bold text-primary">
                    50%
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Time Saved
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-3xl font-bold text-primary">
                    95%
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Student Satisfaction
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </motion.section>

      {/* FAQ Section */}
      <motion.section variants={itemVariants}>
        <h2 className="mb-12 text-center text-3xl font-bold">
          Frequently Asked Questions
        </h2>
        <div className="grid gap-6 md:grid-cols-2">
          <Accordion type="single" className="grid h-fit gap-4" collapsible>
            {enhancedFaqs
              .slice(0, Math.ceil(enhancedFaqs.length / 2))
              .map((faq, index) => (
                <AccordionItem key={index} value={`item-${index}`}>
                  <AccordionTrigger>{faq.question}</AccordionTrigger>
                  <AccordionContent>{faq.answer}</AccordionContent>
                </AccordionItem>
              ))}
          </Accordion>
          <Accordion type="single" className="grid h-fit gap-4" collapsible>
            {enhancedFaqs
              .slice(Math.ceil(enhancedFaqs.length / 2))
              .map((faq, index) => (
                <AccordionItem
                  key={index}
                  value={`item-${index + Math.ceil(enhancedFaqs.length / 2)}`}
                >
                  <AccordionTrigger>{faq.question}</AccordionTrigger>
                  <AccordionContent>{faq.answer}</AccordionContent>
                </AccordionItem>
              ))}
          </Accordion>
        </div>
      </motion.section>

      {/* CTA Section */}
      <motion.section variants={itemVariants} className="mt-24 text-center">
        <Card className="border-primary bg-primary/5 p-12">
          <h2 className="mb-4 text-3xl font-bold">
            Ready to Transform Your Educational Institution?
          </h2>
          <p className="mx-auto mb-8 max-w-2xl text-muted-foreground">
            Join leading educational institutions using our platform to enhance
            learning and drive student success.
          </p>
          <div className="flex justify-center gap-4">
            <Button size="lg" asChild>
              <Link href="/contact">Get Started</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/pricing">View Pricing</Link>
            </Button>
          </div>
        </Card>
      </motion.section>
    </motion.div>
  );
}
