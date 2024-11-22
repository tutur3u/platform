'use client';

import { Badge } from '@repo/ui/components/ui/badge';
import { Card } from '@repo/ui/components/ui/card';
import {
  Check,
  CircleUser,
  Globe,
  Heart,
  Lightbulb,
  LineChart,
  Shield,
  Users,
} from 'lucide-react';

const values = [
  {
    title: 'Innovation',
    description:
      'Constantly pushing boundaries to create cutting-edge solutions that empower businesses.',
    icon: <Lightbulb className="h-6 w-6" />,
  },
  {
    title: 'Security',
    description:
      'Committed to protecting your data with enterprise-grade security measures.',
    icon: <Shield className="h-6 w-6" />,
  },
  {
    title: 'Community',
    description:
      'Building a vibrant community of users who support and inspire each other.',
    icon: <Users className="h-6 w-6" />,
  },
  {
    title: 'Global Impact',
    description:
      'Making powerful tools accessible to businesses around the world.',
    icon: <Globe className="h-6 w-6" />,
  },
  {
    title: 'User-Centric',
    description:
      'Designing with users in mind, prioritizing simplicity and efficiency.',
    icon: <CircleUser className="h-6 w-6" />,
  },
  {
    title: 'Passion',
    description:
      'Dedicated to helping businesses succeed through technology and innovation.',
    icon: <Heart className="h-6 w-6" />,
  },
];

const milestones = [
  {
    year: '2022',
    title: 'Foundation',
    description:
      'Started with a vision to simplify business operations, focusing on essential tools: finance management, task tracking, and calendar organization.',
  },
  {
    year: '2023',
    title: 'Open Source Revolution',
    description:
      'Made our entire platform open source, fostering transparency and collaborative innovation. Our community grew rapidly as developers worldwide contributed to our mission.',
  },
  {
    year: '2024',
    title: 'AI Integration & Expansion',
    description:
      'Launched comprehensive AI capabilities and expanded our product suite with intelligent automation, document processing, and advanced business management tools.',
  },
];

const stats = [
  {
    label: 'Team Members',
    value: '10+',
    description: 'Passionate innovators',
  },
  {
    label: 'Active Users',
    value: '100+',
    description: 'Growing community',
  },
  {
    label: 'GitHub Commits',
    value: '4,000+',
    description: 'Continuous development',
  },
  {
    label: 'Years',
    value: '2+',
    description: 'Of innovation',
  },
];

// Update achievements section
const achievements = [
  {
    title: 'Core Platform',
    items: [
      'Intuitive finance management',
      'Smart task organization',
      'Integrated calendar system',
      'Team collaboration tools',
    ],
  },
  {
    title: 'AI Innovation',
    items: [
      'Natural language processing',
      'Automated workflows',
      'Intelligent analytics',
      'Predictive insights',
    ],
  },
  {
    title: 'Community Impact',
    items: [
      'Open source leadership',
      'Developer community',
      'Regular contributions',
      'Transparent development',
    ],
  },
];

export default function AboutPage() {
  return (
    <div className="container mx-auto mt-8 flex max-w-6xl flex-col gap-6 px-3 py-16 lg:gap-14 lg:py-24">
      {/* Mission Section - Enhanced */}
      <div className="mb-16 text-center">
        <Badge variant="secondary" className="mb-4">
          Empowering Business Through Technology
        </Badge>
        <h1 className="mb-4 text-4xl font-bold">Our Mission</h1>
        <p className="text-muted-foreground mx-auto max-w-3xl text-lg leading-relaxed">
          Born from a vision to make life easier, Tuturuuu has evolved into a
          comprehensive business solution powered by artificial intelligence. We
          transform complex operations into seamless experiences, from finance
          and task management to advanced AI-driven automation.
        </p>
      </div>

      {/* Stats Section - Enhanced with descriptions */}
      <section className="mb-24">
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.label} className="p-6 text-center">
              <div className="text-3xl font-bold">{stat.value}</div>
              <div className="mt-2 font-semibold">{stat.label}</div>
              <div className="text-muted-foreground mt-1 text-sm">
                {stat.description}
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* New Achievements Section */}
      <section className="mb-24">
        <h2 className="mb-8 text-center text-3xl font-bold">
          Our Achievements
        </h2>
        <div className="grid gap-8 md:grid-cols-3">
          {achievements.map((achievement) => (
            <Card key={achievement.title} className="p-6">
              <h3 className="mb-4 text-xl font-semibold">
                {achievement.title}
              </h3>
              <ul className="space-y-3">
                {achievement.items.map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <Check className="text-primary h-4 w-4" />
                    <span className="text-muted-foreground">{item}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </section>

      {/* Journey Section - Enhanced with timeline visualization */}
      <section className="mb-24">
        <h2 className="mb-12 text-center text-3xl font-bold">Our Journey</h2>
        <div className="before:bg-border relative space-y-8 before:absolute before:left-16 before:top-0 before:h-full before:w-0.5 md:before:left-[12.5rem]">
          {milestones.map((milestone, index) => (
            <div
              key={index}
              className="flex flex-col gap-4 md:flex-row md:gap-8"
            >
              <div className="flex items-center md:w-52">
                <Badge
                  variant="outline"
                  className="before:bg-primary relative text-lg font-bold before:absolute before:right-[-2rem] before:top-1/2 before:h-2 before:w-2 before:rounded-full"
                >
                  {milestone.year}
                </Badge>
              </div>
              <Card className="ml-8 flex-1 p-6 md:ml-0">
                <h3 className="mb-2 text-xl font-semibold">
                  {milestone.title}
                </h3>
                <p className="text-muted-foreground">{milestone.description}</p>
              </Card>
            </div>
          ))}
        </div>
      </section>

      {/* Vision Section - Updated */}
      <section className="mb-24">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="mb-6 text-3xl font-bold">Our Vision</h2>
          <p className="text-muted-foreground mb-6 text-lg leading-relaxed">
            Tuturuuu aspires to be the leading force in the technology and AI
            landscape, driving innovation and shaping the future with our
            unwavering commitment to excellence. We strive to be the most
            trusted and sought-after partner for businesses and individuals
            seeking cutting-edge technology solutions.
          </p>
          <p className="text-muted-foreground text-lg leading-relaxed">
            We aim to democratize access to AI, making it accessible and
            beneficial for everyone, regardless of background or expertise.
          </p>
        </div>
      </section>

      {/* Purpose Section - New */}
      <section className="mb-24">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="mb-6 text-3xl font-bold">Our Purpose</h2>
          <p className="text-muted-foreground mb-6 text-lg leading-relaxed">
            Tuturuuu is a powerful tool for businesses and individuals, helping
            simplify everything and improve efficiency and quality of life. We
            believe in the transformative power of our solutions, designed to
            simplify complexities, enhance efficiency, and unlock new
            possibilities.
          </p>
          <p className="text-muted-foreground text-lg leading-relaxed">
            We are committed to developing ethical and responsible AI solutions
            that address real-world challenges and contribute to a better
            future.
          </p>
          <div className="mt-8">
            <Badge variant="outline" className="text-balance text-lg">
              To become the best technology company in the world, and make
              everyone's life easier.
            </Badge>
          </div>
        </div>
      </section>

      {/* Values Section - Updated styling */}
      <section className="mb-24">
        <h2 className="mb-8 text-center text-3xl font-bold">Our Values</h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {values.map((value) => (
            <Card key={value.title} className="p-6 transition hover:shadow-lg">
              <div className="mb-4 flex items-center gap-3">
                <div className="text-primary">{value.icon}</div>
                <h3 className="text-xl font-semibold">{value.title}</h3>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                {value.description}
              </p>
            </Card>
          ))}
        </div>
      </section>

      {/* Growth Section - New */}
      <section className="mb-24 grid gap-8 md:grid-cols-2">
        <div>
          <h2 className="mb-6 text-3xl font-bold">Continuous Growth</h2>
          <p className="text-muted-foreground mb-4 leading-relaxed">
            Our platform is continuously evolving, driven by user feedback and
            technological advancements. We're committed to staying at the
            forefront of innovation while maintaining the simplicity and
            reliability our users depend on.
          </p>
          <div className="flex items-center gap-2">
            <LineChart className="text-primary h-5 w-5" />
            <span className="font-medium">
              Consistent growth in user satisfaction and platform capabilities
            </span>
          </div>
        </div>
        <Card className="p-6">
          <h3 className="mb-4 text-xl font-semibold">
            2024 Roadmap Highlights
          </h3>
          <ul className="text-muted-foreground space-y-3">
            <li className="flex items-center gap-2">
              <Badge variant="outline">Q2</Badge>
              Enhanced AI capabilities and automation features
            </li>
            <li className="flex items-center gap-2">
              <Badge variant="outline">Q3</Badge>
              Advanced analytics and reporting tools
            </li>
            <li className="flex items-center gap-2">
              <Badge variant="outline">Q4</Badge>
              Enterprise-grade security enhancements
            </li>
          </ul>
        </Card>
      </section>

      {/* Updated Contact Section */}
      <section className="text-center">
        <h2 className="mb-4 text-2xl font-bold">Connect With Us</h2>
        <p className="text-muted-foreground mx-auto max-w-2xl">
          Whether you're interested in our platform, career opportunities, or
          partnership possibilities, we're always open to meaningful
          conversations that drive innovation forward.
        </p>
        <div className="mt-6 flex justify-center gap-4">
          <a
            href="mailto:contact@tuturuuu.com"
            className="text-primary hover:underline"
          >
            contact@tuturuuu.com
          </a>
          <span className="text-muted-foreground">•</span>
          <a
            href="https://github.com/tutur3u"
            className="text-primary hover:underline"
          >
            GitHub
          </a>
        </div>
      </section>
    </div>
  );
}
