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
  Building,
  Calendar,
  Camera,
  FileText,
  Globe,
  Home,
  Key,
  MapPin,
  MessageSquare,
  Phone,
  Search,
  Star,
  Users,
  Wallet,
} from '@tuturuuu/ui/icons';
import { motion } from 'framer-motion';
import Link from 'next/link';

export default function RealEstatePage() {
  const features = [
    {
      title: 'Property Management',
      description:
        'Comprehensive tools for managing properties, tenants, and maintenance.',
      icon: <Building className="h-6 w-6" />,
    },
    {
      title: 'Lead Management',
      description: 'Track and nurture leads through the entire sales pipeline.',
      icon: <Users className="h-6 w-6" />,
    },
    {
      title: 'Virtual Tours',
      description: 'Create and share immersive virtual property tours.',
      icon: <Camera className="h-6 w-6" />,
    },
    {
      title: 'Document Management',
      description: 'Secure storage and handling of all property documents.',
      icon: <FileText className="h-6 w-6" />,
    },
    {
      title: 'Financial Tools',
      description: 'Track income, expenses, and generate financial reports.',
      icon: <Wallet className="h-6 w-6" />,
    },
    {
      title: 'Market Analytics',
      description:
        'Data-driven insights for property valuation and market trends.',
      icon: <BarChart3 className="h-6 w-6" />,
    },
  ];

  const benefits = [
    {
      title: 'Smart Scheduling',
      description: 'Automated showing scheduling and calendar management.',
      icon: <Calendar className="h-6 w-6" />,
    },
    {
      title: 'Communication Hub',
      description: 'Centralized platform for client and team communication.',
      icon: <MessageSquare className="h-6 w-6" />,
    },
    {
      title: 'Marketing Tools',
      description:
        'Create and manage property listings and marketing campaigns.',
      icon: <Globe className="h-6 w-6" />,
    },
    {
      title: 'Mobile Access',
      description: 'Access your business anytime, anywhere via mobile app.',
      icon: <Phone className="h-6 w-6" />,
    },
  ];

  const enhancedFaqs = [
    {
      question: 'How quickly can I get started?',
      answer:
        'You can start using our platform immediately after signing up. Our onboarding team will help you import your data and set up your account within 24-48 hours.',
    },
    {
      question: 'Can I manage multiple properties?',
      answer:
        "Yes, our system is designed to handle multiple properties with ease, whether you're managing residential, commercial, or mixed portfolios.",
    },
    {
      question: 'What kind of support do you provide?',
      answer:
        'We offer 24/7 customer support, regular training sessions, and a dedicated account manager for enterprise clients.',
    },
    {
      question: 'Is the system mobile-friendly?',
      answer:
        'Yes, our platform is fully responsive and comes with native mobile apps for iOS and Android.',
    },
    {
      question: 'Can I integrate with other tools?',
      answer:
        'Yes, we offer integration with popular real estate tools, CRM systems, and accounting software.',
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
          Real Estate Management Solutions
        </Badge>
        <h1 className="mb-4 text-center text-2xl font-bold tracking-tight text-balance md:text-4xl lg:text-6xl">
          <GradientHeadline>
            Transform Your Real Estate Business
          </GradientHeadline>
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
          Streamline your real estate operations, close more deals, and provide
          exceptional service with our comprehensive platform.
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
                ? '/media/marketing/realestate/realestate-dark.jpeg'
                : '/media/marketing/realestate/realestate-light.jpeg'
            }
            alt="Real Estate Management Interface"
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
            <Star className="h-12 w-12 text-primary" />
            <h2 className="text-2xl font-bold">
              Trusted by Leading Real Estate Professionals
            </h2>
            <p className="text-muted-foreground">
              Join thousands of real estate professionals who have transformed
              their business with our platform.
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
              <Home className="mb-4 h-8 w-8 text-primary" />
              <h3 className="mb-2 text-xl font-bold">
                Streamlined Property Management
              </h3>
              <p className="text-muted-foreground">
                Manage properties, tenants, and transactions all in one place
                with our intuitive platform.
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
            <Search className="mx-auto mb-4 h-8 w-8 text-primary" />
            <h3 className="mb-2 font-bold">Property Search</h3>
            <p className="text-sm text-muted-foreground">
              Advanced search with custom filters
            </p>
          </Card>
          <Card className="p-6 text-center">
            <Key className="mx-auto mb-4 h-8 w-8 text-primary" />
            <h3 className="mb-2 font-bold">Access Control</h3>
            <p className="text-sm text-muted-foreground">
              Secure role-based permissions
            </p>
          </Card>
          <Card className="p-6 text-center">
            <MapPin className="mx-auto mb-4 h-8 w-8 text-primary" />
            <h3 className="mb-2 font-bold">Location Analysis</h3>
            <p className="text-sm text-muted-foreground">
              Detailed area and market insights
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
                "This platform has revolutionized how we manage properties.
                We've seen dramatic improvements in efficiency and client
                satisfaction. It's been a game-changer for our business."
              </p>
              <p className="font-semibold">- Michael Chen</p>
              <p className="text-sm text-muted-foreground">
                Director, Premier Real Estate Group
              </p>
            </div>
            <div className="flex items-center justify-center bg-primary/5 p-8">
              <div className="grid gap-4 text-center">
                <div>
                  <div className="mb-2 text-3xl font-bold text-primary">
                    50%
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Time Saved
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-3xl font-bold text-primary">3x</div>
                  <div className="text-sm text-muted-foreground">
                    More Deals Closed
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-3xl font-bold text-primary">
                    95%
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Client Satisfaction
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
            Ready to Transform Your Real Estate Business?
          </h2>
          <p className="mx-auto mb-8 max-w-2xl text-muted-foreground">
            Join successful real estate professionals using our platform to grow
            their business and delight their clients.
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
