import { createFileRoute } from '@tanstack/react-router';
import {
  Calendar,
  Clock,
  Globe,
  Link,
  Mail,
  MessageSquare,
  Share2,
  ShieldCheck,
  Smartphone,
  Users,
  Video,
  Zap,
} from '@tuturuuu/icons/lucide';
import {
  ProductBadge,
  ProductButton,
  ProductCard,
  ProductLinkButton,
} from '../../../components/products/product-page-primitives';
import { createPageHead } from '../../../lib/platform/head';

export const Route = createFileRoute('/$locale/products/calendar')({
  component: CalendarProductPage,
  head: () =>
    createPageHead({
      description:
        'Coordinate schedules with the shared Tuturuuu calendar experience.',
      title: 'Calendar Product',
    }),
});

const features = [
  {
    title: 'Smart Scheduling',
    description:
      'Intelligent scheduling suggestions based on availability and preferences.',
    icon: <Clock className="h-6 w-6" />,
  },
  {
    title: 'Team Coordination',
    description:
      'Easily coordinate meetings and events across teams and time zones.',
    icon: <Users className="h-6 w-6" />,
  },
  {
    title: 'Video Integration',
    description:
      'Seamless integration with popular video conferencing platforms.',
    icon: <Video className="h-6 w-6" />,
  },
  {
    title: 'Mobile Access',
    description:
      'Access your calendar on any device with our mobile-responsive design.',
    icon: <Smartphone className="h-6 w-6" />,
  },
  {
    title: 'Meeting Links',
    description:
      'Generate and share custom booking links for easy appointment scheduling.',
    icon: <Link className="h-6 w-6" />,
  },
  {
    title: 'Email Notifications',
    description:
      'Automated reminders and updates for all your scheduled events.',
    icon: <Mail className="h-6 w-6" />,
  },
];

const useCases = [
  {
    title: 'Team Collaboration',
    items: [
      'Meeting scheduling',
      'Team availability',
      'Project timelines',
      'Resource booking',
    ],
  },
  {
    title: 'Client Management',
    items: [
      'Appointment booking',
      'Consultation slots',
      'Follow-up scheduling',
      'Client reminders',
    ],
  },
  {
    title: 'Event Planning',
    items: [
      'Event coordination',
      'Venue scheduling',
      'Attendee management',
      'Calendar sharing',
    ],
  },
];

export default function CalendarProductPage() {
  return (
    <div className="container mx-auto mt-8 flex max-w-6xl flex-col gap-6 px-3 py-16 lg:gap-14 lg:py-24">
      {/* Hero Section */}
      <div className="mb-16 text-center">
        <ProductBadge className="mb-4">Coming Soon</ProductBadge>
        <h1 className="mb-4 font-bold text-4xl">Smart Calendar Management</h1>
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
          Streamline your scheduling and time management with our intelligent
          calendar system. Coordinate meetings, manage events, and boost
          productivity across teams.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <ProductButton disabled>Join Waitlist</ProductButton>
          <ProductLinkButton href="/contact">Contact Sales</ProductLinkButton>
        </div>
      </div>

      {/* Trust Section */}
      <section className="mb-24">
        <ProductCard className="border-primary bg-primary/5 p-8">
          <div className="mx-auto flex max-w-4xl flex-col items-center gap-4 text-center">
            <ShieldCheck className="h-12 w-12 text-primary" />
            <h2 className="font-bold text-2xl">Enterprise-Ready Calendar</h2>
            <p className="text-muted-foreground">
              Built with security and scalability in mind, our calendar system
              supports organizations of all sizes while maintaining data privacy
              and compliance.
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
              <Calendar className="mb-4 h-8 w-8 text-primary" />
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

      {/* Integration Section */}
      <section className="mb-24">
        <ProductCard className="overflow-hidden">
          <div className="grid md:grid-cols-2">
            <div className="flex flex-col justify-center gap-4 border-border border-b p-8 md:border-r md:border-b-0">
              <Globe className="h-8 w-8 text-primary" />
              <h3 className="font-bold text-2xl">Global Accessibility</h3>
              <p className="text-muted-foreground">
                Access your calendar from anywhere, with automatic time zone
                adjustments and cross-platform synchronization.
              </p>
            </div>
            <div className="flex flex-col justify-center gap-4 p-8">
              <Share2 className="h-8 w-8 text-primary" />
              <h3 className="font-bold text-2xl">Seamless Integration</h3>
              <p className="text-muted-foreground">
                Connect with your favorite tools and services for a unified
                workflow experience.
              </p>
            </div>
          </div>
        </ProductCard>
      </section>

      {/* Communication Section */}
      <section className="mb-24">
        <h2 className="mb-12 text-center font-bold text-3xl">
          Enhanced Communication
        </h2>
        <div className="grid gap-6 md:grid-cols-2">
          <ProductCard className="p-6">
            <MessageSquare className="mb-4 h-8 w-8 text-primary" />
            <h3 className="mb-2 font-bold text-xl">Meeting Chat</h3>
            <p className="text-muted-foreground">
              Built-in chat functionality for quick discussions and meeting
              coordination.
            </p>
          </ProductCard>
          <ProductCard className="p-6">
            <Zap className="mb-4 h-8 w-8 text-primary" />
            <h3 className="mb-2 font-bold text-xl">Quick Actions</h3>
            <p className="text-muted-foreground">
              Streamlined workflows with one-click actions for common calendar
              operations.
            </p>
          </ProductCard>
        </div>
      </section>
    </div>
  );
}
