'use client';

import {
  BarChart3,
  Building2,
  Calendar,
  ClipboardList,
  Clock,
  FileText,
  Hammer,
  HardHat,
  LineChart,
  MessageSquare,
  Settings,
  Shield,
  Star,
  Truck,
  Users,
  Wrench,
} from '@tuturuuu/icons/lucide';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { motion, type Variants } from 'framer-motion';
import {
  SolutionBadge,
  SolutionCard,
  SolutionGradientHeadline,
  SolutionLinkButton,
} from '../solution-page-primitives';

export default function ConstructionPage() {
  const features = [
    {
      title: 'Project Management',
      description: 'Comprehensive project planning and execution tools.',
      icon: <Building2 className="h-6 w-6" />,
    },
    {
      title: 'Resource Planning',
      description: 'Efficient allocation of equipment and personnel.',
      icon: <Wrench className="h-6 w-6" />,
    },
    {
      title: 'Safety Compliance',
      description: 'Ensure workplace safety and regulatory compliance.',
      icon: <Shield className="h-6 w-6" />,
    },
    {
      title: 'Document Management',
      description: 'Centralized storage for plans and permits.',
      icon: <FileText className="h-6 w-6" />,
    },
    {
      title: 'Progress Tracking',
      description: 'Real-time monitoring of construction progress.',
      icon: <BarChart3 className="h-6 w-6" />,
    },
    {
      title: 'Equipment Management',
      description: 'Track and maintain construction equipment.',
      icon: <Truck className="h-6 w-6" />,
    },
  ];

  const benefits = [
    {
      title: 'Task Management',
      description: 'Streamlined workflow organization.',
      icon: <ClipboardList className="h-6 w-6" />,
    },
    {
      title: 'Team Communication',
      description: 'Real-time site coordination.',
      icon: <MessageSquare className="h-6 w-6" />,
    },
    {
      title: 'Schedule Optimization',
      description: 'Smart project timeline planning.',
      icon: <Calendar className="h-6 w-6" />,
    },
    {
      title: 'Resource Allocation',
      description: 'Efficient resource management.',
      icon: <Settings className="h-6 w-6" />,
    },
  ];

  const enhancedFaqs = [
    {
      question: 'How quickly can we implement the system?',
      answer:
        'Implementation typically takes 2-3 weeks, including staff training and data migration.',
    },
    {
      question: 'Can it handle multiple construction projects?',
      answer:
        'Yes, our platform is designed to manage multiple projects simultaneously with comprehensive tracking and reporting.',
    },
    {
      question: 'What kind of support do you provide?',
      answer:
        'We offer 24/7 technical support, on-site training, and dedicated project implementation specialists.',
    },
    {
      question: 'Is it suitable for different types of construction?',
      answer:
        'Yes, our platform is customizable for residential, commercial, industrial, and infrastructure projects.',
    },
    {
      question: 'How do you ensure data security?',
      answer:
        'We implement industry-leading security measures and regular backups to protect your project data.',
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
        <SolutionBadge className="mb-4">
          Construction Management Solutions
        </SolutionBadge>
        <h1 className="mb-4 text-balance text-center font-bold text-2xl tracking-tight md:text-4xl lg:text-6xl">
          <SolutionGradientHeadline>
            Transform Your Construction Business
          </SolutionGradientHeadline>
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
          Streamline project management, improve efficiency, and ensure safety
          with our comprehensive construction management platform.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <SolutionLinkButton href="/contact">Get Started</SolutionLinkButton>
          <SolutionLinkButton href="/pricing" variant="outline">
            View Pricing
          </SolutionLinkButton>
        </div>
      </motion.div>

      {/* Trust Indicators */}
      <section className="mb-24">
        <SolutionCard className="border-primary bg-primary/5 p-8">
          <div className="mx-auto flex max-w-4xl flex-col items-center gap-4 text-center">
            <HardHat className="h-12 w-12 text-primary" />
            <h2 className="font-bold text-2xl">
              Trusted by Leading Construction Companies
            </h2>
            <p className="text-muted-foreground">
              Join thousands of construction professionals who have transformed
              their operations with our platform.
            </p>
          </div>
        </SolutionCard>
      </section>

      {/* Features Grid */}
      <motion.section variants={itemVariants} className="mb-24">
        <h2 className="mb-12 text-center font-bold text-3xl">
          Comprehensive Construction Management
        </h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <motion.div
              key={feature.title}
              variants={itemVariants}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <SolutionCard className="h-full p-6 transition-colors hover:border-primary">
                <div className="mb-4 flex items-center gap-3">
                  <div className="text-primary">{feature.icon}</div>
                  <h3 className="font-semibold text-xl">{feature.title}</h3>
                </div>
                <p className="text-muted-foreground">{feature.description}</p>
              </SolutionCard>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* Benefits Bento Grid */}
      <motion.section variants={itemVariants} className="mb-24">
        <h2 className="mb-12 text-center font-bold text-3xl">Key Benefits</h2>
        <div className="grid gap-4 md:grid-cols-4 md:grid-rows-2">
          <SolutionCard className="bg-primary/5 md:col-span-2 md:row-span-2">
            <div className="flex h-full flex-col p-6">
              <Hammer className="mb-4 h-8 w-8 text-primary" />
              <h3 className="mb-2 font-bold text-xl">
                Enhanced Project Management
              </h3>
              <p className="text-muted-foreground">
                Improve project outcomes with advanced planning tools and
                real-time progress tracking.
              </p>
              <div className="mt-4 grow rounded-lg bg-background/50 p-4">
                <div className="space-y-2">
                  <div className="h-2 w-3/4 rounded bg-primary/20" />
                  <div className="h-2 w-1/2 rounded bg-primary/20" />
                  <div className="h-2 w-2/3 rounded bg-primary/20" />
                </div>
              </div>
            </div>
          </SolutionCard>

          {benefits.map((benefit) => (
            <SolutionCard key={benefit.title} className="group overflow-hidden">
              <motion.div
                className="flex h-full flex-col p-6"
                whileHover={{ y: -5 }}
              >
                {benefit.icon}
                <h3 className="mb-2 font-bold">{benefit.title}</h3>
                <p className="text-muted-foreground text-sm">
                  {benefit.description}
                </p>
                <div className="mt-4 h-1 w-0 bg-primary/10 transition-all group-hover:w-full" />
              </motion.div>
            </SolutionCard>
          ))}
        </div>
      </motion.section>

      {/* Core Features */}
      <motion.section variants={itemVariants} className="mb-24">
        <h2 className="mb-12 text-center font-bold text-3xl">Core Features</h2>
        <div className="grid gap-6 md:grid-cols-3">
          <SolutionCard className="p-6 text-center">
            <Users className="mx-auto mb-4 h-8 w-8 text-primary" />
            <h3 className="mb-2 font-bold">Team Management</h3>
            <p className="text-muted-foreground text-sm">
              Efficient workforce coordination
            </p>
          </SolutionCard>
          <SolutionCard className="p-6 text-center">
            <LineChart className="mx-auto mb-4 h-8 w-8 text-primary" />
            <h3 className="mb-2 font-bold">Project Analytics</h3>
            <p className="text-muted-foreground text-sm">
              Real-time performance tracking
            </p>
          </SolutionCard>
          <SolutionCard className="p-6 text-center">
            <Clock className="mx-auto mb-4 h-8 w-8 text-primary" />
            <h3 className="mb-2 font-bold">Timeline Management</h3>
            <p className="text-muted-foreground text-sm">
              Smart scheduling and planning
            </p>
          </SolutionCard>
        </div>
      </motion.section>

      {/* Success Story */}
      <motion.section variants={itemVariants} className="mb-24">
        <SolutionCard className="overflow-hidden">
          <div className="grid md:grid-cols-2">
            <div className="p-8">
              <Star className="mb-4 h-8 w-8 text-primary" />
              <h2 className="mb-4 font-bold text-2xl">Success Story</h2>
              <p className="mb-4 text-muted-foreground">
                "This platform has revolutionized how we manage construction
                projects. We've seen significant improvements in efficiency,
                safety, and project delivery times."
              </p>
              <p className="font-semibold">- John Anderson</p>
              <p className="text-muted-foreground text-sm">
                Project Director, Premier Construction Group
              </p>
            </div>
            <div className="flex items-center justify-center bg-primary/5 p-8">
              <div className="grid gap-4 text-center">
                <div>
                  <div className="mb-2 font-bold text-3xl text-primary">
                    35%
                  </div>
                  <div className="text-muted-foreground text-sm">
                    Faster Project Delivery
                  </div>
                </div>
                <div>
                  <div className="mb-2 font-bold text-3xl text-primary">
                    45%
                  </div>
                  <div className="text-muted-foreground text-sm">
                    Cost Reduction
                  </div>
                </div>
                <div>
                  <div className="mb-2 font-bold text-3xl text-primary">
                    99%
                  </div>
                  <div className="text-muted-foreground text-sm">
                    Safety Compliance
                  </div>
                </div>
              </div>
            </div>
          </div>
        </SolutionCard>
      </motion.section>

      {/* FAQ Section */}
      <motion.section variants={itemVariants}>
        <h2 className="mb-12 text-center font-bold text-3xl">
          Frequently Asked Questions
        </h2>
        <div className="grid gap-6 md:grid-cols-2">
          <Accordion type="single" className="grid h-fit gap-4" collapsible>
            {enhancedFaqs
              .slice(0, Math.ceil(enhancedFaqs.length / 2))
              .map((faq, index) => (
                <AccordionItem key={`faq-${index + 1}`} value={`item-${index}`}>
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
                  key={`faq-2-${index + 1}`}
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
        <SolutionCard className="border-primary bg-primary/5 p-12">
          <h2 className="mb-4 font-bold text-3xl">
            Ready to Transform Your Construction Business?
          </h2>
          <p className="mx-auto mb-8 max-w-2xl text-muted-foreground">
            Join leading construction companies using our platform to improve
            project management and drive growth.
          </p>
          <div className="flex justify-center gap-4">
            <SolutionLinkButton href="/contact">Get Started</SolutionLinkButton>
            <SolutionLinkButton href="/pricing" variant="outline">
              View Pricing
            </SolutionLinkButton>
          </div>
        </SolutionCard>
      </motion.section>
    </motion.div>
  );
}
