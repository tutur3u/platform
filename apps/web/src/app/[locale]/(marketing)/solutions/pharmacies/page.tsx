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
  Activity,
  BarChart3,
  Bot,
  Box,
  Calendar,
  ClipboardList,
  Database,
  HeartPulse,
  MessageSquare,
  Pill,
  Receipt,
  Shield,
  ShieldCheck,
  Smartphone,
  Stethoscope,
  Users,
} from 'lucide-react';
import Link from 'next/link';

export default function PharmaciesPage() {
  const features = [
    {
      title: 'Inventory Management',
      description:
        'Real-time tracking of medications and supplies with automated reordering.',
      icon: <Box className="h-6 w-6" />,
    },
    {
      title: 'Prescription Processing',
      description:
        'Streamlined prescription handling with digital verification.',
      icon: <ClipboardList className="h-6 w-6" />,
    },
    {
      title: 'Patient Records',
      description: 'Secure electronic health records and medication history.',
      icon: <Database className="h-6 w-6" />,
    },
    {
      title: 'Insurance Claims',
      description: 'Automated insurance processing and claims management.',
      icon: <Receipt className="h-6 w-6" />,
    },
    {
      title: 'Clinical Services',
      description: 'Support for vaccination programs and health screenings.',
      icon: <Stethoscope className="h-6 w-6" />,
    },
    {
      title: 'Analytics Dashboard',
      description: 'Comprehensive reporting and business intelligence tools.',
      icon: <BarChart3 className="h-6 w-6" />,
    },
  ];

  const benefits = [
    {
      title: 'Mobile App Integration',
      description: 'Allow patients to manage prescriptions from their phones.',
      icon: <Smartphone className="h-6 w-6" />,
    },
    {
      title: 'Automated Compliance',
      description: 'Stay compliant with regulatory requirements automatically.',
      icon: <Shield className="h-6 w-6" />,
    },
    {
      title: 'Patient Communication',
      description: 'Automated refill reminders and health notifications.',
      icon: <MessageSquare className="h-6 w-6" />,
    },
    {
      title: 'AI-Powered Insights',
      description:
        'Smart analytics for better patient care and business growth.',
      icon: <Bot className="h-6 w-6" />,
    },
  ];

  const enhancedFaqs = [
    {
      question: 'Is the system HIPAA compliant?',
      answer:
        'Yes, our pharmacy management system is fully HIPAA compliant and includes all necessary security features to protect patient data.',
    },
    {
      question: 'Can it integrate with existing healthcare systems?',
      answer:
        'Yes, we offer integration with major EMR systems, insurance providers, and healthcare networks.',
    },
    {
      question: 'What training and support do you provide?',
      answer:
        'We provide comprehensive training for all staff members and 24/7 technical support.',
    },
    {
      question: 'How do you handle system updates?',
      answer:
        'Regular updates are automatically deployed with zero downtime, ensuring you always have the latest features and security patches.',
    },
    {
      question: 'Can it handle multiple locations?',
      answer:
        'Yes, our system is designed to manage multiple pharmacy locations with centralized control and reporting.',
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
          Pharmacy Management Solutions
        </Badge>
        <h1 className="mb-4 text-center text-2xl font-bold tracking-tight text-balance md:text-4xl lg:text-6xl">
          <GradientHeadline>
            Modern Solutions for Modern Pharmacies
          </GradientHeadline>
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
          Streamline your pharmacy operations, enhance patient care, and ensure
          compliance with our comprehensive management system.
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
        className="from-primary/10 to-primary/5 relative mx-auto mb-24 aspect-[1.67] w-full max-w-5xl overflow-hidden rounded-xl border bg-gradient-to-br"
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <Image
            src={
              activeTheme === 'dark'
                ? '/media/marketing/pharmacy/pharmacy-dark.jpeg'
                : '/media/marketing/pharmacy/pharmacy-light.jpeg'
            }
            alt="Pharmacy Management Interface"
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
            <ShieldCheck className="h-12 w-12 text-primary" />
            <h2 className="text-2xl font-bold">
              Trusted by Leading Pharmacies
            </h2>
            <p className="text-muted-foreground">
              Join thousands of pharmacies that have transformed their
              operations with our platform.
            </p>
          </div>
        </Card>
      </section>

      {/* Features Grid */}
      <motion.section variants={itemVariants} className="mb-24">
        <h2 className="mb-12 text-center text-3xl font-bold">
          Comprehensive Pharmacy Management
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
              <Pill className="mb-4 h-8 w-8 text-primary" />
              <h3 className="mb-2 text-xl font-bold">Enhanced Patient Care</h3>
              <p className="text-muted-foreground">
                Improve patient outcomes with advanced medication management and
                clinical decision support.
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

      {/* Clinical Services */}
      <motion.section variants={itemVariants} className="mb-24">
        <h2 className="mb-12 text-center text-3xl font-bold">
          Clinical Services Support
        </h2>
        <div className="grid gap-6 md:grid-cols-3">
          <Card className="p-6 text-center">
            <HeartPulse className="mx-auto mb-4 h-8 w-8 text-primary" />
            <h3 className="mb-2 font-bold">Health Monitoring</h3>
            <p className="text-sm text-muted-foreground">
              Track patient vitals and health metrics
            </p>
          </Card>
          <Card className="p-6 text-center">
            <Calendar className="mx-auto mb-4 h-8 w-8 text-primary" />
            <h3 className="mb-2 font-bold">Appointment Scheduling</h3>
            <p className="text-sm text-muted-foreground">
              Manage vaccinations and consultations
            </p>
          </Card>
          <Card className="p-6 text-center">
            <Activity className="mx-auto mb-4 h-8 w-8 text-primary" />
            <h3 className="mb-2 font-bold">Health Analytics</h3>
            <p className="text-sm text-muted-foreground">
              Monitor patient health trends
            </p>
          </Card>
        </div>
      </motion.section>

      {/* Success Story */}
      <motion.section variants={itemVariants} className="mb-24">
        <Card className="overflow-hidden">
          <div className="grid md:grid-cols-2">
            <div className="p-8">
              <Users className="mb-4 h-8 w-8 text-primary" />
              <h2 className="mb-4 text-2xl font-bold">Success Story</h2>
              <p className="mb-4 text-muted-foreground">
                "The system has revolutionized how we operate. We've seen
                significant improvements in efficiency and patient satisfaction,
                while ensuring perfect compliance with regulations."
              </p>
              <p className="font-semibold">- Dr. Sarah Johnson</p>
              <p className="text-sm text-muted-foreground">
                Chief Pharmacist, HealthCare Pharmacy
              </p>
            </div>
            <div className="flex items-center justify-center bg-primary/5 p-8">
              <div className="grid gap-4 text-center">
                <div>
                  <div className="mb-2 text-3xl font-bold text-primary">
                    40%
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Time Saved
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-3xl font-bold text-primary">
                    99.9%
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Accuracy Rate
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-3xl font-bold text-primary">
                    50%
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Reduced Errors
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
            Ready to Transform Your Pharmacy?
          </h2>
          <p className="mx-auto mb-8 max-w-2xl text-muted-foreground">
            Join leading pharmacies using our platform to enhance patient care
            and streamline operations.
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
