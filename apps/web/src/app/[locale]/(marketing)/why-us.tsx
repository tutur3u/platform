'use client';

import { Badge } from '@ncthub/ui/badge';
import { Button } from '@ncthub/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@ncthub/ui/card';
import {
  ArrowRight,
  Calendar,
  Sparkles,
  Star,
  Target,
  Users,
} from '@ncthub/ui/icons';
import { motion } from 'framer-motion';

const reasons = [
  {
    title: 'SPECIAL EVENTS',
    icon: Calendar,
    description:
      'Events organized to support you in finding career paths in technology, gaining deeper insights from company trips and alumni, and joining coding competitions.',
    gradient: 'from-yellow-400 to-orange-500',
    features: [
      'Company Visits',
      'Coding Competitions',
      'Career Workshops',
      'Alumni Networks',
    ],
  },
  {
    title: 'NETWORKING',
    icon: Users,
    description:
      'Our network is the most valuable asset for our members. We connect you with the right people to help you achieve your goals.',
    gradient: 'from-blue-400 to-cyan-500',
    features: [
      'Industry Mentors',
      'Peer Connections',
      'Professional Growth',
      'Community Support',
    ],
  },
  {
    title: 'VISIONS',
    icon: Target,
    description:
      'We create an environment not only for SSET students but also others to learn new knowledge, have fun, and expand their network.',
    gradient: 'from-purple-400 to-pink-500',
    features: [
      'Inclusive Learning',
      'Knowledge Sharing',
      'Fun Activities',
      'Skill Development',
    ],
  },
];

export default function WhyUs() {
  return (
    <motion.div
      className="flex flex-col"
      initial={{ opacity: 0, y: 50 }}
      transition={{ duration: 1 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
    >
      {/* Hero Title */}
      <div className="mb-16 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          whileInView={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          viewport={{ once: true }}
          className="mb-6 inline-flex items-center gap-2"
        >
          <Sparkles className="h-8 w-8 text-yellow-400" />
          <Badge
            variant="outline"
            className="border-yellow-400/50 px-4 py-2 text-lg text-yellow-400"
          >
            Why Choose Us
          </Badge>
          <Sparkles className="h-8 w-8 text-yellow-400" />
        </motion.div>

        <h2 className="mb-4 bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-600 bg-clip-text text-4xl font-bold text-transparent md:text-6xl lg:text-8xl">
          Why us?
        </h2>

        <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
          Discover what makes NEO Culture Tech the perfect choice for your
          technology journey
        </p>
      </div>

      {/* Cards Grid */}
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
        {reasons.map((reason, index) => (
          <motion.div
            key={reason.title}
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: index * 0.2 }}
            viewport={{ once: true }}
            whileHover={{ scale: 1.02 }}
            className="group"
          >
            <Card className="h-full border-2 bg-gradient-to-br from-background/50 to-background shadow-lg backdrop-blur-sm transition-all duration-300 hover:border-primary/50 hover:shadow-xl">
              <CardHeader className="pb-4 text-center">
                {/* Icon with gradient background */}
                <div
                  className={`mx-auto mb-4 h-16 w-16 rounded-full bg-gradient-to-r ${reason.gradient} p-0.5`}
                >
                  <div className="flex h-full w-full items-center justify-center rounded-full bg-background">
                    <reason.icon className="h-8 w-8 text-foreground transition-transform duration-300 group-hover:scale-110" />
                  </div>
                </div>

                <CardTitle className="mb-2 text-xl font-bold md:text-2xl">
                  {reason.title}
                </CardTitle>

                <Badge
                  variant="secondary"
                  className={`bg-gradient-to-r ${reason.gradient} mb-4 border-0 text-white`}
                >
                  Premium Feature
                </Badge>
              </CardHeader>

              <CardContent className="pt-0">
                <CardDescription className="mb-6 text-base leading-relaxed">
                  {reason.description}
                </CardDescription>

                {/* Feature list */}
                <div className="mb-6 space-y-2">
                  {reason.features.map((feature, featureIndex) => (
                    <div key={featureIndex} className="flex items-center gap-2">
                      <Star className="h-4 w-4 fill-current text-yellow-400" />
                      <span className="text-sm text-muted-foreground">
                        {feature}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Call to action */}
                <Button
                  variant="outline"
                  className="w-full transition-all duration-300 group-hover:bg-primary group-hover:text-primary-foreground"
                >
                  Learn More
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Bottom CTA Section */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.5 }}
        viewport={{ once: true }}
        className="mt-16 text-center"
      >
        <Card className="mx-auto max-w-2xl border-primary/20 bg-gradient-to-r from-primary/10 to-secondary/10">
          <CardContent className="p-8">
            <h3 className="mb-4 text-2xl font-bold">
              Ready to Join Our Community?
            </h3>
            <p className="mb-6 text-muted-foreground">
              Experience the difference that makes NEO Culture Tech the premier
              choice for technology enthusiasts
            </p>
            <Button
              size="lg"
              className="bg-gradient-to-r from-yellow-400 to-yellow-600 text-black hover:from-yellow-500 hover:to-yellow-700"
            >
              Get Started Today
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
