'use client';

import { Badge } from '@repo/ui/components/ui/badge';
import { Button } from '@repo/ui/components/ui/button';
import { Card } from '@repo/ui/components/ui/card';
import {
  Bot,
  FileSearch,
  FileText,
  KeyRound,
  Languages,
  Lock,
  Share2,
  ShieldCheck,
  Sparkles,
  UserPlus,
  Users,
  Wand2,
} from 'lucide-react';

const features = [
  {
    title: 'AI-Powered Analysis',
    description:
      'Extract insights and key information from documents automatically using advanced AI.',
    icon: <Bot className="h-6 w-6" />,
  },
  {
    title: 'Smart Search',
    description:
      'Find any document instantly with powerful full-text search and filters.',
    icon: <FileSearch className="h-6 w-6" />,
  },
  {
    title: 'Multi-Language Support',
    description:
      'Work with documents in multiple languages with automatic translation.',
    icon: <Languages className="h-6 w-6" />,
  },
  {
    title: 'Collaboration Tools',
    description:
      'Work together in real-time with comments, suggestions, and version control.',
    icon: <Users className="h-6 w-6" />,
  },
  {
    title: 'Smart Templates',
    description:
      'Create documents quickly with AI-powered templates and suggestions.',
    icon: <Wand2 className="h-6 w-6" />,
  },
  {
    title: 'Access Control',
    description:
      'Manage document permissions with granular access controls and tracking.',
    icon: <KeyRound className="h-6 w-6" />,
  },
];

const useCases = [
  {
    title: 'Business Documents',
    items: [
      'Contract management',
      'Proposal creation',
      'Policy documentation',
      'Financial reports',
    ],
  },
  {
    title: 'Team Collaboration',
    items: [
      'Project documentation',
      'Knowledge sharing',
      'Meeting notes',
      'Process guides',
    ],
  },
  {
    title: 'Content Creation',
    items: [
      'Marketing materials',
      'Technical documentation',
      'Training manuals',
      'Research papers',
    ],
  },
];

export default function DocumentsProductPage() {
  return (
    <div className="container mx-auto mt-8 flex max-w-6xl flex-col gap-6 px-3 py-16 lg:gap-14 lg:py-24">
      {/* Hero Section */}
      <div className="mb-16 text-center">
        <Badge variant="secondary" className="mb-4">
          Coming Soon
        </Badge>
        <h1 className="mb-4 text-4xl font-bold">
          Intelligent Document Management
        </h1>
        <p className="text-muted-foreground mx-auto max-w-2xl text-lg">
          Transform your document workflow with AI-powered analysis,
          collaboration tools, and intelligent organization. Create, manage, and
          share documents smarter.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Button size="lg" disabled>
            Join Waitlist
          </Button>
          <Button size="lg" variant="outline" asChild>
            <a href="/contact">Contact Sales</a>
          </Button>
        </div>
      </div>

      {/* Trust Section */}
      <section className="mb-24">
        <Card className="border-primary bg-primary/5 p-8">
          <div className="mx-auto flex max-w-4xl flex-col items-center gap-4 text-center">
            <ShieldCheck className="text-primary h-12 w-12" />
            <h2 className="text-2xl font-bold">Enterprise-Grade Security</h2>
            <p className="text-muted-foreground">
              Your documents are protected with industry-leading security
              measures, including end-to-end encryption and advanced access
              controls.
            </p>
          </div>
        </Card>
      </section>

      {/* Features Grid */}
      <section className="mb-24">
        <h2 className="mb-12 text-center text-3xl font-bold">
          Powerful Features
        </h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <Card key={feature.title} className="p-6">
              <div className="mb-4 flex items-center gap-3">
                <div className="text-primary">{feature.icon}</div>
                <h3 className="text-xl font-semibold">{feature.title}</h3>
              </div>
              <p className="text-muted-foreground">{feature.description}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* Use Cases */}
      <section className="mb-24">
        <h2 className="mb-12 text-center text-3xl font-bold">Use Cases</h2>
        <div className="grid gap-8 md:grid-cols-3">
          {useCases.map((useCase) => (
            <Card key={useCase.title} className="p-6">
              <FileText className="text-primary mb-4 h-8 w-8" />
              <h3 className="mb-4 text-xl font-semibold">{useCase.title}</h3>
              <ul className="text-muted-foreground space-y-2">
                {useCase.items.map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="bg-primary h-1.5 w-1.5 rounded-full" />
                    {item}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </section>

      {/* Security Section */}
      <section className="mb-24">
        <Card className="overflow-hidden">
          <div className="grid md:grid-cols-2">
            <div className="border-border flex flex-col justify-center gap-4 border-b p-8 md:border-b-0 md:border-r">
              <Lock className="text-primary h-8 w-8" />
              <h3 className="text-2xl font-bold">Advanced Security</h3>
              <p className="text-muted-foreground">
                Protect sensitive information with encryption, access logs, and
                customizable security policies.
              </p>
            </div>
            <div className="flex flex-col justify-center gap-4 p-8">
              <Share2 className="text-primary h-8 w-8" />
              <h3 className="text-2xl font-bold">Seamless Sharing</h3>
              <p className="text-muted-foreground">
                Share documents securely with team members or external
                stakeholders with customizable permissions.
              </p>
            </div>
          </div>
        </Card>
      </section>

      {/* Additional Features Section */}
      <section className="mb-24">
        <h2 className="mb-12 text-center text-3xl font-bold">
          Smart Capabilities
        </h2>
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="p-6">
            <Sparkles className="text-primary mb-4 h-8 w-8" />
            <h3 className="mb-2 text-xl font-bold">AI Assistance</h3>
            <p className="text-muted-foreground">
              Get intelligent suggestions for content, formatting, and document
              organization powered by AI.
            </p>
          </Card>
          <Card className="p-6">
            <UserPlus className="text-primary mb-4 h-8 w-8" />
            <h3 className="mb-2 text-xl font-bold">Team Workspace</h3>
            <p className="text-muted-foreground">
              Create collaborative spaces for teams to work together on
              documents efficiently.
            </p>
          </Card>
        </div>
      </section>
    </div>
  );
}
