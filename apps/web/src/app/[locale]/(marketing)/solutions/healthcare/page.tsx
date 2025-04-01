'use client';

import GradientHeadline from '../../gradient-headline';
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
  Activity,
  BarChart3,
  Bell,
  Bot,
  Brain,
  Calendar,
  ClipboardList,
  Clock,
  FileText,
  HeartPulse,
  MessageSquare,
  Pill,
  Shield,
  Star,
  Stethoscope,
  Users,
} from '@tuturuuu/ui/icons';
import { motion } from 'framer-motion';
import Link from 'next/link';

export default function HealthcarePage() {
  const features = [
    {
      title: 'Patient Management',
      description: 'Comprehensive patient records and appointment scheduling.',
      icon: <Users className="h-6 w-6" />,
    },
    {
      title: 'Clinical Records',
      description: 'Secure electronic health records and medical history.',
      icon: <ClipboardList className="h-6 w-6" />,
    },
    {
      title: 'Appointment System',
      description: 'Smart scheduling and patient reminders.',
      icon: <Calendar className="h-6 w-6" />,
    },
    {
      title: 'Prescription Management',
      description: 'Digital prescriptions and medication tracking.',
      icon: <Pill className="h-6 w-6" />,
    },
    {
      title: 'Analytics Dashboard',
      description: 'Insights into practice performance and patient care.',
      icon: <BarChart3 className="h-6 w-6" />,
    },
    {
      title: 'Medical Billing',
      description: 'Streamlined insurance claims and payment processing.',
      icon: <FileText className="h-6 w-6" />,
    },
  ];

  const benefits = [
    {
      title: 'AI Diagnostics',
      description: 'Advanced diagnostic support tools.',
      icon: <Brain className="h-6 w-6" />,
    },
    {
      title: 'Virtual Care',
      description: 'Telemedicine and remote consultations.',
      icon: <Stethoscope className="h-6 w-6" />,
    },
    {
      title: 'Patient Portal',
      description: 'Self-service portal for patients.',
      icon: <MessageSquare className="h-6 w-6" />,
    },
    {
      title: 'Smart Alerts',
      description: 'Critical updates and notifications.',
      icon: <Bell className="h-6 w-6" />,
    },
  ];

  const enhancedFaqs = [
    {
      question: 'Is the system HIPAA compliant?',
      answer:
        'Yes, our healthcare management system is fully HIPAA compliant with advanced security features to protect patient data.',
    },
    {
      question: 'Can it integrate with existing medical systems?',
      answer:
        'Yes, we offer integration with major EMR systems, lab systems, and healthcare networks.',
    },
    {
      question: 'What support do you provide?',
      answer:
        'We provide 24/7 technical support, comprehensive training, and dedicated account management.',
    },
    {
      question: 'How do you handle patient data security?',
      answer:
        'We implement bank-grade encryption, regular security audits, and strict access controls.',
    },
    {
      question: 'Can patients access their records?',
      answer:
        'Yes, patients get secure access to their medical records, appointments, and test results through our patient portal.',
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
          Healthcare Management Solutions
        </Badge>
        <h1 className="mb-4 text-center text-2xl font-bold tracking-tight text-balance md:text-4xl lg:text-6xl">
          <GradientHeadline>
            Transform Your Healthcare Practice
          </GradientHeadline>
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
          Streamline patient care, improve efficiency, and ensure compliance
          with our comprehensive healthcare management platform.
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
                ? '/media/marketing/healthcare/healthcare-dark.jpeg'
                : '/media/marketing/healthcare/healthcare-light.jpeg'
            }
            alt="Healthcare Management Interface"
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
            <Shield className="h-12 w-12 text-primary" />
            <h2 className="text-2xl font-bold">
              Trusted by Healthcare Professionals
            </h2>
            <p className="text-muted-foreground">
              Join thousands of healthcare providers who have transformed their
              practice with our platform.
            </p>
          </div>
        </Card>
      </section>

      {/* Features Grid */}
      <motion.section variants={itemVariants} className="mb-24">
        <h2 className="mb-12 text-center text-3xl font-bold">
          Comprehensive Healthcare Management
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
              <HeartPulse className="mb-4 h-8 w-8 text-primary" />
              <h3 className="mb-2 text-xl font-bold">Enhanced Patient Care</h3>
              <p className="text-muted-foreground">
                Improve patient outcomes with advanced healthcare management
                tools and streamlined workflows.
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
            <Activity className="mx-auto mb-4 h-8 w-8 text-primary" />
            <h3 className="mb-2 font-bold">Health Monitoring</h3>
            <p className="text-sm text-muted-foreground">
              Real-time patient vitals tracking
            </p>
          </Card>
          <Card className="p-6 text-center">
            <Bot className="mx-auto mb-4 h-8 w-8 text-primary" />
            <h3 className="mb-2 font-bold">AI Assistance</h3>
            <p className="text-sm text-muted-foreground">
              Smart diagnostic support
            </p>
          </Card>
          <Card className="p-6 text-center">
            <Clock className="mx-auto mb-4 h-8 w-8 text-primary" />
            <h3 className="mb-2 font-bold">24/7 Access</h3>
            <p className="text-sm text-muted-foreground">
              Always available patient care
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
                "This platform has revolutionized how we deliver healthcare.
                Patient satisfaction has improved dramatically, and our
                administrative processes are more efficient than ever."
              </p>
              <p className="font-semibold">- Dr. James Wilson</p>
              <p className="text-sm text-muted-foreground">
                Medical Director, Advanced Care Clinic
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
                    95%
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Patient Satisfaction
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
            Ready to Transform Your Healthcare Practice?
          </h2>
          <p className="mx-auto mb-8 max-w-2xl text-muted-foreground">
            Join leading healthcare providers using our platform to enhance
            patient care and streamline operations.
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
