'use client';

import GradientHeadline from '../../gradient-headline';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@repo/ui/components/ui/accordion';
import { Badge } from '@repo/ui/components/ui/badge';
import { Button } from '@repo/ui/components/ui/button';
import { Card } from '@repo/ui/components/ui/card';
import { motion } from 'framer-motion';
import {
  BarChart3,
  Bell,
  Bot,
  Cog,
  Factory,
  Gauge,
  LineChart,
  PackageSearch,
  Scan,
  Settings,
  Shield,
  Star,
  Truck,
  Warehouse,
  Wrench,
} from 'lucide-react';
import Link from 'next/link';

export default function ManufacturingPage() {
  const features = [
    {
      title: 'Production Management',
      description: 'Streamline manufacturing processes and workflows.',
      icon: <Factory className="h-6 w-6" />,
    },
    {
      title: 'Inventory Control',
      description: 'Real-time tracking of materials and finished goods.',
      icon: <Warehouse className="h-6 w-6" />,
    },
    {
      title: 'Quality Control',
      description: 'Comprehensive quality assurance and testing tools.',
      icon: <Shield className="h-6 w-6" />,
    },
    {
      title: 'Equipment Maintenance',
      description: 'Preventive maintenance scheduling and tracking.',
      icon: <Wrench className="h-6 w-6" />,
    },
    {
      title: 'Performance Analytics',
      description: 'Real-time production metrics and insights.',
      icon: <BarChart3 className="h-6 w-6" />,
    },
    {
      title: 'Supply Chain',
      description: 'End-to-end supply chain management and optimization.',
      icon: <Truck className="h-6 w-6" />,
    },
  ];

  const benefits = [
    {
      title: 'Smart Automation',
      description: 'AI-powered process automation.',
      icon: <Bot className="h-6 w-6" />,
    },
    {
      title: 'Real-time Monitoring',
      description: 'Live production line monitoring.',
      icon: <Gauge className="h-6 w-6" />,
    },
    {
      title: 'Alerts & Notifications',
      description: 'Instant alerts for critical events.',
      icon: <Bell className="h-6 w-6" />,
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
        'Implementation typically takes 4-6 weeks, including setup, training, and integration with existing systems.',
    },
    {
      question: 'Can it integrate with our existing machinery?',
      answer:
        'Yes, our system supports integration with most modern manufacturing equipment and legacy systems.',
    },
    {
      question: 'What kind of support do you provide?',
      answer:
        'We offer 24/7 technical support, on-site training, and dedicated implementation specialists.',
    },
    {
      question: 'How do you handle data security?',
      answer:
        'We implement industry-leading security measures, including encryption and regular security audits.',
    },
    {
      question: 'Can it scale with our business?',
      answer:
        'Yes, our platform is designed to scale seamlessly as your manufacturing operations grow.',
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
          Manufacturing Management Solutions
        </Badge>
        <h1 className="mb-4 text-center text-2xl font-bold tracking-tight text-balance md:text-4xl lg:text-6xl">
          <GradientHeadline>
            Transform Your Manufacturing Operations
          </GradientHeadline>
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
          Optimize production, improve quality, and drive efficiency with our
          comprehensive manufacturing management platform.
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
                ? '/media/marketing/manufacturing/manufacturing-dark.jpeg'
                : '/media/marketing/manufacturing/manufacturing-light.jpeg'
            }
            alt="Manufacturing Management Interface"
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
            <Cog className="h-12 w-12 text-primary" />
            <h2 className="text-2xl font-bold">
              Trusted by Leading Manufacturers
            </h2>
            <p className="text-muted-foreground">
              Join thousands of manufacturers who have transformed their
              operations with our platform.
            </p>
          </div>
        </Card>
      </section>

      {/* Features Grid */}
      <motion.section variants={itemVariants} className="mb-24">
        <h2 className="mb-12 text-center text-3xl font-bold">
          Comprehensive Manufacturing Management
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
              <Factory className="mb-4 h-8 w-8 text-primary" />
              <h3 className="mb-2 text-xl font-bold">
                Optimized Manufacturing
              </h3>
              <p className="text-muted-foreground">
                Improve production efficiency, reduce waste, and enhance quality
                with our comprehensive solution.
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
            <Scan className="mx-auto mb-4 h-8 w-8 text-primary" />
            <h3 className="mb-2 font-bold">Quality Tracking</h3>
            <p className="text-sm text-muted-foreground">
              Advanced quality control systems
            </p>
          </Card>
          <Card className="p-6 text-center">
            <LineChart className="mx-auto mb-4 h-8 w-8 text-primary" />
            <h3 className="mb-2 font-bold">Production Analytics</h3>
            <p className="text-sm text-muted-foreground">
              Real-time performance metrics
            </p>
          </Card>
          <Card className="p-6 text-center">
            <PackageSearch className="mx-auto mb-4 h-8 w-8 text-primary" />
            <h3 className="mb-2 font-bold">Inventory Tracking</h3>
            <p className="text-sm text-muted-foreground">
              Automated stock management
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
                "This platform has revolutionized our manufacturing processes.
                We've seen significant improvements in efficiency, quality, and
                overall productivity."
              </p>
              <p className="font-semibold">- Robert Chang</p>
              <p className="text-sm text-muted-foreground">
                Operations Director, Global Manufacturing Inc.
              </p>
            </div>
            <div className="flex items-center justify-center bg-primary/5 p-8">
              <div className="grid gap-4 text-center">
                <div>
                  <div className="mb-2 text-3xl font-bold text-primary">
                    35%
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Increased Efficiency
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-3xl font-bold text-primary">
                    45%
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Reduced Downtime
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-3xl font-bold text-primary">
                    99%
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Quality Rate
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
            Ready to Transform Your Manufacturing Operations?
          </h2>
          <p className="mx-auto mb-8 max-w-2xl text-muted-foreground">
            Join leading manufacturers using our platform to optimize production
            and drive growth.
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
