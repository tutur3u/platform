import { createFileRoute } from '@tanstack/react-router';
import {
  AlertCircle,
  Archive,
  Bot,
  Calendar,
  Clock,
  Filter,
  Inbox,
  LayoutDashboard,
  Mail,
  MessagesSquare,
  Search,
  Send,
  ShieldCheck,
  Smartphone,
} from '@tuturuuu/icons/lucide';
import {
  ProductBadge,
  ProductCard,
  ProductLinkButton,
} from '../../../components/products/product-page-primitives';
import { createPageHead } from '../../../lib/platform/head';

export const Route = createFileRoute('/$locale/products/mail')({
  component: MailProductPage,
  head: () =>
    createPageHead({
      description: 'Power outreach and shared inboxes with Tuturuuu Mail.',
      title: 'Mail Product',
    }),
});

const features = [
  {
    title: 'Smart Inbox',
    description:
      'Intelligent email organization with priority inbox and auto-categorization.',
    icon: <Inbox className="h-6 w-6" />,
  },
  {
    title: 'AI Assistant',
    description:
      'AI-powered email composition, scheduling, and response suggestions.',
    icon: <Bot className="h-6 w-6" />,
  },
  {
    title: 'Advanced Search',
    description:
      'Powerful search capabilities with filters and natural language processing.',
    icon: <Search className="h-6 w-6" />,
  },
  {
    title: 'Calendar Integration',
    description:
      'Seamless calendar scheduling and meeting coordination from your inbox.',
    icon: <Calendar className="h-6 w-6" />,
  },
  {
    title: 'Email Tracking',
    description:
      'Track email opens, link clicks, and engagement with detailed analytics.',
    icon: <AlertCircle className="h-6 w-6" />,
  },
  {
    title: 'Mobile Access',
    description:
      'Access your email on any device with our responsive mobile application.',
    icon: <Smartphone className="h-6 w-6" />,
  },
];

const useCases = [
  {
    title: 'Business Communication',
    items: [
      'Team collaboration',
      'Client correspondence',
      'Project updates',
      'Document sharing',
    ],
  },
  {
    title: 'Email Management',
    items: [
      'Priority inbox',
      'Spam protection',
      'Email filtering',
      'Archive system',
    ],
  },
  {
    title: 'Productivity Tools',
    items: [
      'Email templates',
      'Scheduled sending',
      'Follow-up reminders',
      'Task management',
    ],
  },
];

export default function MailProductPage() {
  return (
    <div className="container mx-auto mt-8 flex max-w-6xl flex-col gap-6 px-3 py-16 lg:gap-14 lg:py-24">
      {/* Hero Section */}
      <div className="mb-16 text-center">
        <ProductBadge className="mb-4">Mail</ProductBadge>
        <h1 className="mb-4 font-bold text-4xl">
          An inbox that hands work to the rest of your day
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
          Mail that knows about your tasks and your calendar, so the promise
          made in a thread becomes something with an owner and a date.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-4 sm:flex-row">
          <ProductLinkButton
            href="https://mail.tuturuuu.com"
            rel="noopener noreferrer"
            target="_blank"
          >
            Open Mail
          </ProductLinkButton>
          <ProductLinkButton href="/contact">Talk to us</ProductLinkButton>
        </div>
      </div>

      {/* Trust Section */}
      <section className="mb-24">
        <ProductCard className="border-primary bg-primary/5 p-8">
          <div className="mx-auto flex max-w-4xl flex-col items-center gap-4 text-center">
            <ShieldCheck className="h-12 w-12 text-primary" />
            <h2 className="font-bold text-2xl">Enterprise-Grade Security</h2>
            <p className="text-muted-foreground">
              Your emails and data are protected with advanced encryption, spam
              filtering, and comprehensive security measures.
            </p>
          </div>
        </ProductCard>
      </section>

      {/* Features Grid */}
      <section className="mb-24">
        <h2 className="mb-12 text-center font-bold text-3xl">
          Powerful Features
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
              <Mail className="mb-4 h-8 w-8 text-primary" />
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

      {/* Management Section */}
      <section className="mb-24">
        <ProductCard className="overflow-hidden">
          <div className="grid md:grid-cols-2">
            <div className="flex flex-col justify-center gap-4 border-border border-b p-8 md:border-r md:border-b-0">
              <Filter className="h-8 w-8 text-primary" />
              <h3 className="font-bold text-2xl">Smart Filtering</h3>
              <p className="text-muted-foreground">
                Automatically organize your inbox with intelligent filters and
                custom rules for efficient email management.
              </p>
            </div>
            <div className="flex flex-col justify-center gap-4 p-8">
              <Archive className="h-8 w-8 text-primary" />
              <h3 className="font-bold text-2xl">Email Archive</h3>
              <p className="text-muted-foreground">
                Keep your inbox clean with smart archiving and easy retrieval of
                historical emails when needed.
              </p>
            </div>
          </div>
        </ProductCard>
      </section>

      {/* Additional Features Section */}
      <section className="mb-24">
        <h2 className="mb-12 text-center font-bold text-3xl">
          Communication Tools
        </h2>
        <div className="grid gap-6 md:grid-cols-2">
          <ProductCard className="p-6">
            <Send className="mb-4 h-8 w-8 text-primary" />
            <h3 className="mb-2 font-bold text-xl">Smart Compose</h3>
            <p className="text-muted-foreground">
              Write emails faster with AI-powered suggestions and smart
              templates for common responses.
            </p>
          </ProductCard>
          <ProductCard className="p-6">
            <Clock className="mb-4 h-8 w-8 text-primary" />
            <h3 className="mb-2 font-bold text-xl">Scheduled Sending</h3>
            <p className="text-muted-foreground">
              Schedule emails to be sent at the perfect time for maximum impact
              and engagement.
            </p>
          </ProductCard>
        </div>
      </section>

      {/* Analytics Section */}
      <section className="mb-24">
        <ProductCard className="overflow-hidden">
          <div className="grid md:grid-cols-2">
            <div className="flex flex-col justify-center gap-4 border-border border-b p-8 md:border-r md:border-b-0">
              <LayoutDashboard className="h-8 w-8 text-primary" />
              <h3 className="font-bold text-2xl">Email Analytics</h3>
              <p className="text-muted-foreground">
                Gain insights into your email patterns and communication
                effectiveness with detailed analytics.
              </p>
            </div>
            <div className="flex flex-col justify-center gap-4 p-8">
              <MessagesSquare className="h-8 w-8 text-primary" />
              <h3 className="font-bold text-2xl">Team Collaboration</h3>
              <p className="text-muted-foreground">
                Work together efficiently with shared inboxes, delegated access,
                and team communication tools.
              </p>
            </div>
          </div>
        </ProductCard>
      </section>
    </div>
  );
}
