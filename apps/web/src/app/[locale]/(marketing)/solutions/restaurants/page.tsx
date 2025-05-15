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
  ChefHat,
  Clock,
  CreditCard,
  FileText,
  Gift,
  HeartHandshake,
  LayoutDashboard,
  Receipt,
  ShoppingBag,
  Smartphone,
  Star,
  Store,
  Truck,
  Utensils,
  Wallet,
} from '@tuturuuu/ui/icons';
import { motion } from 'framer-motion';
import Link from 'next/link';

export default function RestaurantsPage() {
  const features = [
    {
      title: 'Smart POS System',
      description:
        'Streamline orders and payments with our intuitive point-of-sale system.',
      icon: <CreditCard className="h-6 w-6" />,
    },
    {
      title: 'Inventory Management',
      description:
        'Track ingredients and supplies in real-time with automated alerts.',
      icon: <Store className="h-6 w-6" />,
    },
    {
      title: 'Online Ordering',
      description:
        'Accept orders through your website and mobile app seamlessly.',
      icon: <ShoppingBag className="h-6 w-6" />,
    },
    {
      title: 'Table Management',
      description: 'Optimize seating arrangements and reduce wait times.',
      icon: <LayoutDashboard className="h-6 w-6" />,
    },
    {
      title: 'Staff Scheduling',
      description:
        'Manage employee shifts and performance tracking efficiently.',
      icon: <Clock className="h-6 w-6" />,
    },
    {
      title: 'Analytics & Reports',
      description:
        'Make data-driven decisions with comprehensive business insights.',
      icon: <BarChart3 className="h-6 w-6" />,
    },
  ];

  const benefits = [
    {
      title: 'Digital Menu Management',
      description: 'Update prices and items instantly across all platforms.',
      icon: <FileText className="h-6 w-6" />,
    },
    {
      title: 'Customer Loyalty Program',
      description: 'Reward regular customers and boost retention.',
      icon: <Gift className="h-6 w-6" />,
    },
    {
      title: 'Mobile App Integration',
      description: 'Reach customers on their preferred devices.',
      icon: <Smartphone className="h-6 w-6" />,
    },
    {
      title: 'Kitchen Display System',
      description: 'Streamline kitchen operations and order fulfillment.',
      icon: <ChefHat className="h-6 w-6" />,
    },
  ];

  const enhancedFaqs = [
    {
      question: 'How quickly can I get started with the system?',
      answer:
        'Our restaurant management system can be set up within 24-48 hours. We provide comprehensive training and support to ensure a smooth transition.',
    },
    {
      question: 'Is the system suitable for multiple locations?',
      answer:
        'Yes, our system is designed to handle multiple locations with centralized management and reporting capabilities.',
    },
    {
      question: 'What kind of support do you provide?',
      answer:
        '24/7 technical support, regular system updates, and dedicated account management for enterprise clients.',
    },
    {
      question: 'Can I integrate with my existing systems?',
      answer:
        'Yes, we offer integration with popular accounting, delivery, and payment processing systems.',
    },
    {
      question: 'How secure is the payment processing?',
      answer:
        'We use bank-grade encryption and are fully PCI DSS compliant to ensure secure transactions.',
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
          Restaurant Management Solutions
        </Badge>
        <h1 className="mb-4 text-balance text-center text-2xl font-bold tracking-tight md:text-4xl lg:text-6xl">
          <GradientHeadline>
            Transform Your Restaurant Operations
          </GradientHeadline>
        </h1>
        <p className="text-muted-foreground mx-auto max-w-2xl text-lg">
          Streamline operations, boost efficiency, and delight customers with
          our comprehensive restaurant management platform.
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
                ? '/media/marketing/restaurants/restaurant-dark.jpeg'
                : '/media/marketing/restaurants/restaurant-light.jpeg'
            }
            alt="Restaurant Management Interface"
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
            <Star className="text-primary h-12 w-12" />
            <h2 className="text-2xl font-bold">
              Trusted by Leading Restaurants Worldwide
            </h2>
            <p className="text-muted-foreground">
              Join thousands of restaurants that have transformed their
              operations with our platform.
            </p>
          </div>
        </Card>
      </section>

      {/* Features Grid */}
      <motion.section variants={itemVariants} className="mb-24">
        <h2 className="mb-12 text-center text-3xl font-bold">
          Everything You Need to Succeed
        </h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <motion.div
              key={feature.title}
              variants={itemVariants}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Card className="hover:border-primary h-full p-6 transition-colors">
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
              <Utensils className="text-primary mb-4 h-8 w-8" />
              <h3 className="mb-2 text-xl font-bold">
                Boost Your Restaurant's Efficiency
              </h3>
              <p className="text-muted-foreground">
                Streamline operations, reduce costs, and increase customer
                satisfaction with our comprehensive solution.
              </p>
              <div className="bg-background/50 mt-4 grow rounded-lg p-4">
                <div className="space-y-2">
                  <div className="bg-primary/20 h-2 w-3/4 rounded" />
                  <div className="bg-primary/20 h-2 w-1/2 rounded" />
                  <div className="bg-primary/20 h-2 w-2/3 rounded" />
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
                <p className="text-muted-foreground text-sm">
                  {benefit.description}
                </p>
                <div className="bg-primary/10 mt-4 h-1 w-0 transition-all group-hover:w-full" />
              </motion.div>
            </Card>
          ))}
        </div>
      </motion.section>

      {/* Integration Partners */}
      <motion.section variants={itemVariants} className="mb-24">
        <h2 className="mb-12 text-center text-3xl font-bold">
          Seamless Integrations
        </h2>
        <div className="grid gap-6 md:grid-cols-3">
          <Card className="p-6 text-center">
            <Wallet className="text-primary mx-auto mb-4 h-8 w-8" />
            <h3 className="mb-2 font-bold">Payment Processors</h3>
            <p className="text-muted-foreground text-sm">
              Connect with major payment providers
            </p>
          </Card>
          <Card className="p-6 text-center">
            <Truck className="text-primary mx-auto mb-4 h-8 w-8" />
            <h3 className="mb-2 font-bold">Delivery Services</h3>
            <p className="text-muted-foreground text-sm">
              Integrate with popular delivery platforms
            </p>
          </Card>
          <Card className="p-6 text-center">
            <Receipt className="text-primary mx-auto mb-4 h-8 w-8" />
            <h3 className="mb-2 font-bold">Accounting Software</h3>
            <p className="text-muted-foreground text-sm">
              Sync with your accounting system
            </p>
          </Card>
        </div>
      </motion.section>

      {/* Success Story */}
      <motion.section variants={itemVariants} className="mb-24">
        <Card className="overflow-hidden">
          <div className="grid md:grid-cols-2">
            <div className="p-8">
              <HeartHandshake className="text-primary mb-4 h-8 w-8" />
              <h2 className="mb-4 text-2xl font-bold">Success Story</h2>
              <p className="text-muted-foreground mb-4">
                "Since implementing this system, we've seen a 30% increase in
                efficiency and a 25% boost in customer satisfaction. The
                platform has transformed how we operate."
              </p>
              <p className="font-semibold">- John Smith</p>
              <p className="text-muted-foreground text-sm">
                Owner, The Gourmet Kitchen
              </p>
            </div>
            <div className="bg-primary/5 flex items-center justify-center p-8">
              <div className="grid gap-4 text-center">
                <div>
                  <div className="text-primary mb-2 text-3xl font-bold">
                    30%
                  </div>
                  <div className="text-muted-foreground text-sm">
                    Increased Efficiency
                  </div>
                </div>
                <div>
                  <div className="text-primary mb-2 text-3xl font-bold">
                    25%
                  </div>
                  <div className="text-muted-foreground text-sm">
                    Higher Satisfaction
                  </div>
                </div>
                <div>
                  <div className="text-primary mb-2 text-3xl font-bold">2x</div>
                  <div className="text-muted-foreground text-sm">
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
            Ready to Transform Your Restaurant?
          </h2>
          <p className="text-muted-foreground mx-auto mb-8 max-w-2xl">
            Join thousands of successful restaurants using our platform to
            streamline operations and delight customers.
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
