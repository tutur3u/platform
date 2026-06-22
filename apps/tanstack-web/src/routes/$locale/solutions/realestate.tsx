import { createFileRoute } from '@tanstack/react-router';
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
} from '@tuturuuu/icons/lucide';
import {
  SolutionPage,
  type SolutionPageConfig,
} from '../../../components/solutions/solution-page';
import { createPageHead } from '../../../lib/platform/head';

export const Route = createFileRoute('/$locale/solutions/realestate')({
  component: RealEstateSolutionPage,
  head: () =>
    createPageHead({
      description:
        'Organize listings, deals, and client updates with Tuturuuu for real estate.',
      title: 'Real Estate Solution',
    }),
});

const config: SolutionPageConfig = {
  badge: 'Real Estate Management Solutions',
  title: 'Transform Your Real Estate Business',
  description:
    'Streamline your real estate operations, close more deals, and provide exceptional service with our comprehensive platform.',
  trust: {
    title: 'Trusted by Leading Real Estate Professionals',
    description:
      'Join thousands of real estate professionals who have transformed their business with our platform.',
    icon: <Star className="h-12 w-12" />,
  },
  featuresTitle: 'Everything You Need to Succeed',
  features: [
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
  ],
  primaryBenefit: {
    title: 'Streamlined Property Management',
    description:
      'Manage properties, tenants, and transactions all in one place with our intuitive platform.',
    icon: <Home className="h-8 w-8" />,
  },
  benefits: [
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
  ],
  coreFeatures: [
    {
      title: 'Property Search',
      description: 'Advanced search with custom filters',
      icon: <Search className="h-8 w-8" />,
    },
    {
      title: 'Access Control',
      description: 'Secure role-based permissions',
      icon: <Key className="h-8 w-8" />,
    },
    {
      title: 'Location Analysis',
      description: 'Detailed area and market insights',
      icon: <MapPin className="h-8 w-8" />,
    },
  ],
  story: {
    quote:
      '"This platform has revolutionized how we manage properties. We\'ve seen dramatic improvements in efficiency and client satisfaction. It\'s been a game-changer for our business."',
    author: '- Michael Chen',
    role: 'Director, Premier Real Estate Group',
    metrics: [
      { value: '50%', label: 'Time Saved' },
      { value: '3x', label: 'More Deals Closed' },
      { value: '95%', label: 'Client Satisfaction' },
    ],
  },
  faqs: [
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
  ],
  cta: {
    title: 'Ready to Transform Your Real Estate Business?',
    description:
      'Join successful real estate professionals using our platform to grow their business and delight their clients.',
  },
};

export default function RealEstateSolutionPage() {
  return <SolutionPage config={config} />;
}
