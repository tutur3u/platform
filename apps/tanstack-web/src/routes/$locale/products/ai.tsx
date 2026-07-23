import { createFileRoute } from '@tanstack/react-router';
import {
  Brain,
  FileSearch,
  Fingerprint,
  Languages,
  LineChart,
  MessageSquareCode,
  Sparkles,
  Zap,
} from '@tuturuuu/icons/lucide';
import {
  ProductBadge,
  ProductCard,
  ProductLinkButton,
} from '../../../components/products/product-page-primitives';
import { createPageHead } from '../../../lib/platform/head';

export const Route = createFileRoute('/$locale/products/ai')({
  component: AIProductPage,
  head: () =>
    createPageHead({
      description:
        'See how Tuturuuu AI accelerates automation and everyday workflows.',
      title: 'AI Workspace',
    }),
});

const features = [
  {
    title: 'Natural Language Processing',
    description:
      'Understand and process human language with advanced AI models for better communication and automation.',
    icon: <Languages className="h-6 w-6" />,
  },
  {
    title: 'Smart Document Analysis',
    description:
      'Extract insights and data from documents automatically with AI-powered processing.',
    icon: <FileSearch className="h-6 w-6" />,
  },
  {
    title: 'Predictive Analytics',
    description:
      'Make data-driven decisions with AI-powered forecasting and trend analysis.',
    icon: <LineChart className="h-6 w-6" />,
  },
  {
    title: 'Code Generation',
    description:
      'Automate coding tasks and generate boilerplate code with AI assistance.',
    icon: <MessageSquareCode className="h-6 w-6" />,
  },
  {
    title: 'Intelligent Automation',
    description:
      'Streamline workflows with AI-powered process automation and optimization.',
    icon: <Zap className="h-6 w-6" />,
  },
  {
    title: 'Personalized Insights',
    description:
      'Get tailored recommendations and insights based on your business data.',
    icon: <Sparkles className="h-6 w-6" />,
  },
];

const useCases = [
  {
    title: 'Document Processing',
    items: [
      'Extract key information from documents',
      'Automate data entry',
      'Classify and organize files',
      'Generate document summaries',
    ],
  },
  {
    title: 'Business Intelligence',
    items: [
      'Market trend analysis',
      'Customer behavior prediction',
      'Revenue forecasting',
      'Risk assessment',
    ],
  },
  {
    title: 'Workflow Automation',
    items: [
      'Task prioritization',
      'Smart scheduling',
      'Process optimization',
      'Automated reporting',
    ],
  },
];

export default function AIProductPage() {
  return (
    <div className="container mx-auto mt-8 flex max-w-6xl flex-col gap-6 px-3 py-16 lg:gap-14 lg:py-24">
      {/* Hero Section */}
      <div className="mb-16 text-center">
        <ProductBadge className="mb-4">AI</ProductBadge>
        <h1 className="mb-4 font-bold text-4xl">
          Five systems, one assistant you talk to
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
          Tuturuuu&apos;s AI is not a chat box bolted onto the side. Mira plans
          and acts; Aurora, Rewise, Nova and Crystal are what make her useful.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row">
          <ProductLinkButton href="/onboarding">
            Start with Mira
          </ProductLinkButton>
          <ProductLinkButton href="/contact">Talk to us</ProductLinkButton>
        </div>
      </div>

      {/* Trust Section */}
      <section className="mb-24">
        <ProductCard className="border-primary bg-primary/5 p-8">
          <div className="mx-auto flex max-w-4xl flex-col items-center gap-4 text-center">
            <Fingerprint className="h-12 w-12 text-primary" />
            <h2 className="font-bold text-2xl">Enterprise-Grade Security</h2>
            <p className="text-muted-foreground">
              Our AI solutions are built with security and privacy in mind. All
              data is encrypted and processed in compliance with industry
              standards and regulations.
            </p>
          </div>
        </ProductCard>
      </section>

      {/* Features Grid */}
      <section className="mb-24">
        <h2 className="mb-12 text-center font-bold text-3xl">
          Intelligent Features
        </h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <ProductCard key={feature.title} className="p-6">
              <div className="mb-4 flex items-center gap-3">
                <div className="text-primary">{feature.icon}</div>
                <h3 className="font-semibold text-xl">{feature.title}</h3>
              </div>
              <p className="text-muted-foreground">{feature.description}</p>
            </ProductCard>
          ))}
        </div>
      </section>

      {/* Use Cases */}
      <section className="mb-24">
        <h2 className="mb-12 text-center font-bold text-3xl">Use Cases</h2>
        <div className="grid gap-8 md:grid-cols-3">
          {useCases.map((useCase) => (
            <ProductCard key={useCase.title} className="p-6">
              <Brain className="mb-4 h-8 w-8 text-primary" />
              <h3 className="mb-4 font-semibold text-xl">{useCase.title}</h3>
              <ul className="space-y-2 text-muted-foreground">
                {useCase.items.map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    {item}
                  </li>
                ))}
              </ul>
            </ProductCard>
          ))}
        </div>
      </section>
    </div>
  );
}
