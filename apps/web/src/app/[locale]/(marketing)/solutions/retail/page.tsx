'use client';

import GradientHeadline from '../../gradient-headline';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tutur3u/ui/components/ui/accordion';
import { Badge } from '@tutur3u/ui/components/ui/badge';
import { Button } from '@tutur3u/ui/components/ui/button';
import { Card } from '@tutur3u/ui/components/ui/card';
import { motion } from 'framer-motion';
import {
  BarChart3,
  Bell,
  Box,
  CreditCard,
  DollarSign,
  Gift,
  LineChart,
  PackageSearch,
  QrCode,
  Receipt,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Star,
  Store,
  Tag,
} from 'lucide-react';
import Link from 'next/link';

export default function RetailPage() {
  const features = [
    {
      title: 'Point of Sale',
      description: 'Fast and intuitive POS system for seamless transactions.',
      icon: <CreditCard className="h-6 w-6" />,
    },
    {
      title: 'Inventory Management',
      description: 'Real-time tracking and automated reordering.',
      icon: <Box className="h-6 w-6" />,
    },
    {
      title: 'Customer Loyalty',
      description: 'Reward programs and customer relationship management.',
      icon: <Gift className="h-6 w-6" />,
    },
    {
      title: 'Sales Analytics',
      description: 'Comprehensive sales reporting and insights.',
      icon: <BarChart3 className="h-6 w-6" />,
    },
    {
      title: 'Multi-Store',
      description: 'Manage multiple locations from one platform.',
      icon: <Store className="h-6 w-6" />,
    },
    {
      title: 'E-commerce',
      description: 'Integrated online store and inventory sync.',
      icon: <ShoppingCart className="h-6 w-6" />,
    },
  ];

  const benefits = [
    {
      title: 'Smart Pricing',
      description: 'AI-powered price optimization.',
      icon: <Tag className="h-6 w-6" />,
    },
    {
      title: 'Real-time Alerts',
      description: 'Instant stock level notifications.',
      icon: <Bell className="h-6 w-6" />,
    },
    {
      title: 'Digital Receipts',
      description: 'Eco-friendly paperless options.',
      icon: <Receipt className="h-6 w-6" />,
    },
    {
      title: 'Resource Planning',
      description: 'Staff scheduling and management.',
      icon: <Settings className="h-6 w-6" />,
    },
  ];

  const enhancedFaqs = [
    {
      question: 'How quickly can we get started?',
      answer:
        'You can start using our retail management system within 24 hours. Our team will help with setup and training.',
    },
    {
      question: 'Can it integrate with my existing hardware?',
      answer:
        'Yes, our system is compatible with most POS hardware, barcode scanners, and receipt printers.',
    },
    {
      question: 'What kind of support do you provide?',
      answer:
        'We offer 24/7 technical support, on-site training, and dedicated account managers for enterprise clients.',
    },
    {
      question: 'Is it suitable for small businesses?',
      answer:
        'Absolutely! Our platform is scalable and offers plans suitable for businesses of all sizes.',
    },
    {
      question: 'How secure are the transactions?',
      answer:
        'We use bank-grade encryption and comply with PCI DSS standards to ensure secure transactions.',
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
          Retail Management Solutions
        </Badge>
        <h1 className="mb-4 text-center text-2xl font-bold tracking-tight text-balance md:text-4xl lg:text-6xl">
          <GradientHeadline>Transform Your Retail Business</GradientHeadline>
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
          Streamline operations, boost sales, and delight customers with our
          comprehensive retail management platform.
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
                ? '/media/marketing/retail/retail-dark.jpeg'
                : '/media/marketing/retail/retail-light.jpeg'
            }
            alt="Retail Management Interface"
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
            <ShoppingBag className="h-12 w-12 text-primary" />
            <h2 className="text-2xl font-bold">Trusted by Leading Retailers</h2>
            <p className="text-muted-foreground">
              Join thousands of retailers who have transformed their operations
              with our platform.
            </p>
          </div>
        </Card>
      </section>

      {/* Features Grid */}
      <motion.section variants={itemVariants} className="mb-24">
        <h2 className="mb-12 text-center text-3xl font-bold">
          Comprehensive Retail Management
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
              <DollarSign className="mb-4 h-8 w-8 text-primary" />
              <h3 className="mb-2 text-xl font-bold">Increased Revenue</h3>
              <p className="text-muted-foreground">
                Boost your sales with smart inventory management, customer
                insights, and optimized pricing strategies.
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
            <QrCode className="mx-auto mb-4 h-8 w-8 text-primary" />
            <h3 className="mb-2 font-bold">Smart Scanning</h3>
            <p className="text-sm text-muted-foreground">
              Quick barcode and QR code scanning
            </p>
          </Card>
          <Card className="p-6 text-center">
            <LineChart className="mx-auto mb-4 h-8 w-8 text-primary" />
            <h3 className="mb-2 font-bold">Sales Analytics</h3>
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
                "This platform has revolutionized our retail operations. We've
                seen significant improvements in efficiency, sales, and customer
                satisfaction."
              </p>
              <p className="font-semibold">- Sarah Johnson</p>
              <p className="text-sm text-muted-foreground">
                Operations Director, Fashion Retail Co.
              </p>
            </div>
            <div className="flex items-center justify-center bg-primary/5 p-8">
              <div className="grid gap-4 text-center">
                <div>
                  <div className="mb-2 text-3xl font-bold text-primary">
                    45%
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Increased Sales
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-3xl font-bold text-primary">
                    60%
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Faster Checkout
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-3xl font-bold text-primary">
                    30%
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Cost Reduction
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
            Ready to Transform Your Retail Business?
          </h2>
          <p className="mx-auto mb-8 max-w-2xl text-muted-foreground">
            Join leading retailers using our platform to optimize operations and
            drive growth.
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
