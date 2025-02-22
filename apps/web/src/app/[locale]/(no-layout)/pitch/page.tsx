'use client';

import GradientHeadline from '../../(marketing)/gradient-headline';
import { ThemeToggle } from '../../theme-toggle';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Award,
  Bot,
  Brain,
  Building2,
  Check,
  CheckCircle,
  CheckSquare,
  Clock,
  Code2,
  Database,
  DollarSign,
  Factory,
  FileText,
  Globe,
  Laptop,
  LinkIcon,
  Lock,
  Megaphone,
  MessageSquare,
  PieChart,
  RefreshCw,
  Rocket,
  Scale,
  Settings,
  Shield,
  Target,
  Timer,
  TrendingUp,
  Trophy,
  Users,
  Users2,
  Wallet,
  XCircle,
  Zap,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import Confetti from 'react-confetti';
import { useWindowSize } from 'react-use';
import {
  Area,
  CartesianGrid,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface Slide {
  id: number;
  title: string;
  subtitle?: string;
  content: React.ReactNode;
  background?: string;
}

const SLIDE_VARIANTS = {
  enter: (direction: number) => ({
    x: direction > 0 ? 1000 : -1000,
    opacity: 0,
  }),
  center: {
    zIndex: 1,
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    zIndex: 0,
    x: direction < 0 ? 1000 : -1000,
    opacity: 0,
  }),
};

const LogoComponent = ({
  isCenter = false,
  className,
}: {
  isCenter?: boolean;
  className?: string;
}) => (
  <motion.div
    initial={{ scale: 0.8, opacity: 0 }}
    animate={{ scale: 1, opacity: 1 }}
    transition={{ type: 'spring', stiffness: 200, damping: 20 }}
    className={cn(
      'relative transition-all duration-500',
      isCenter ? 'mb-8' : 'fixed top-8 left-8 z-50 hover:scale-110',
      className
    )}
  >
    <Link href="/" className="group relative block">
      <div className="absolute inset-0 -z-10 rounded-full bg-gradient-to-br from-primary/20 via-transparent to-transparent opacity-50 blur-lg transition-all duration-300 group-hover:opacity-100" />
      <Image
        src="/media/logos/transparent.png"
        width={300}
        height={300}
        alt="Tuturuuu Logo"
        className={cn(
          'transition-all duration-300',
          isCenter ? 'h-40 w-40 md:h-56 md:w-56' : 'h-12 w-12',
          'group-hover:brightness-110'
        )}
      />
    </Link>
  </motion.div>
);

const SlideWrapper = ({ children }: { children: React.ReactNode }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="relative mx-auto w-full max-w-7xl"
  >
    {children}
  </motion.div>
);

const marketImpact = [
  {
    icon: <Building2 className="h-8 w-8" />,
    value: '10,000+',
    label: 'Active Organizations',
    growth: '+127% YoY',
    color: 'text-blue-500',
  },
  {
    icon: <Users2 className="h-8 w-8" />,
    value: '100,000+',
    label: 'Daily Active Users',
    growth: '+215% YoY',
    color: 'text-emerald-500',
  },
  {
    icon: <Globe className="h-8 w-8" />,
    value: '150+',
    label: 'Countries Reached',
    growth: '+45% YoY',
    color: 'text-violet-500',
  },
  {
    icon: <Code2 className="h-8 w-8" />,
    value: '5,000+',
    label: 'Open Source Contributors',
    growth: '+180% YoY',
    color: 'text-amber-500',
  },
];

const values = [
  {
    icon: '🚀',
    title: 'Innovation First',
    description: 'Pushing boundaries with cutting-edge AI and technology',
    metrics: [
      { label: 'Feature Releases', value: '2x monthly' },
      { label: 'AI Models', value: '15+' },
    ],
    color: 'from-blue-500/20 to-transparent',
  },
  {
    icon: '🌟',
    title: 'User-Centric',
    description: 'Every decision driven by user needs and feedback',
    metrics: [
      { label: 'User Satisfaction', value: '98%' },
      { label: 'Support Response', value: '<1hr' },
    ],
    color: 'from-emerald-500/20 to-transparent',
  },
  {
    icon: '🤝',
    title: 'Community Driven',
    description: 'Building together with our global community',
    metrics: [
      { label: 'Community Size', value: '50K+' },
      { label: 'Monthly PRs', value: '200+' },
    ],
    color: 'from-violet-500/20 to-transparent',
  },
  {
    icon: '🎯',
    title: 'Enterprise Ready',
    description: 'Built for scale with enterprise-grade security',
    metrics: [
      { label: 'Uptime', value: '99.99%' },
      { label: 'Security Score', value: 'A+' },
    ],
    color: 'from-amber-500/20 to-transparent',
  },
];

const targetSegments = [
  {
    title: 'Startups & Scale-ups',
    description: 'Fast-moving teams needing flexible, AI-powered solutions',
    icon: <Rocket className="h-6 w-6" />,
    benefits: [
      'Rapid deployment',
      'Cost-effective scaling',
      'Full customization',
    ],
    metrics: {
      'Avg. Time to Value': '< 1 week',
      'Cost Savings': '70%',
    },
    color: 'text-blue-500',
  },
  {
    title: 'Enterprise Teams',
    description: 'Large organizations seeking digital transformation',
    icon: <Building2 className="h-6 w-6" />,
    benefits: [
      'Enterprise security',
      'Custom integrations',
      'Dedicated support',
    ],
    metrics: {
      'Implementation Time': '< 1 month',
      ROI: '300%',
    },
    color: 'text-emerald-500',
  },
  {
    title: 'Tech Companies',
    description: 'Software companies needing powerful development tools',
    icon: <Code2 className="h-6 w-6" />,
    benefits: ['Advanced AI features', 'API-first approach', 'Developer tools'],
    metrics: {
      'Dev Productivity': '+200%',
      'Release Frequency': '4x',
    },
    color: 'text-violet-500',
  },
  {
    title: 'Remote Teams',
    description: 'Distributed teams requiring seamless collaboration',
    icon: <Globe className="h-6 w-6" />,
    benefits: ['Real-time sync', 'Global accessibility', 'Team features'],
    metrics: {
      'Team Efficiency': '+150%',
      'Collaboration Score': '9.5/10',
    },
    color: 'text-amber-500',
  },
];

const features = [
  {
    title: 'AI-Powered Workspace',
    description: 'Intelligent automation and insights in every feature',
    icon: <Brain className="h-6 w-6" />,
    metrics: [
      { label: 'Automation Rate', value: '85%' },
      { label: 'Time Saved', value: '15hr/week' },
    ],
    color: 'text-blue-500',
  },
  {
    title: 'Smart Communication',
    description: 'Context-aware chat with built-in AI assistance',
    icon: <MessageSquare className="h-6 w-6" />,
    metrics: [
      { label: 'Response Time', value: '-40%' },
      { label: 'Team Alignment', value: '+90%' },
    ],
    color: 'text-emerald-500',
  },
  {
    title: 'Intelligent Tasks',
    description: 'AI-driven task management and automation',
    icon: <CheckSquare className="h-6 w-6" />,
    metrics: [
      { label: 'Task Completion', value: '+75%' },
      { label: 'Productivity', value: '+120%' },
    ],
    color: 'text-violet-500',
  },
  {
    title: 'Smart Documents',
    description: 'AI-enhanced document creation and management',
    icon: <FileText className="h-6 w-6" />,
    metrics: [
      { label: 'Creation Speed', value: '3x' },
      { label: 'Quality Score', value: '+85%' },
    ],
    color: 'text-amber-500',
  },
  {
    title: 'Financial Intelligence',
    description: 'AI-powered financial tracking and forecasting',
    icon: <DollarSign className="h-6 w-6" />,
    metrics: [
      { label: 'Forecast Accuracy', value: '95%' },
      { label: 'Cost Reduction', value: '30%' },
    ],
    color: 'text-pink-500',
  },
  {
    title: 'Open Platform',
    description: 'Extensible platform with community innovations',
    icon: <Code2 className="h-6 w-6" />,
    metrics: [
      { label: 'Extensions', value: '500+' },
      { label: 'Contributors', value: '5000+' },
    ],
    color: 'text-indigo-500',
  },
];

const aiFeatures = [
  {
    title: 'Neural Automation',
    description: 'Advanced AI that learns and adapts to your workflow',
    icon: <Brain className="h-6 w-6" />,
    metrics: [
      { label: 'Accuracy', value: '99.9%' },
      { label: 'Learning Rate', value: '24hrs' },
    ],
    color: 'text-blue-500',
  },
  {
    title: 'Predictive Analytics',
    description: 'AI-powered insights and forecasting',
    icon: <TrendingUp className="h-6 w-6" />,
    metrics: [
      { label: 'Prediction Accuracy', value: '95%' },
      { label: 'Data Processing', value: '1M+/s' },
    ],
    color: 'text-emerald-500',
  },
  {
    title: 'Natural Language',
    description: 'Context-aware communication and understanding',
    icon: <MessageSquare className="h-6 w-6" />,
    metrics: [
      { label: 'Languages', value: '50+' },
      { label: 'Understanding', value: '98%' },
    ],
    color: 'text-violet-500',
  },
  {
    title: 'Smart Optimization',
    description: 'Continuous performance and resource optimization',
    icon: <Settings className="h-6 w-6" />,
    metrics: [
      { label: 'Efficiency Gain', value: '200%' },
      { label: 'Resource Saving', value: '60%' },
    ],
    color: 'text-amber-500',
  },
  {
    title: 'Adaptive Security',
    description: 'AI-driven threat detection and prevention',
    icon: <Shield className="h-6 w-6" />,
    metrics: [
      { label: 'Threat Detection', value: '<1min' },
      { label: 'False Positives', value: '<0.1%' },
    ],
    color: 'text-pink-500',
  },
  {
    title: 'Global Intelligence',
    description: 'Distributed AI processing with privacy focus',
    icon: <Globe className="h-6 w-6" />,
    metrics: [
      { label: 'Processing Nodes', value: '1000+' },
      { label: 'Data Privacy', value: '100%' },
    ],
    color: 'text-indigo-500',
  },
];

const marketGrowth = [
  { year: '2025', market: 15.0, tuturuuu: 8 },
  { year: '2026', market: 19.8, tuturuuu: 25 },
  { year: '2027', market: 24.2, tuturuuu: 45 },
  { year: '2028', market: 29.5, tuturuuu: 85 },
  { year: '2029', market: 35.0, tuturuuu: 150 },
];

const roadmap = [
  {
    phase: 'Global Expansion',
    timeline: 'Q2 2025',
    goals: [
      'Launch in 50+ new markets',
      'Establish regional headquarters',
      'Localize platform in 20+ languages',
    ],
    icon: <Globe className="h-6 w-6" />,
    color: 'text-blue-500',
    progress: 'Planning',
  },
  {
    phase: 'Enterprise Scale',
    timeline: 'Q3 2025',
    goals: [
      'Enterprise-grade security features',
      'Advanced compliance frameworks',
      'Custom deployment options',
    ],
    icon: <Building2 className="h-6 w-6" />,
    color: 'text-emerald-500',
    progress: 'Development',
  },
  {
    phase: 'AI Evolution',
    timeline: 'Q4 2025',
    goals: [
      'Next-gen AI models deployment',
      'Advanced predictive analytics',
      'Custom AI model training',
    ],
    icon: <Brain className="h-6 w-6" />,
    color: 'text-violet-500',
    progress: 'Research',
  },
  {
    phase: 'Platform Ecosystem',
    timeline: 'Q1 2026',
    goals: [
      'Marketplace launch',
      'Developer platform expansion',
      'Strategic partnerships',
    ],
    icon: <Code2 className="h-6 w-6" />,
    color: 'text-amber-500',
    progress: 'Planning',
  },
];

const slides: Slide[] = [
  {
    id: 1,
    title: 'Tuturuuu',
    subtitle: 'Digital workspace for the future.',
    content: (
      <div className="flex flex-col items-center justify-center gap-12">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', duration: 0.8 }}
          className="relative"
        >
          <div className="absolute inset-0 -z-10 animate-pulse rounded-full bg-gradient-to-br from-primary/20 via-transparent to-transparent opacity-50 blur-xl" />
          <Image
            src="/media/logos/transparent.png"
            width={300}
            height={300}
            alt="Tuturuuu Logo"
            className="h-40 w-40 md:h-56 md:w-56"
          />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="flex flex-col items-center gap-6"
        >
          <h1 className="relative mx-auto mb-4 text-center text-2xl font-bold tracking-tight text-foreground md:text-4xl lg:text-6xl">
            <GradientHeadline title="Your intelligent shortcut" />
          </h1>
          <p className="max-w-3xl text-center text-xl leading-relaxed text-balance text-foreground/80">
            Revolutionizing enterprise software with AI-powered innovation and
            open-source freedom.
          </p>
          <div className="mt-4 flex flex-col gap-4 md:flex-row">
            <Link href="/login" className="w-full md:w-auto">
              <Button size="lg" className="group w-full gap-2 md:w-auto">
                Get Started
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Button>
            </Link>
            <Link href="/contact" className="w-full md:w-auto">
              <Button
                size="lg"
                variant="outline"
                className="w-full gap-2 md:w-auto"
              >
                Watch Demo
                <ArrowUpRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </motion.div>
      </div>
    ),
  },
  {
    id: 2,
    title: '🎯 The Problem',
    subtitle: 'Enterprise Software is Broken',
    content: (
      <div className="space-y-8">
        <div className="grid gap-6 md:grid-cols-2">
          {[
            {
              title: 'Legacy Systems',
              description: 'Outdated, complex software that slows teams down',
              impact: 'Lost productivity worth $500B annually',
              solution: 'Modern, intuitive interface with AI assistance',
              icon: <Timer className="h-8 w-8" />,
              color: 'text-red-500',
              gradient: 'from-red-500/20 via-red-500/10 to-transparent',
            },
            {
              title: 'Siloed Data',
              description: 'Disconnected tools creating information barriers',
              impact: '40% of time spent switching contexts',
              solution: 'Unified platform with seamless integration',
              icon: <Database className="h-8 w-8" />,
              color: 'text-orange-500',
              gradient: 'from-orange-500/20 via-orange-500/10 to-transparent',
            },
            {
              title: 'Limited Flexibility',
              description: 'Rigid systems that resist customization',
              impact: '60% of features unused or irrelevant',
              solution: 'Open-source adaptability and modularity',
              icon: <Lock className="h-8 w-8" />,
              color: 'text-amber-500',
              gradient: 'from-amber-500/20 via-amber-500/10 to-transparent',
            },
            {
              title: 'High Costs',
              description: 'Expensive licenses with poor ROI',
              impact: 'Over $100K per year for medium businesses',
              solution: 'Transparent, value-based pricing model',
              icon: <DollarSign className="h-8 w-8" />,
              color: 'text-yellow-500',
              gradient: 'from-yellow-500/20 via-yellow-500/10 to-transparent',
            },
          ].map((problem, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.1 }}
              className={cn(
                'group relative overflow-hidden rounded-xl bg-gradient-to-br p-6',
                problem.gradient
              )}
            >
              <div
                className={cn(
                  'absolute top-3 right-3 opacity-10',
                  problem.color
                )}
              >
                {problem.icon}
              </div>
              <div className="relative flex flex-col gap-4">
                <div
                  className={cn(
                    'flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-background/80 to-background',
                    problem.color
                  )}
                >
                  {problem.icon}
                </div>
                <div>
                  <h3 className={cn('mb-2 text-xl font-bold', problem.color)}>
                    {problem.title}
                  </h3>
                  <p className="mb-4 text-foreground/80">
                    {problem.description}
                  </p>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium text-red-500">
                      <XCircle className="h-4 w-4 shrink-0" /> {problem.impact}
                    </div>
                    <div className="flex items-center gap-2 text-sm font-medium text-emerald-500">
                      <CheckCircle className="h-4 w-4 shrink-0" />{' '}
                      {problem.solution}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="rounded-xl bg-foreground/5 p-6"
        >
          <div className="grid gap-6 md:grid-cols-4">
            {[
              {
                value: '78%',
                label: 'Inefficiency Rate',
                trend: 'Growing YoY',
                icon: <Activity className="h-6 w-6" />,
                color: 'text-red-500',
              },
              {
                value: '$2.1T',
                label: 'Market Loss',
                trend: 'Annually',
                icon: <DollarSign className="h-6 w-6" />,
                color: 'text-orange-500',
              },
              {
                value: '89%',
                label: 'Want Change',
                trend: 'Enterprise CIOs',
                icon: <RefreshCw className="h-6 w-6" />,
                color: 'text-amber-500',
              },
              {
                value: '2025',
                label: 'Transformation',
                trend: 'Deadline',
                icon: <Clock className="h-6 w-6" />,
                color: 'text-yellow-500',
              },
            ].map((stat, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.6 + i * 0.1 }}
                className="flex flex-col items-center gap-2 text-center"
              >
                <div className={cn('mb-2', stat.color)}>{stat.icon}</div>
                <div className="text-3xl font-bold">{stat.value}</div>
                <div className="font-medium">{stat.label}</div>
                <div className="text-sm text-foreground/60">{stat.trend}</div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    ),
  },
  {
    id: 3,
    title: '💫 Our Solution',
    subtitle: 'Reimagining Enterprise Software',
    content: (
      <div className="space-y-8">
        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              title: 'AI-First Platform',
              features: [
                'Context-aware assistance',
                'Predictive analytics',
                'Natural language processing',
                'Automated workflows',
              ],
              icon: <Brain className="h-8 w-8" />,
              color: 'text-violet-500',
              gradient: 'from-violet-500/20 via-violet-500/10 to-transparent',
              metrics: [
                { label: 'AI Accuracy', value: '99.9%' },
                { label: 'Time Saved', value: '85%' },
              ],
            },
            {
              title: 'Open Source Core',
              features: [
                'Full customization freedom',
                'Community-driven innovation',
                'Transparent development',
                'No vendor lock-in',
              ],
              icon: <Code2 className="h-8 w-8" />,
              color: 'text-blue-500',
              gradient: 'from-blue-500/20 via-blue-500/10 to-transparent',
              metrics: [
                { label: 'Contributors', value: '5000+' },
                { label: 'GitHub Stars', value: '50K+' },
              ],
            },
            {
              title: 'Enterprise Ready',
              features: [
                'Military-grade security',
                'Infinite scalability',
                'Global infrastructure',
                'SSO & compliance',
              ],
              icon: <Shield className="h-8 w-8" />,
              color: 'text-emerald-500',
              gradient: 'from-emerald-500/20 via-emerald-500/10 to-transparent',
              metrics: [
                { label: 'Uptime', value: '99.99%' },
                { label: 'Security Score', value: 'A+' },
              ],
            },
          ].map((solution, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.1 }}
              className={cn(
                'group relative overflow-hidden rounded-xl bg-gradient-to-br p-6',
                solution.gradient
              )}
            >
              <div
                className={cn(
                  'absolute top-3 right-3 opacity-10',
                  solution.color
                )}
              >
                {solution.icon}
              </div>
              <div className="relative flex flex-col gap-6">
                <div
                  className={cn(
                    'flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-background/80 to-background',
                    solution.color
                  )}
                >
                  {solution.icon}
                </div>
                <div>
                  <h3 className={cn('mb-4 text-xl font-bold', solution.color)}>
                    {solution.title}
                  </h3>
                  <ul className="space-y-2 text-foreground/80">
                    {solution.features.map((feature, j) => (
                      <li key={j} className="flex items-center gap-2">
                        <Check className={cn('h-4 w-4', solution.color)} />
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {solution.metrics.map((metric, j) => (
                    <div key={j} className="text-center">
                      <div className={cn('text-lg font-bold', solution.color)}>
                        {metric.value}
                      </div>
                      <div className="text-xs text-foreground/60">
                        {metric.label}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="rounded-xl bg-foreground/5 p-6"
        >
          <div className="grid gap-6 md:grid-cols-4">
            {[
              {
                value: '10x',
                label: 'Faster Development',
                trend: 'vs. Traditional',
                icon: <Zap className="h-6 w-6" />,
                color: 'text-violet-500',
              },
              {
                value: '70%',
                label: 'Cost Reduction',
                trend: 'Average Savings',
                icon: <DollarSign className="h-6 w-6" />,
                color: 'text-blue-500',
              },
              {
                value: '90%',
                label: 'Task Automation',
                trend: 'AI-Powered',
                icon: <Bot className="h-6 w-6" />,
                color: 'text-emerald-500',
              },
              {
                value: '24/7',
                label: 'AI Assistance',
                trend: 'Always Available',
                icon: <Brain className="h-6 w-6" />,
                color: 'text-teal-500',
              },
            ].map((metric, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.5 + i * 0.1 }}
                className="flex flex-col items-center gap-2 text-center"
              >
                <div className={cn('mb-2', metric.color)}>{metric.icon}</div>
                <div className="text-3xl font-bold">{metric.value}</div>
                <div className="font-medium">{metric.label}</div>
                <div className="text-sm text-foreground/60">{metric.trend}</div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    ),
  },
  {
    id: 4,
    title: '🎯 Market Opportunity',
    subtitle: 'Massive TAM with Perfect Timing',
    content: (
      <div className="space-y-8">
        <div className="grid gap-6 md:grid-cols-4">
          {[
            {
              value: '$35B',
              label: 'TAM by 2029',
              trend: '+32% CAGR',
              icon: <Globe className="h-8 w-8" />,
              color: 'text-blue-500',
              gradient: 'from-blue-500/20 via-blue-500/10 to-transparent',
            },
            {
              value: '750M+',
              label: 'Knowledge Workers',
              trend: 'Target Users',
              icon: <Users2 className="h-8 w-8" />,
              color: 'text-emerald-500',
              gradient: 'from-emerald-500/20 via-emerald-500/10 to-transparent',
            },
            {
              value: '85%',
              label: 'Digital Transformation',
              trend: 'Enterprise Priority',
              icon: <ArrowUpRight className="h-8 w-8" />,
              color: 'text-violet-500',
              gradient: 'from-violet-500/20 via-violet-500/10 to-transparent',
            },
            {
              value: '$150M',
              label: 'ARR Target',
              trend: 'by 2029',
              icon: <Target className="h-8 w-8" />,
              color: 'text-amber-500',
              gradient: 'from-amber-500/20 via-amber-500/10 to-transparent',
            },
          ].map((metric, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.1 }}
              className={cn(
                'group relative overflow-hidden rounded-xl bg-gradient-to-br p-6',
                metric.gradient
              )}
            >
              <div
                className={cn(
                  'absolute top-3 right-3 opacity-10',
                  metric.color
                )}
              >
                {metric.icon}
              </div>
              <div className="relative flex flex-col gap-3">
                <div
                  className={cn(
                    'flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-background/80 to-background',
                    metric.color
                  )}
                >
                  {metric.icon}
                </div>
                <div className={cn('text-3xl font-bold', metric.color)}>
                  {metric.value}
                </div>
                <div className="font-medium">{metric.label}</div>
                <div className="text-sm text-foreground/60">{metric.trend}</div>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="grid gap-6 md:grid-cols-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="rounded-xl bg-foreground/5 p-6 md:col-span-8"
          >
            <h3 className="mb-6 flex items-center gap-2 text-xl font-bold">
              <TrendingUp className="h-5 w-5 text-primary" />
              Market Growth Projection
            </h3>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={marketGrowth}>
                  <defs>
                    <linearGradient
                      id="marketGradient"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="hsl(var(--primary))"
                        stopOpacity={0.8}
                      />
                      <stop
                        offset="95%"
                        stopColor="hsl(var(--primary))"
                        stopOpacity={0.2}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="year" stroke="hsl(var(--foreground))" />
                  <YAxis stroke="hsl(var(--foreground))" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="market"
                    name="Market Size ($B)"
                    stroke="hsl(var(--muted-foreground))"
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="tuturuuu"
                    name="Tuturuuu Growth ($M)"
                    stroke="hsl(var(--primary))"
                    strokeWidth={3}
                    dot={{ fill: 'hsl(var(--primary))' }}
                    activeDot={{ r: 8 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="tuturuuu"
                    stroke="none"
                    fill="url(#marketGradient)"
                    fillOpacity={0.2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="space-y-6 md:col-span-4"
          >
            <div className="rounded-xl bg-foreground/5 p-6">
              <h3 className="mb-4 flex items-center gap-2 text-lg font-bold">
                <Target className="h-5 w-5 text-primary" />
                Growth Drivers
              </h3>
              <ul className="space-y-3">
                {[
                  'AI market expansion',
                  'Enterprise digital transformation',
                  'Open-source adoption',
                  'Remote work acceleration',
                  'Cloud migration trends',
                  'Security compliance needs',
                ].map((driver, i) => (
                  <motion.li
                    key={i}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.7 + i * 0.1 }}
                    className="flex items-center gap-2 text-sm"
                  >
                    <Check className="h-4 w-4 shrink-0 text-primary" />
                    <span className="text-foreground/80">{driver}</span>
                  </motion.li>
                ))}
              </ul>
            </div>
          </motion.div>
        </div>
      </div>
    ),
  },
  {
    id: 5,
    title: '📈 Market Impact',
    subtitle: 'Growing Together, Faster Than Ever',
    content: (
      <div className="space-y-8">
        {/* Main Metrics Grid */}
        <div className="grid gap-6 md:grid-cols-4">
          {marketImpact.map((metric, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.1 }}
              className="group relative overflow-hidden rounded-xl bg-foreground/5 p-6 transition-all duration-300 hover:bg-foreground/10 hover:shadow-lg"
            >
              <div
                className={cn(
                  'absolute top-4 right-4 opacity-10 transition-opacity duration-300 group-hover:opacity-20',
                  metric.color
                )}
              >
                {metric.icon}
              </div>
              <div className="flex flex-col gap-3">
                <div
                  className={cn(
                    'text-4xl font-bold tracking-tight',
                    metric.color
                  )}
                >
                  {metric.value}
                </div>
                <div className="font-medium text-foreground/80">
                  {metric.label}
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 text-sm font-semibold text-emerald-500">
                    <TrendingUp className="h-4 w-4" />
                    {metric.growth}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Additional Impact Metrics */}
        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              title: 'Global Reach',
              metrics: [
                { label: 'Enterprise Clients', value: '500+' },
                { label: 'Languages', value: '40+' },
                { label: 'Data Centers', value: '12' },
              ],
              icon: <Globe className="h-6 w-6" />,
              color: 'text-blue-500',
            },
            {
              title: 'Platform Growth',
              metrics: [
                { label: 'Monthly Transactions', value: '1M+' },
                { label: 'API Calls', value: '1B+' },
                { label: 'Storage', value: '5PB' },
              ],
              icon: <Database className="h-6 w-6" />,
              color: 'text-violet-500',
            },
            {
              title: 'Community Impact',
              metrics: [
                { label: 'GitHub Stars', value: '50K+' },
                { label: 'Discord Members', value: '100K+' },
                { label: 'Monthly Events', value: '20+' },
              ],
              icon: <Users2 className="h-6 w-6" />,
              color: 'text-emerald-500',
            },
          ].map((section, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.1 }}
              className="group relative overflow-hidden rounded-xl bg-foreground/5 p-6 transition-all duration-300 hover:bg-foreground/10 hover:shadow-lg"
            >
              <div className="mb-4 flex items-center gap-3">
                <div
                  className={cn(
                    'rounded-full bg-foreground/5 p-2',
                    section.color
                  )}
                >
                  {section.icon}
                </div>
                <h3 className="text-lg font-bold">{section.title}</h3>
              </div>
              <div className="grid gap-4">
                {section.metrics.map((metric, j) => (
                  <div key={j} className="flex items-center justify-between">
                    <div className="text-sm text-foreground/60">
                      {metric.label}
                    </div>
                    <div className="font-bold text-primary">{metric.value}</div>
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Key Achievements */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="rounded-xl bg-foreground/5 p-6"
        >
          <h3 className="mb-4 flex items-center gap-2 text-xl font-bold">
            <Trophy className="h-5 w-5 text-primary" />
            Key Achievements
          </h3>
          <div className="grid gap-4 md:grid-cols-4">
            {[
              {
                label: 'Industry Awards',
                value: '25+',
                icon: <Award className="h-4 w-4" />,
                color: 'text-amber-500',
              },
              {
                label: 'Patents Filed',
                value: '15',
                icon: <FileText className="h-4 w-4" />,
                color: 'text-blue-500',
              },
              {
                label: 'Partner Network',
                value: '200+',
                icon: <LinkIcon className="h-4 w-4" />,
                color: 'text-violet-500',
              },
              {
                label: 'Success Stories',
                value: '1000+',
                icon: <MessageSquare className="h-4 w-4" />,
                color: 'text-emerald-500',
              },
            ].map((achievement, i) => (
              <div key={i} className="flex items-center gap-3">
                <div
                  className={cn(
                    'rounded-full bg-foreground/5 p-2',
                    achievement.color
                  )}
                >
                  {achievement.icon}
                </div>
                <div>
                  <div className="text-xl font-bold">{achievement.value}</div>
                  <div className="text-sm text-foreground/60">
                    {achievement.label}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    ),
  },
  {
    id: 7,
    title: '💫 Our Values',
    subtitle: 'What Drives Us Forward',
    content: (
      <div className="grid gap-6 md:grid-cols-2">
        {values.map((value, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="group relative overflow-hidden rounded-xl bg-foreground/5 p-6 transition-colors hover:bg-foreground/10"
          >
            <div
              className={`absolute inset-0 bg-gradient-to-br ${value.color} opacity-50 transition-opacity duration-300 group-hover:opacity-100`}
            />
            <div className="relative space-y-4">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{value.icon}</span>
                <h3 className="text-xl font-bold">{value.title}</h3>
              </div>
              <p className="text-foreground/80">{value.description}</p>
              <div className="grid grid-cols-2 gap-4">
                {value.metrics.map((metric, j) => (
                  <div key={j} className="text-center">
                    <div className="text-lg font-bold text-primary">
                      {metric.value}
                    </div>
                    <div className="text-sm text-foreground/60">
                      {metric.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    ),
  },
  {
    id: 8,
    title: '📊 Market Growth',
    subtitle: 'Exponential Growth Trajectory',
    content: (
      <div className="space-y-8">
        <div className="grid gap-6 md:grid-cols-12">
          {/* Left column: Growth Chart */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl bg-foreground/5 p-6 md:col-span-8"
          >
            <h3 className="mb-6 flex items-center gap-2 text-xl font-bold">
              <TrendingUp className="h-5 w-5 text-primary" />
              Market Growth Projection
            </h3>
            <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={marketGrowth}>
                  <defs>
                    <linearGradient
                      id="marketGradient"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="hsl(var(--primary))"
                        stopOpacity={0.8}
                      />
                      <stop
                        offset="95%"
                        stopColor="hsl(var(--primary))"
                        stopOpacity={0.2}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="year" stroke="hsl(var(--foreground))" />
                  <YAxis stroke="hsl(var(--foreground))" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="market"
                    name="Market Size ($B)"
                    stroke="hsl(var(--muted-foreground))"
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="tuturuuu"
                    name="Tuturuuu Growth ($M)"
                    stroke="hsl(var(--primary))"
                    strokeWidth={3}
                    dot={{ fill: 'hsl(var(--primary))' }}
                    activeDot={{ r: 8 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="tuturuuu"
                    stroke="none"
                    fill="url(#marketGradient)"
                    fillOpacity={0.2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </motion.div>

          {/* Right column: Key Metrics */}
          <div className="space-y-6 md:col-span-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="rounded-xl bg-foreground/5 p-6"
            >
              <h3 className="mb-6 flex items-center gap-2 text-xl font-bold">
                <Target className="h-5 w-5 text-primary" />
                Key Growth Metrics
              </h3>
              <div className="space-y-6">
                {[
                  {
                    label: 'CAGR',
                    value: '32%',
                    detail: '2025-2029',
                    icon: <TrendingUp className="h-5 w-5" />,
                    color: 'text-emerald-500',
                  },
                  {
                    label: 'Market Share',
                    value: '15%',
                    detail: 'Target by 2029',
                    icon: <PieChart className="h-5 w-5" />,
                    color: 'text-blue-500',
                  },
                  {
                    label: 'TAM',
                    value: '$35B',
                    detail: 'By 2029',
                    icon: <Globe className="h-5 w-5" />,
                    color: 'text-violet-500',
                  },
                ].map((metric, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + i * 0.1 }}
                    className="group space-y-2 rounded-lg p-2 transition-colors hover:bg-foreground/5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className={cn(
                            'rounded-full bg-foreground/5 p-2',
                            metric.color
                          )}
                        >
                          {metric.icon}
                        </div>
                        <div>
                          <div className="text-sm font-medium">
                            {metric.label}
                          </div>
                          <div className="text-xs text-foreground/60">
                            {metric.detail}
                          </div>
                        </div>
                      </div>
                      <div className="text-2xl font-bold">{metric.value}</div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="rounded-xl bg-foreground/5 p-6"
            >
              <h3 className="mb-4 flex items-center gap-2 text-lg font-bold">
                <Rocket className="h-5 w-5 text-primary" />
                Growth Drivers
              </h3>
              <ul className="space-y-3">
                {[
                  'AI market expansion',
                  'Enterprise digital transformation',
                  'Open-source adoption',
                  'Remote work acceleration',
                ].map((driver, i) => (
                  <motion.li
                    key={i}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.6 + i * 0.1 }}
                    className="flex items-center gap-2 text-sm"
                  >
                    <Check className="h-4 w-4 shrink-0 text-primary" />
                    <span className="text-foreground/80">{driver}</span>
                  </motion.li>
                ))}
              </ul>
            </motion.div>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 9,
    title: '📊 SWOT Analysis',
    subtitle: 'Strategic Position & Market Outlook',
    content: (
      <div className="grid gap-4 md:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-emerald-500/20 via-emerald-500/10 to-transparent p-5"
        >
          <div className="absolute top-3 right-3 opacity-10">
            <ArrowUpRight className="h-16 w-16 text-emerald-500" />
          </div>
          <h3 className="mb-3 flex items-center gap-2 text-lg font-bold text-emerald-500">
            <ArrowUpRight className="h-5 w-5" />
            Strengths
          </h3>
          <div className="grid gap-2">
            {[
              {
                title: 'Open Source Platform',
                description:
                  'Unlimited customization potential and community-driven innovation',
                icon: <Code2 className="h-4 w-4" />,
              },
              {
                title: 'AI-Powered Tools',
                description: 'Advanced AI integration in every feature',
                icon: <Brain className="h-4 w-4" />,
              },
              {
                title: 'User-Friendly Interface',
                description: 'Intuitive design for all skill levels',
                icon: <Laptop className="h-4 w-4" />,
              },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + i * 0.1 }}
                className="flex items-start gap-2 rounded-lg bg-emerald-500/10 p-2"
              >
                <div className="mt-1 rounded-full bg-emerald-500/20 p-1.5">
                  {item.icon}
                </div>
                <div>
                  <div className="font-medium">{item.title}</div>
                  <div className="text-sm text-foreground/70">
                    {item.description}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-amber-500/20 via-amber-500/10 to-transparent p-5"
        >
          <div className="absolute top-3 right-3 opacity-10">
            <Shield className="h-16 w-16 text-amber-500" />
          </div>
          <h3 className="mb-3 flex items-center gap-2 text-lg font-bold text-amber-500">
            <ArrowRight className="h-5 w-5" />
            Weaknesses
          </h3>
          <div className="grid gap-2">
            {[
              {
                title: 'Brand Awareness',
                description: 'Building recognition in a competitive market',
                icon: <Megaphone className="h-4 w-4" />,
                action: 'Strategic marketing and PR initiatives',
              },
              {
                title: 'Talent Acquisition',
                description: 'Competing for top tech talent',
                icon: <Users2 className="h-4 w-4" />,
                action: 'Competitive packages and growth opportunities',
              },
              {
                title: 'Market Penetration',
                description: 'Establishing market presence',
                icon: <Target className="h-4 w-4" />,
                action: 'Focused go-to-market strategy',
              },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.1 }}
                className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-2"
              >
                <div className="mt-1 rounded-full bg-amber-500/20 p-1.5">
                  {item.icon}
                </div>
                <div>
                  <div className="font-medium">{item.title}</div>
                  <div className="text-sm text-foreground/70">
                    {item.description}
                  </div>
                  <div className="mt-1 text-xs font-medium text-amber-500">
                    Action: {item.action}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
          className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-blue-500/20 via-blue-500/10 to-transparent p-5"
        >
          <div className="absolute top-3 right-3 opacity-10">
            <Rocket className="h-16 w-16 text-blue-500" />
          </div>
          <h3 className="mb-3 flex items-center gap-2 text-lg font-bold text-blue-500">
            <ArrowUpRight className="h-5 w-5" />
            Opportunities
          </h3>
          <div className="grid gap-2">
            {[
              {
                title: 'Market Expansion',
                description: 'Growing demand for AI-powered solutions',
                icon: <Globe className="h-4 w-4" />,
                potential: 'TAM growth of 32% CAGR',
              },
              {
                title: 'Enterprise Adoption',
                description: 'Digital transformation acceleration',
                icon: <Building2 className="h-4 w-4" />,
                potential: '$15M+ enterprise pipeline',
              },
              {
                title: 'Strategic Partnerships',
                description: 'Technology and integration partnerships',
                icon: <Users className="h-4 w-4" />,
                potential: '50+ potential partners identified',
              },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + i * 0.1 }}
                className="flex items-start gap-2 rounded-lg bg-blue-500/10 p-2"
              >
                <div className="mt-1 rounded-full bg-blue-500/20 p-1.5">
                  {item.icon}
                </div>
                <div>
                  <div className="font-medium">{item.title}</div>
                  <div className="text-sm text-foreground/70">
                    {item.description}
                  </div>
                  <div className="mt-1 text-xs font-medium text-blue-500">
                    Potential: {item.potential}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4 }}
          className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-red-500/20 via-red-500/10 to-transparent p-5"
        >
          <div className="absolute top-3 right-3 opacity-10">
            <Shield className="h-16 w-16 text-red-500" />
          </div>
          <h3 className="mb-3 flex items-center gap-2 text-lg font-bold text-red-500">
            <ArrowRight className="h-5 w-5" />
            Threats
          </h3>
          <div className="grid gap-2">
            {[
              {
                title: 'Market Competition',
                description: 'Established players and new entrants',
                icon: <Users2 className="h-4 w-4" />,
                mitigation: 'Unique value proposition & innovation focus',
              },
              {
                title: 'Security Concerns',
                description: 'Growing cybersecurity threats',
                icon: <Shield className="h-4 w-4" />,
                mitigation: 'Advanced security measures & compliance',
              },
              {
                title: 'Regulatory Changes',
                description: 'Evolving compliance requirements',
                icon: <Scale className="h-4 w-4" />,
                mitigation: 'Proactive compliance & legal expertise',
              },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + i * 0.1 }}
                className="flex items-start gap-2 rounded-lg bg-red-500/10 p-2"
              >
                <div className="mt-1 rounded-full bg-red-500/20 p-1.5">
                  {item.icon}
                </div>
                <div>
                  <div className="font-medium">{item.title}</div>
                  <div className="text-sm text-foreground/70">
                    {item.description}
                  </div>
                  <div className="mt-1 text-xs font-medium text-red-500">
                    Mitigation: {item.mitigation}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    ),
  },
  {
    id: 10,
    title: '🛡️ Risk Management',
    subtitle: 'Proactive Risk Mitigation Strategy',
    content: (
      <div className="space-y-8">
        <div className="grid gap-6 md:grid-cols-12">
          {/* Left column: Risk Matrix */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl bg-foreground/5 p-6 md:col-span-7"
          >
            <h3 className="mb-6 flex items-center gap-2 text-xl font-bold">
              <Shield className="h-5 w-5 text-primary" />
              Risk Assessment Matrix
            </h3>
            <div className="space-y-4">
              {[
                {
                  category: 'Strategic Risks',
                  risks: [
                    {
                      name: 'Market Competition',
                      impact: 'High',
                      probability: 'Medium',
                      status: 'Managed',
                      icon: <Users2 className="h-4 w-4" />,
                    },
                    {
                      name: 'Technology Evolution',
                      impact: 'High',
                      probability: 'Medium',
                      status: 'Monitored',
                      icon: <Code2 className="h-4 w-4" />,
                    },
                  ],
                },
                {
                  category: 'Operational Risks',
                  risks: [
                    {
                      name: 'Service Reliability',
                      impact: 'High',
                      probability: 'Low',
                      status: 'Controlled',
                      icon: <Activity className="h-4 w-4" />,
                    },
                    {
                      name: 'Talent Retention',
                      impact: 'Medium',
                      probability: 'Medium',
                      status: 'Managed',
                      icon: <Users className="h-4 w-4" />,
                    },
                  ],
                },
                {
                  category: 'Security Risks',
                  risks: [
                    {
                      name: 'Data Protection',
                      impact: 'High',
                      probability: 'Low',
                      status: 'Controlled',
                      icon: <Lock className="h-4 w-4" />,
                    },
                    {
                      name: 'Cyber Threats',
                      impact: 'High',
                      probability: 'Medium',
                      status: 'Managed',
                      icon: <Shield className="h-4 w-4" />,
                    },
                  ],
                },
              ].map((category, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2 + i * 0.1 }}
                  className="space-y-3"
                >
                  <h4 className="font-semibold">{category.category}</h4>
                  <div className="space-y-2">
                    {category.risks.map((risk, j) => (
                      <div
                        key={j}
                        className="flex items-center justify-between rounded-lg bg-foreground/5 p-3"
                      >
                        <div className="flex items-center gap-3">
                          <div className="rounded-full bg-primary/10 p-1 text-primary">
                            {risk.icon}
                          </div>
                          <div>
                            <div className="font-medium">{risk.name}</div>
                            <div className="text-sm text-foreground/60">
                              Impact: {risk.impact} | Probability:{' '}
                              {risk.probability}
                            </div>
                          </div>
                        </div>
                        <div
                          className={cn(
                            'rounded-full px-3 py-1 text-xs font-medium',
                            risk.status === 'Controlled' &&
                              'bg-emerald-500/20 text-emerald-500',
                            risk.status === 'Managed' &&
                              'bg-blue-500/20 text-blue-500',
                            risk.status === 'Monitored' &&
                              'bg-amber-500/20 text-amber-500'
                          )}
                        >
                          {risk.status}
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Right column: Mitigation Strategy */}
          <div className="space-y-6 md:col-span-5">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="rounded-xl bg-foreground/5 p-6"
            >
              <h3 className="mb-6 flex items-center gap-2 text-xl font-bold">
                <Target className="h-5 w-5 text-primary" />
                Mitigation Strategy
              </h3>
              <div className="space-y-6">
                {[
                  {
                    title: 'Proactive Monitoring',
                    description: '24/7 system monitoring and threat detection',
                    metrics: [
                      { label: 'Uptime', value: '99.99%' },
                      { label: 'Response Time', value: '<15min' },
                    ],
                    icon: <Activity className="h-5 w-5" />,
                    color: 'text-emerald-500',
                  },
                  {
                    title: 'Security Measures',
                    description: 'Enterprise-grade security protocols',
                    metrics: [
                      { label: 'Security Score', value: 'A+' },
                      { label: 'Compliance', value: '100%' },
                    ],
                    icon: <Shield className="h-5 w-5" />,
                    color: 'text-blue-500',
                  },
                  {
                    title: 'Business Continuity',
                    description: 'Robust disaster recovery plans',
                    metrics: [
                      { label: 'Recovery Time', value: '<1hr' },
                      { label: 'Data Backup', value: 'Real-time' },
                    ],
                    icon: <RefreshCw className="h-5 w-5" />,
                    color: 'text-violet-500',
                  },
                ].map((strategy, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 + i * 0.1 }}
                    className="group space-y-3 rounded-lg p-3 transition-colors hover:bg-foreground/5"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          'rounded-full bg-foreground/5 p-2',
                          strategy.color
                        )}
                      >
                        {strategy.icon}
                      </div>
                      <div>
                        <div className="font-semibold">{strategy.title}</div>
                        <div className="text-sm text-foreground/60">
                          {strategy.description}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {strategy.metrics.map((metric, j) => (
                        <div key={j} className="text-center">
                          <div className="text-lg font-bold text-primary">
                            {metric.value}
                          </div>
                          <div className="text-xs text-foreground/60">
                            {metric.label}
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 11,
    title: '🔄 Competitive Analysis',
    subtitle: 'Why Tuturuuu Dominates the Market',
    content: (
      <div className="space-y-8">
        <div className="grid gap-6 md:grid-cols-12">
          {/* Left column: Key Differentiators */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl bg-foreground/5 p-6 md:col-span-5"
          >
            <h3 className="mb-6 flex items-center gap-2 text-xl font-bold">
              <Shield className="h-5 w-5 text-primary" />
              Key Differentiators
            </h3>
            <div className="space-y-6">
              {[
                {
                  title: 'Open Source Advantage',
                  us: 'Full source access, community-driven',
                  them: 'Closed source, vendor lock-in',
                  icon: <Code2 className="h-5 w-5" />,
                  color: 'text-blue-500',
                },
                {
                  title: 'AI Integration',
                  us: 'Native AI in every feature',
                  them: 'Bolt-on AI capabilities',
                  icon: <Brain className="h-5 w-5" />,
                  color: 'text-violet-500',
                },
                {
                  title: 'Pricing Model',
                  us: 'Transparent, value-based pricing',
                  them: 'Complex, expensive licensing',
                  icon: <DollarSign className="h-5 w-5" />,
                  color: 'text-emerald-500',
                },
                {
                  title: 'Customization',
                  us: 'Unlimited flexibility',
                  them: 'Limited configuration options',
                  icon: <Settings className="h-5 w-5" />,
                  color: 'text-amber-500',
                },
              ].map((diff, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="group space-y-2 rounded-lg p-2 transition-colors hover:bg-foreground/5"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        'rounded-full bg-foreground/5 p-2',
                        diff.color
                      )}
                    >
                      {diff.icon}
                    </div>
                    <div className="font-semibold">{diff.title}</div>
                  </div>
                  <div className="grid gap-2 pl-11">
                    <div className="flex items-center gap-2 text-sm text-emerald-500">
                      <CheckCircle className="h-4 w-4 shrink-0" />
                      <span className="text-foreground/80">{diff.us}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-red-500">
                      <XCircle className="h-4 w-4 shrink-0" />
                      <span className="text-foreground/80">{diff.them}</span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Right column: Market Position & Metrics */}
          <div className="space-y-6 md:col-span-7">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="rounded-xl bg-foreground/5 p-6"
            >
              <h3 className="mb-6 flex items-center gap-2 text-xl font-bold">
                <Target className="h-5 w-5 text-primary" />
                Market Position
              </h3>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart
                    data={[
                      {
                        subject: 'AI Capabilities',
                        Tuturuuu: 95,
                        Competitors: 60,
                      },
                      {
                        subject: 'Open Source',
                        Tuturuuu: 100,
                        Competitors: 20,
                      },
                      {
                        subject: 'Pricing',
                        Tuturuuu: 90,
                        Competitors: 40,
                      },
                      {
                        subject: 'Customization',
                        Tuturuuu: 100,
                        Competitors: 50,
                      },
                      {
                        subject: 'User Experience',
                        Tuturuuu: 95,
                        Competitors: 70,
                      },
                      {
                        subject: 'Integration',
                        Tuturuuu: 90,
                        Competitors: 65,
                      },
                    ]}
                  >
                    <PolarGrid strokeOpacity={0.2} />
                    <PolarAngleAxis dataKey="subject" />
                    <Radar
                      name="Tuturuuu"
                      dataKey="Tuturuuu"
                      stroke="hsl(var(--primary))"
                      fill="hsl(var(--primary))"
                      fillOpacity={0.3}
                    />
                    <Radar
                      name="Industry Average"
                      dataKey="Competitors"
                      stroke="hsl(var(--muted-foreground))"
                      fill="hsl(var(--muted-foreground))"
                      fillOpacity={0.1}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--background))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="grid gap-4 md:grid-cols-3"
            >
              {[
                {
                  title: 'Enterprise Features',
                  metrics: [
                    { label: 'Feature Parity', value: '150%' },
                    { label: 'Cost Savings', value: '70%' },
                  ],
                  icon: <Building2 className="h-5 w-5" />,
                  color: 'text-blue-500',
                },
                {
                  title: 'Development Speed',
                  metrics: [
                    { label: 'Release Frequency', value: '4x' },
                    { label: 'Time to Market', value: '-60%' },
                  ],
                  icon: <Zap className="h-5 w-5" />,
                  color: 'text-amber-500',
                },
                {
                  title: 'Customer Success',
                  metrics: [
                    { label: 'User Satisfaction', value: '95%' },
                    { label: 'Feature Usage', value: '85%' },
                  ],
                  icon: <Users2 className="h-5 w-5" />,
                  color: 'text-emerald-500',
                },
              ].map((section, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 + i * 0.1 }}
                  className="rounded-xl bg-foreground/5 p-4"
                >
                  <div className="mb-4 flex items-center gap-2">
                    <div
                      className={cn(
                        'rounded-full bg-foreground/5 p-2',
                        section.color
                      )}
                    >
                      {section.icon}
                    </div>
                    <h4 className="font-semibold">{section.title}</h4>
                  </div>
                  <div className="space-y-3">
                    {section.metrics.map((metric, j) => (
                      <div
                        key={j}
                        className="flex items-center justify-between"
                      >
                        <div className="text-sm text-foreground/60">
                          {metric.label}
                        </div>
                        <div className="font-bold text-primary">
                          {metric.value}
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 12,
    title: '🎯 Target Market',
    subtitle: 'Serving Diverse Business Needs',
    content: (
      <div className="grid gap-6 md:grid-cols-2">
        {targetSegments.map((segment, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="group relative overflow-hidden rounded-xl bg-foreground/5 p-6 transition-colors hover:bg-foreground/10"
          >
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'rounded-full bg-foreground/5 p-3',
                    segment.color
                  )}
                >
                  {segment.icon}
                </div>
                <h3 className="text-xl font-bold">{segment.title}</h3>
              </div>
              <p className="text-foreground/80">{segment.description}</p>
              <div className="space-y-2">
                <div className="text-sm font-medium">Key Benefits:</div>
                <ul className="grid grid-cols-2 gap-2">
                  {segment.benefits.map((benefit, j) => (
                    <li key={j} className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-emerald-500" />
                      <span className="text-sm">{benefit}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {Object.entries(segment.metrics).map(([label, value], k) => (
                  <div key={k} className="text-center">
                    <div className="text-lg font-bold text-primary">
                      {value}
                    </div>
                    <div className="text-sm text-foreground/60">{label}</div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    ),
  },
  {
    id: 13,
    title: '⚡ Core Features',
    subtitle: 'Powerful Tools for Modern Teams',
    content: (
      <div className="grid gap-6 md:grid-cols-3">
        {features.map((feature, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="group relative overflow-hidden rounded-xl bg-foreground/5 p-6 transition-colors hover:bg-foreground/10"
          >
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'rounded-full bg-foreground/5 p-3',
                    feature.color
                  )}
                >
                  {feature.icon}
                </div>
                <h3 className="font-bold">{feature.title}</h3>
              </div>
              <p className="text-sm text-foreground/80">
                {feature.description}
              </p>
              <div className="grid grid-cols-2 gap-4">
                {feature.metrics.map((metric, j) => (
                  <div key={j} className="text-center">
                    <div className="text-lg font-bold text-primary">
                      {metric.value}
                    </div>
                    <div className="text-xs text-foreground/60">
                      {metric.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    ),
  },
  {
    id: 14,
    title: '🧠 AI Capabilities',
    subtitle: 'Next-Generation Intelligence',
    content: (
      <div className="grid gap-6 md:grid-cols-3">
        {aiFeatures.map((feature, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="group relative overflow-hidden rounded-xl bg-foreground/5 p-6 transition-colors hover:bg-foreground/10"
          >
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'rounded-full bg-foreground/5 p-3',
                    feature.color
                  )}
                >
                  {feature.icon}
                </div>
                <h3 className="font-bold">{feature.title}</h3>
              </div>
              <p className="text-sm text-foreground/80">
                {feature.description}
              </p>
              <div className="grid grid-cols-2 gap-4">
                {feature.metrics.map((metric, j) => (
                  <div key={j} className="text-center">
                    <div className="text-lg font-bold text-primary">
                      {metric.value}
                    </div>
                    <div className="text-xs text-foreground/60">
                      {metric.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    ),
  },
  {
    id: 15,
    title: '💪 Our Edge',
    subtitle: 'What Sets Us Apart from the Competition',
    content: (
      <div className="space-y-8">
        <div className="grid gap-6 md:grid-cols-2">
          {[
            {
              title: 'Open Source Freedom',
              description:
                'Full transparency and unlimited customization potential',
              metrics: [
                { label: 'Community Size', value: '50K+' },
                { label: 'Contributors', value: '5000+' },
              ],
              icon: <Code2 className="h-6 w-6" />,
              color: 'text-blue-500',
              benefits: [
                'Unlimited customization',
                'Community-driven innovation',
                'No vendor lock-in',
              ],
            },
            {
              title: 'AI-First Platform',
              description: 'Built from the ground up with AI at its core',
              metrics: [
                { label: 'AI Models', value: '15+' },
                { label: 'Accuracy', value: '99.9%' },
              ],
              icon: <Brain className="h-6 w-6" />,
              color: 'text-emerald-500',
              benefits: [
                'Native AI integration',
                'Continuous learning',
                'Predictive insights',
              ],
            },
            {
              title: 'Cost-Effective',
              description: 'Enterprise features at SME-friendly pricing',
              metrics: [
                { label: 'Cost Savings', value: '70%' },
                { label: 'ROI', value: '300%' },
              ],
              icon: <DollarSign className="h-6 w-6" />,
              color: 'text-violet-500',
              benefits: [
                'Transparent pricing',
                'Pay-as-you-grow',
                'No hidden costs',
              ],
            },
            {
              title: 'Developer-Centric',
              description: 'Built by developers, for developers',
              metrics: [
                { label: 'API Coverage', value: '100%' },
                { label: 'Dev Tools', value: '50+' },
              ],
              icon: <Code2 className="h-6 w-6" />,
              color: 'text-amber-500',
              benefits: [
                'Extensive API support',
                'Rich documentation',
                'Developer tools',
              ],
            },
          ].map((advantage, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="group relative overflow-hidden rounded-xl bg-foreground/5 p-6 transition-colors hover:bg-foreground/10"
            >
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'rounded-full bg-foreground/5 p-3',
                      advantage.color
                    )}
                  >
                    {advantage.icon}
                  </div>
                  <h3 className="text-xl font-bold">{advantage.title}</h3>
                </div>
                <p className="text-foreground/80">{advantage.description}</p>
                <div className="grid grid-cols-2 gap-4">
                  {advantage.metrics.map((metric, j) => (
                    <div key={j} className="text-center">
                      <div className="text-lg font-bold text-primary">
                        {metric.value}
                      </div>
                      <div className="text-sm text-foreground/60">
                        {metric.label}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Key Benefits:</div>
                  <ul className="grid grid-cols-1 gap-2">
                    {advantage.benefits.map((benefit, j) => (
                      <li key={j} className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-emerald-500" />
                        <span className="text-sm">{benefit}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: 16,
    title: '💎 Pricing',
    subtitle: 'Flexible Plans for Every Team',
    content: (
      <div className="space-y-8">
        <div className="grid gap-6 md:grid-cols-4">
          {[
            {
              name: 'Free',
              description: 'Perfect for small teams getting started',
              price: '$0',
              priceDetails: 'forever free',
              features: [
                'Up to 5 team members',
                '500MB storage',
                'Basic AI features',
                'Email support',
                'Community access',
              ],
              metrics: [
                { label: 'Storage', value: '500MB' },
                { label: 'API Calls', value: '1000/mo' },
              ],
              icon: <Rocket className="h-6 w-6" />,
              color: 'text-blue-500',
              cta: 'Get Started',
              popular: false,
            },
            {
              name: 'Pro',
              description: 'For growing teams that need more power',
              price: '$25',
              priceDetails: 'per workspace/month',
              features: [
                'Up to 10 team members',
                '50GB storage',
                'Advanced AI features',
                'Priority support',
                'API access',
                'Custom integrations',
              ],
              metrics: [
                { label: 'Storage', value: '50GB' },
                { label: 'API Calls', value: '50K/mo' },
              ],
              icon: <Zap className="h-6 w-6" />,
              color: 'text-emerald-500',
              cta: 'Start Trial',
              popular: true,
            },
            {
              name: 'Business',
              description: 'For larger teams with advanced needs',
              price: '$199',
              priceDetails: 'per workspace/month',
              features: [
                'Up to 100 team members',
                'Unlimited storage',
                'Custom AI models',
                'Priority support',
                'API access',
                'Custom integrations',
                'SSO & SAML',
                'Audit logs',
              ],
              metrics: [
                { label: 'Storage', value: 'Unlimited' },
                { label: 'API Calls', value: '500K/mo' },
              ],
              icon: <Building2 className="h-6 w-6" />,
              color: 'text-violet-500',
              cta: 'Contact Sales',
              popular: false,
            },
            {
              name: 'Enterprise',
              description: 'Custom solutions for large organizations',
              price: 'Custom',
              priceDetails: 'tailored pricing',
              features: [
                'Unlimited team members',
                'Custom storage',
                'Custom AI models',
                'Dedicated support',
                'Custom contracts',
                'On-premise options',
                'SLA guarantee',
                'Custom security',
              ],
              metrics: [
                { label: 'Storage', value: 'Custom' },
                { label: 'API Calls', value: 'Custom' },
              ],
              icon: <Factory className="h-6 w-6" />,
              color: 'text-amber-500',
              cta: 'Contact Us',
              popular: false,
            },
          ].map((plan, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className={cn(
                'group relative overflow-hidden rounded-xl p-6 transition-all duration-300',
                plan.popular
                  ? 'bg-primary/10 ring-2 ring-primary'
                  : 'bg-foreground/5 hover:bg-foreground/10'
              )}
            >
              {plan.popular && (
                <div className="absolute top-0 right-0 translate-x-1/2 -translate-y-1/2 rotate-45">
                  <div className="bg-primary px-8 py-1 text-xs font-medium text-white">
                    Popular
                  </div>
                </div>
              )}
              <div className="flex flex-col gap-6">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'rounded-full bg-foreground/5 p-3',
                      plan.color
                    )}
                  >
                    {plan.icon}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold">{plan.name}</h3>
                    <p className="text-sm text-foreground/60">
                      {plan.description}
                    </p>
                  </div>
                </div>
                <div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold">{plan.price}</span>
                    {plan.priceDetails && (
                      <span className="text-sm text-foreground/60">
                        /{plan.priceDetails}
                      </span>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {plan.metrics.map((metric, j) => (
                    <div key={j} className="text-center">
                      <div className="text-lg font-bold text-primary">
                        {metric.value}
                      </div>
                      <div className="text-xs text-foreground/60">
                        {metric.label}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="space-y-4">
                  <div className="text-sm font-medium">Features:</div>
                  <ul className="space-y-2">
                    {plan.features.map((feature, j) => (
                      <li key={j} className="flex items-start gap-2">
                        <Check className="mt-1 h-4 w-4 text-emerald-500" />
                        <span className="text-sm text-foreground/80">
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <Button
                  className={cn(
                    'w-full gap-2',
                    plan.popular ? 'bg-primary hover:bg-primary/90' : ''
                  )}
                >
                  {plan.cta}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: 18,
    title: '🎯 Roadmap',
    subtitle: 'Our Path to Success',
    content: (
      <div className="space-y-8">
        <div className="grid gap-6 md:grid-cols-2">
          {roadmap.map((phase, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.1 }}
              className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-foreground/5 via-foreground/5 to-transparent p-6"
            >
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-background/80 to-background',
                        phase.color
                      )}
                    >
                      {phase.icon}
                    </div>
                    <div>
                      <h3 className={cn('text-xl font-bold', phase.color)}>
                        {phase.phase}
                      </h3>
                      <div className="text-sm text-foreground/60">
                        {phase.timeline}
                      </div>
                    </div>
                  </div>
                  <div
                    className={cn(
                      'rounded-full px-3 py-1 text-xs font-medium',
                      phase.progress === 'Planning' &&
                        'bg-blue-500/20 text-blue-500',
                      phase.progress === 'Development' &&
                        'bg-emerald-500/20 text-emerald-500',
                      phase.progress === 'Research' &&
                        'bg-violet-500/20 text-violet-500'
                    )}
                  >
                    {phase.progress}
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Key Goals:</div>
                    <ul className="space-y-2">
                      {phase.goals.map((goal, j) => (
                        <li key={j} className="flex items-start gap-2">
                          <Check className="mt-1 h-4 w-4 shrink-0 text-emerald-500" />
                          <span className="text-sm text-foreground/80">
                            {goal}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Milestones:</div>
                    <ul className="space-y-2">
                      {[
                        { label: 'Planning', value: '100%' },
                        { label: 'Team Setup', value: '80%' },
                        { label: 'Development', value: '60%' },
                      ].map((milestone, j) => (
                        <li key={j} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-foreground/60">
                              {milestone.label}
                            </span>
                            <span className="font-medium">
                              {milestone.value}
                            </span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-foreground/10">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: milestone.value }}
                              transition={{ delay: 0.5 + j * 0.2, duration: 1 }}
                              className="h-full bg-primary"
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="grid gap-6 md:grid-cols-4"
        >
          {[
            {
              title: 'Development Velocity',
              value: '2x',
              trend: 'Faster than planned',
              icon: <Zap className="h-6 w-6" />,
              color: 'text-blue-500',
            },
            {
              title: 'Team Growth',
              value: '150+',
              trend: 'New hires in 2025',
              icon: <Users2 className="h-6 w-6" />,
              color: 'text-emerald-500',
            },
            {
              title: 'Market Coverage',
              value: '85%',
              trend: 'Key markets reached',
              icon: <Globe className="h-6 w-6" />,
              color: 'text-violet-500',
            },
            {
              title: 'Innovation Index',
              value: '95%',
              trend: 'Above industry average',
              icon: <Brain className="h-6 w-6" />,
              color: 'text-amber-500',
            },
          ].map((metric, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.6 + i * 0.1 }}
              className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-foreground/5 via-foreground/5 to-transparent p-6"
            >
              <div
                className={cn(
                  'absolute top-3 right-3 opacity-10',
                  metric.color
                )}
              >
                {metric.icon}
              </div>
              <div className="relative flex flex-col gap-3">
                <div
                  className={cn(
                    'flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-background/80 to-background',
                    metric.color
                  )}
                >
                  {metric.icon}
                </div>
                <div className={cn('text-2xl font-bold', metric.color)}>
                  {metric.value}
                </div>
                <div className="font-medium">{metric.title}</div>
                <div className="text-sm text-foreground/60">{metric.trend}</div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    ),
  },
  {
    id: 19,
    title: '📈 Financial Projections',
    subtitle: 'Strong Growth & Clear Path to Profitability',
    content: (
      <div className="space-y-8">
        <div className="grid gap-6 md:grid-cols-12">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="rounded-xl bg-gradient-to-br from-foreground/5 via-foreground/5 to-transparent p-6 md:col-span-8"
          >
            <h3 className="mb-6 flex items-center gap-2 text-xl font-bold">
              <TrendingUp className="h-5 w-5 text-primary" />
              Revenue Growth & Projections
            </h3>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={[
                    { year: 'Q2 2025', revenue: 5, projection: 5, expenses: 4 },
                    {
                      year: 'Q4 2025',
                      revenue: 15,
                      projection: 15,
                      expenses: 10,
                    },
                    {
                      year: 'Q2 2026',
                      revenue: 35,
                      projection: 35,
                      expenses: 20,
                    },
                    {
                      year: 'Q4 2026',
                      revenue: 65,
                      projection: 65,
                      expenses: 35,
                    },
                    {
                      year: 'Q2 2027',
                      revenue: null,
                      projection: 100,
                      expenses: 45,
                    },
                    {
                      year: 'Q4 2027',
                      revenue: null,
                      projection: 150,
                      expenses: 60,
                    },
                  ]}
                >
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="year" stroke="hsl(var(--foreground))" />
                  <YAxis stroke="hsl(var(--foreground))" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--background))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    name="Actual Revenue ($M)"
                    stroke="hsl(var(--primary))"
                    strokeWidth={3}
                    dot={{ fill: 'hsl(var(--primary))' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="projection"
                    name="Projected Revenue ($M)"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="expenses"
                    name="Expenses ($M)"
                    stroke="hsl(var(--destructive))"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </motion.div>

          <div className="space-y-6 md:col-span-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="rounded-xl bg-gradient-to-br from-foreground/5 via-foreground/5 to-transparent p-6"
            >
              <h3 className="mb-4 flex items-center gap-2 text-xl font-bold">
                <Target className="h-5 w-5 text-primary" />
                Key Metrics
              </h3>
              <div className="space-y-4">
                {[
                  {
                    metric: 'ARR Growth',
                    value: '215%',
                    target: '250% by 2026',
                    icon: <TrendingUp className="h-5 w-5" />,
                    color: 'text-emerald-500',
                  },
                  {
                    metric: 'Gross Margin',
                    value: '85%',
                    target: '88% by 2026',
                    icon: <PieChart className="h-5 w-5" />,
                    color: 'text-blue-500',
                  },
                  {
                    metric: 'CAC Payback',
                    value: '6mo',
                    target: '5mo by 2026',
                    icon: <Timer className="h-5 w-5" />,
                    color: 'text-violet-500',
                  },
                  {
                    metric: 'LTV/CAC',
                    value: '8.5x',
                    target: '10x by 2027',
                    icon: <Wallet className="h-5 w-5" />,
                    color: 'text-amber-500',
                  },
                ].map((metric, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + i * 0.1 }}
                    className="group relative overflow-hidden rounded-lg bg-gradient-to-br from-foreground/5 via-foreground/5 to-transparent p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            'flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-background/80 to-background',
                            metric.color
                          )}
                        >
                          {metric.icon}
                        </div>
                        <div>
                          <div
                            className={cn('text-xl font-bold', metric.color)}
                          >
                            {metric.value}
                          </div>
                          <div className="text-sm font-medium">
                            {metric.metric}
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-foreground/60">
                        Target: {metric.target}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              title: 'Revenue Streams',
              data: [
                { name: 'Subscriptions', value: 70, color: 'text-blue-500' },
                { name: 'Enterprise', value: 20, color: 'text-emerald-500' },
                { name: 'Services', value: 10, color: 'text-violet-500' },
              ],
              icon: <DollarSign className="h-6 w-6" />,
            },
            {
              title: 'Cost Structure',
              data: [
                { name: 'R&D', value: 40, color: 'text-blue-500' },
                {
                  name: 'Sales & Marketing',
                  value: 30,
                  color: 'text-emerald-500',
                },
                { name: 'Operations', value: 30, color: 'text-violet-500' },
              ],
              icon: <PieChart className="h-6 w-6" />,
            },
            {
              title: 'Growth Investments',
              data: [
                {
                  name: 'Product Development',
                  value: 45,
                  color: 'text-blue-500',
                },
                {
                  name: 'Market Expansion',
                  value: 35,
                  color: 'text-emerald-500',
                },
                { name: 'Team Growth', value: 20, color: 'text-violet-500' },
              ],
              icon: <TrendingUp className="h-6 w-6" />,
            },
          ].map((section, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4 + i * 0.1 }}
              className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-foreground/5 via-foreground/5 to-transparent p-6"
            >
              <div className="mb-4 flex items-center gap-2">
                <div className="rounded-full bg-primary/10 p-2 text-primary">
                  {section.icon}
                </div>
                <h3 className="text-lg font-bold">{section.title}</h3>
              </div>
              <div className="space-y-4">
                {section.data.map((item, j) => (
                  <div key={j} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{item.name}</span>
                      <span className={cn('text-sm font-bold', item.color)}>
                        {item.value}%
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-foreground/10">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${item.value}%` }}
                        transition={{ delay: 0.6 + j * 0.2, duration: 1 }}
                        className={cn(
                          'h-full',
                          item.color.includes('emerald')
                            ? 'bg-emerald-500'
                            : item.color.includes('violet')
                              ? 'bg-violet-500'
                              : 'bg-blue-500'
                        )}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: 22,
    title: '🌟 Join the Revolution',
    subtitle: 'Be Part of Something Extraordinary',
    content: (
      <div className="space-y-12">
        <div className="flex flex-col items-center gap-8 text-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', duration: 0.8 }}
          >
            <LogoComponent isCenter />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="max-w-3xl space-y-4"
          >
            <h2 className="text-4xl font-bold">Transform the Future of Work</h2>
            <p className="text-xl leading-relaxed text-foreground/80">
              Tuturuuu isn't just another platform—it's a movement towards a
              smarter, more efficient future of work. Join us in revolutionizing
              how teams collaborate, create, and succeed together.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="flex flex-col gap-4 md:flex-row"
          >
            <Link href="/login" className="w-full md:w-auto">
              <Button size="lg" className="group w-full gap-2 md:w-auto">
                Get Started Now
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Button>
            </Link>
            <Link href="/contact" className="w-full md:w-auto">
              <Button
                size="lg"
                variant="outline"
                className="w-full gap-2 md:w-auto"
              >
                Contact Sales
                <ArrowUpRight className="h-4 w-4" />
              </Button>
            </Link>
          </motion.div>
        </div>
      </div>
    ),
  },
];

export default function PitchPage() {
  const { width, height } = useWindowSize();
  const [showConfetti, setShowConfetti] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [direction, setDirection] = useState(0);
  const [scale, setScale] = useState(1);
  const contentRef = useRef<HTMLDivElement>(null);

  const handlePaginate = (newDirection: number) => {
    if (
      (currentSlide === 0 && newDirection === -1) ||
      (currentSlide === slides.length - 1 && newDirection === 1)
    )
      return;

    setDirection(newDirection);
    setCurrentSlide(currentSlide + newDirection);
  };

  useEffect(() => {
    const calculateScale = () => {
      if (!contentRef.current) return;

      const contentHeight = contentRef.current.scrollHeight;
      const viewportHeight = window.innerHeight;
      const padding = 64; // 16px top + 16px bottom padding

      if (contentHeight > viewportHeight - padding) {
        const newScale = (viewportHeight - padding) / contentHeight;
        setScale(Math.min(1, newScale));
      } else {
        setScale(1);
      }
    };

    calculateScale();
    window.addEventListener('resize', calculateScale);
    return () => window.removeEventListener('resize', calculateScale);
  }, [currentSlide]);

  useEffect(() => {
    if (currentSlide === 0 || currentSlide === slides.length - 1) {
      setShowConfetti(true);
      const timer = setTimeout(() => setShowConfetti(false), 5000);
      return () => clearTimeout(timer);
    } else {
      setShowConfetti(false);
    }
  }, [currentSlide]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') handlePaginate(-1);
      if (e.key === 'ArrowRight') handlePaginate(1);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentSlide]);

  const isFirstOrLastSlide =
    currentSlide === 0 || currentSlide === slides.length - 1;

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background">
      <LogoComponent
        className={cn(
          'transition-opacity duration-500',
          isFirstOrLastSlide ? 'opacity-0' : 'opacity-100'
        )}
      />

      <ThemeToggle
        forceDisplay={true}
        className="absolute top-4 right-4 z-50"
      />

      <button
        onClick={() => handlePaginate(-1)}
        className={cn(
          'absolute left-4 z-20 rounded-full bg-foreground/5 p-3 hover:bg-foreground/10',
          'transform transition-all duration-300',
          'disabled:pointer-events-none disabled:opacity-0',
          'hover:scale-110 focus:ring-2 focus:ring-primary/50 focus:outline-hidden'
        )}
        disabled={currentSlide === 0}
      >
        <ArrowLeft className="h-6 w-6" />
      </button>

      <button
        onClick={() => handlePaginate(1)}
        className={cn(
          'absolute right-4 z-20 rounded-full bg-foreground/5 p-3 hover:bg-foreground/10',
          'transform transition-all duration-300',
          'disabled:pointer-events-none disabled:opacity-0',
          'hover:scale-110 focus:ring-2 focus:ring-primary/50 focus:outline-hidden'
        )}
        disabled={currentSlide === slides.length - 1}
      >
        <ArrowRight className="h-6 w-6" />
      </button>

      <div className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2">
        <div className="flex gap-2">
          {slides.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentSlide(index)}
              className={cn(
                'h-2 w-2 rounded-full transition-all duration-300',
                currentSlide === index
                  ? 'w-6 bg-primary'
                  : 'bg-foreground/20 hover:bg-foreground/40'
              )}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>
      </div>

      <AnimatePresence initial={false} custom={direction}>
        <motion.div
          key={currentSlide}
          custom={direction}
          variants={SLIDE_VARIANTS}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{
            x: { type: 'spring', stiffness: 300, damping: 30 },
            opacity: { duration: 0.2 },
          }}
          className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden p-8 md:p-16"
        >
          {showConfetti && (
            <Confetti
              width={width}
              height={height}
              recycle={false}
              numberOfPieces={200}
              gravity={0.1}
            />
          )}
          <div
            ref={contentRef}
            className="flex max-w-6xl flex-col items-center gap-12"
            style={{
              transform: `scale(${scale})`,
              transformOrigin: 'center center',
              transition: 'transform 0.3s ease-out',
            }}
          >
            <div className="text-center">
              <h1 className="mb-4 text-4xl font-bold md:text-5xl lg:text-6xl">
                {slides[currentSlide]?.title}
              </h1>
              {slides[currentSlide]?.subtitle && (
                <p className="text-xl text-foreground/80 md:text-2xl">
                  {slides[currentSlide]?.subtitle}
                </p>
              )}
            </div>

            <SlideWrapper>{slides[currentSlide]?.content}</SlideWrapper>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
