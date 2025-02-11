'use client';

import GradientHeadline from '../../gradient-headline';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tutur3u/ui/accordion';
import { Badge } from '@tutur3u/ui/badge';
import { Button } from '@tutur3u/ui/button';
import { Card } from '@tutur3u/ui/card';
import { motion } from 'framer-motion';
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
} from 'lucide-react';
import Link from 'next/link';

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
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { duration: 0.5 },
    },
  };

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
          Construction Management Solutions
        </Badge>
        <h1 className="mb-4 text-center text-2xl font-bold tracking-tight text-balance md:text-4xl lg:text-6xl">
          <GradientHeadline>
            Transform Your Construction Business
          </GradientHeadline>
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
          Streamline project management, improve efficiency, and ensure safety
          with our comprehensive construction management platform.
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

      {/* Trust Indicators */}
      <section className="mb-24">
        <Card className="border-primary bg-primary/5 p-8">
          <div className="mx-auto flex max-w-4xl flex-col items-center gap-4 text-center">
            <HardHat className="h-12 w-12 text-primary" />
            <h2 className="text-2xl font-bold">
              Trusted by Leading Construction Companies
            </h2>
            <p className="text-muted-foreground">
              Join thousands of construction professionals who have transformed
              their operations with our platform.
            </p>
          </div>
        </Card>
      </section>

      {/* Features Grid */}
      <motion.section variants={itemVariants} className="mb-24">
        <h2 className="mb-12 text-center text-3xl font-bold">
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
              <Hammer className="mb-4 h-8 w-8 text-primary" />
              <h3 className="mb-2 text-xl font-bold">
                Enhanced Project Management
              </h3>
              <p className="text-muted-foreground">
                Improve project outcomes with advanced planning tools and
                real-time progress tracking.
              </p>
              <div className="mt-4 flex-grow rounded-lg bg-background/50 p-4">
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
            <Users className="mx-auto mb-4 h-8 w-8 text-primary" />
            <h3 className="mb-2 font-bold">Team Management</h3>
            <p className="text-sm text-muted-foreground">
              Efficient workforce coordination
            </p>
          </Card>
          <Card className="p-6 text-center">
            <LineChart className="mx-auto mb-4 h-8 w-8 text-primary" />
            <h3 className="mb-2 font-bold">Project Analytics</h3>
            <p className="text-sm text-muted-foreground">
              Real-time performance tracking
            </p>
          </Card>
          <Card className="p-6 text-center">
            <Clock className="mx-auto mb-4 h-8 w-8 text-primary" />
            <h3 className="mb-2 font-bold">Timeline Management</h3>
            <p className="text-sm text-muted-foreground">
              Smart scheduling and planning
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
                "This platform has revolutionized how we manage construction
                projects. We've seen significant improvements in efficiency,
                safety, and project delivery times."
              </p>
              <p className="font-semibold">- John Anderson</p>
              <p className="text-sm text-muted-foreground">
                Project Director, Premier Construction Group
              </p>
            </div>
            <div className="flex items-center justify-center bg-primary/5 p-8">
              <div className="grid gap-4 text-center">
                <div>
                  <div className="mb-2 text-3xl font-bold text-primary">
                    35%
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Faster Project Delivery
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-3xl font-bold text-primary">
                    45%
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Cost Reduction
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-3xl font-bold text-primary">
                    99%
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Safety Compliance
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
            Ready to Transform Your Construction Business?
          </h2>
          <p className="mx-auto mb-8 max-w-2xl text-muted-foreground">
            Join leading construction companies using our platform to improve
            project management and drive growth.
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
