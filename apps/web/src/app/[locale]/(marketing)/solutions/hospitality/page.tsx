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
  BarChart3,
  Bed,
  Bell,
  Building,
  Calendar,
  Clock,
  Coffee,
  DollarSign,
  Gift,
  HeartHandshake,
  Hotel,
  Key,
  MessageSquare,
  Settings,
  Star,
  Users,
} from '@tuturuuu/ui/icons';
import { motion } from 'framer-motion';
import Link from 'next/link';

export default function HospitalityPage() {
  const features = [
    {
      title: 'Property Management',
      description: 'Comprehensive hotel and property management system.',
      icon: <Building className="h-6 w-6" />,
    },
    {
      title: 'Reservation System',
      description: 'Smart booking and room allocation management.',
      icon: <Calendar className="h-6 w-6" />,
    },
    {
      title: 'Guest Services',
      description: 'Streamlined guest experience and request handling.',
      icon: <Bell className="h-6 w-6" />,
    },
    {
      title: 'Front Desk Operations',
      description: 'Efficient check-in/out and guest management.',
      icon: <Hotel className="h-6 w-6" />,
    },
    {
      title: 'Revenue Management',
      description: 'Dynamic pricing and revenue optimization tools.',
      icon: <DollarSign className="h-6 w-6" />,
    },
    {
      title: 'Analytics Dashboard',
      description: 'Comprehensive reporting and business insights.',
      icon: <BarChart3 className="h-6 w-6" />,
    },
  ];

  const benefits = [
    {
      title: 'Smart Room Control',
      description: 'IoT-enabled room automation.',
      icon: <Key className="h-6 w-6" />,
    },
    {
      title: 'Guest Communication',
      description: 'Multi-channel guest messaging.',
      icon: <MessageSquare className="h-6 w-6" />,
    },
    {
      title: 'Loyalty Programs',
      description: 'Guest rewards and retention.',
      icon: <Gift className="h-6 w-6" />,
    },
    {
      title: 'Staff Management',
      description: 'Workforce scheduling and tasks.',
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
      question: 'Can it integrate with existing hotel systems?',
      answer:
        'Yes, we offer integration with major PMS systems, booking engines, and channel managers.',
    },
    {
      question: 'What kind of support do you provide?',
      answer:
        'We provide 24/7 technical support, comprehensive training, and dedicated account management.',
    },
    {
      question: 'Is it suitable for different property types?',
      answer:
        'Yes, our platform is customizable for hotels, resorts, boutique properties, and vacation rentals.',
    },
    {
      question: 'How do you handle guest data privacy?',
      answer:
        'We implement strict data protection measures and comply with global privacy regulations.',
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
          Hospitality Management Solutions
        </Badge>
        <h1 className="mb-4 text-center text-2xl font-bold tracking-tight text-balance md:text-4xl lg:text-6xl">
          <GradientHeadline>
            Transform Your Hospitality Business
          </GradientHeadline>
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
          Elevate guest experiences and streamline operations with our
          comprehensive hospitality management platform.
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
            <Star className="h-12 w-12 text-primary" />
            <h2 className="text-2xl font-bold">
              Trusted by Leading Hospitality Brands
            </h2>
            <p className="text-muted-foreground">
              Join thousands of properties that have transformed their guest
              experience with our platform.
            </p>
          </div>
        </Card>
      </section>

      {/* Features Grid */}
      <motion.section variants={itemVariants} className="mb-24">
        <h2 className="mb-12 text-center text-3xl font-bold">
          Comprehensive Hospitality Management
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
              <Bed className="mb-4 h-8 w-8 text-primary" />
              <h3 className="mb-2 text-xl font-bold">
                Enhanced Guest Experience
              </h3>
              <p className="text-muted-foreground">
                Deliver exceptional service and personalized experiences with
                our comprehensive hospitality solution.
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
            <h3 className="mb-2 font-bold">Guest Management</h3>
            <p className="text-sm text-muted-foreground">
              Comprehensive guest profiles
            </p>
          </Card>
          <Card className="p-6 text-center">
            <Clock className="mx-auto mb-4 h-8 w-8 text-primary" />
            <h3 className="mb-2 font-bold">24/7 Operations</h3>
            <p className="text-sm text-muted-foreground">
              Round-the-clock service support
            </p>
          </Card>
          <Card className="p-6 text-center">
            <Coffee className="mx-auto mb-4 h-8 w-8 text-primary" />
            <h3 className="mb-2 font-bold">Service Management</h3>
            <p className="text-sm text-muted-foreground">
              Streamlined service delivery
            </p>
          </Card>
        </div>
      </motion.section>

      {/* Success Story */}
      <motion.section variants={itemVariants} className="mb-24">
        <Card className="overflow-hidden">
          <div className="grid md:grid-cols-2">
            <div className="p-8">
              <HeartHandshake className="mb-4 h-8 w-8 text-primary" />
              <h2 className="mb-4 text-2xl font-bold">Success Story</h2>
              <p className="mb-4 text-muted-foreground">
                "This platform has revolutionized how we manage our properties.
                Guest satisfaction has soared, and our operations are more
                efficient than ever."
              </p>
              <p className="font-semibold">- Sarah Thompson</p>
              <p className="text-sm text-muted-foreground">
                General Manager, Luxury Hotels Group
              </p>
            </div>
            <div className="flex items-center justify-center bg-primary/5 p-8">
              <div className="grid gap-4 text-center">
                <div>
                  <div className="mb-2 text-3xl font-bold text-primary">
                    40%
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Increased Efficiency
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-3xl font-bold text-primary">
                    95%
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Guest Satisfaction
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-3xl font-bold text-primary">
                    30%
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Revenue Growth
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
            Ready to Transform Your Hospitality Business?
          </h2>
          <p className="mx-auto mb-8 max-w-2xl text-muted-foreground">
            Join leading hospitality brands using our platform to enhance guest
            experiences and streamline operations.
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
