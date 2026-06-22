import { createFileRoute } from '@tanstack/react-router';
import {
  BarChart3,
  Bed,
  Bell,
  Building,
  Calendar,
  Clock,
  Coffee,
  DollarSign,
  Gift,
  HeartHandshake,
  Hotel,
  Key,
  MessageSquare,
  Settings,
  Star,
  Users,
} from '@tuturuuu/icons/lucide';
import {
  SolutionPage,
  type SolutionPageConfig,
} from '../../../components/solutions/solution-page';
import { createPageHead } from '../../../lib/platform/head';

export const Route = createFileRoute('/$locale/solutions/hospitality')({
  component: HospitalitySolutionPage,
  head: () =>
    createPageHead({
      description:
        'Deliver memorable guest experiences using Tuturuuu in hospitality.',
      title: 'Hospitality Solution',
    }),
});

const config: SolutionPageConfig = {
  badge: 'Hospitality Management Solutions',
  title: 'Transform Your Hospitality Business',
  description:
    'Elevate guest experiences and streamline operations with our comprehensive hospitality management platform.',
  trust: {
    title: 'Trusted by Leading Hospitality Brands',
    description:
      'Join thousands of properties that have transformed their guest experience with our platform.',
    icon: <Star className="h-12 w-12" />,
  },
  featuresTitle: 'Comprehensive Hospitality Management',
  features: [
    {
      title: 'Property Management',
      description: 'Comprehensive hotel and property management system.',
      icon: <Building className="h-6 w-6" />,
    },
    {
      title: 'Reservation System',
      description: 'Smart booking and room allocation management.',
      icon: <Calendar className="h-6 w-6" />,
    },
    {
      title: 'Guest Services',
      description: 'Streamlined guest experience and request handling.',
      icon: <Bell className="h-6 w-6" />,
    },
    {
      title: 'Front Desk Operations',
      description: 'Efficient check-in/out and guest management.',
      icon: <Hotel className="h-6 w-6" />,
    },
    {
      title: 'Revenue Management',
      description: 'Dynamic pricing and revenue optimization tools.',
      icon: <DollarSign className="h-6 w-6" />,
    },
    {
      title: 'Analytics Dashboard',
      description: 'Comprehensive reporting and business insights.',
      icon: <BarChart3 className="h-6 w-6" />,
    },
  ],
  primaryBenefit: {
    title: 'Enhanced Guest Experience',
    description:
      'Deliver exceptional service and personalized experiences with our comprehensive hospitality solution.',
    icon: <Bed className="h-8 w-8" />,
  },
  benefits: [
    {
      title: 'Smart Room Control',
      description: 'IoT-enabled room automation.',
      icon: <Key className="h-6 w-6" />,
    },
    {
      title: 'Guest Communication',
      description: 'Multi-channel guest messaging.',
      icon: <MessageSquare className="h-6 w-6" />,
    },
    {
      title: 'Loyalty Programs',
      description: 'Guest rewards and retention.',
      icon: <Gift className="h-6 w-6" />,
    },
    {
      title: 'Staff Management',
      description: 'Workforce scheduling and tasks.',
      icon: <Settings className="h-6 w-6" />,
    },
  ],
  coreFeatures: [
    {
      title: 'Guest Management',
      description: 'Comprehensive guest profiles',
      icon: <Users className="h-8 w-8" />,
    },
    {
      title: '24/7 Operations',
      description: 'Round-the-clock service support',
      icon: <Clock className="h-8 w-8" />,
    },
    {
      title: 'Service Management',
      description: 'Streamlined service delivery',
      icon: <Coffee className="h-8 w-8" />,
    },
  ],
  story: {
    icon: <HeartHandshake className="h-8 w-8" />,
    quote:
      '"This platform has revolutionized how we manage our properties. Guest satisfaction has soared, and our operations are more efficient than ever."',
    author: '- Sarah Thompson',
    role: 'General Manager, Luxury Hotels Group',
    metrics: [
      { value: '40%', label: 'Increased Efficiency' },
      { value: '95%', label: 'Guest Satisfaction' },
      { value: '30%', label: 'Revenue Growth' },
    ],
  },
  faqs: [
    {
      question: 'How quickly can we implement the system?',
      answer:
        'Implementation typically takes 2-3 weeks, including staff training and data migration.',
    },
    {
      question: 'Can it integrate with existing hotel systems?',
      answer:
        'Yes, we offer integration with major PMS systems, booking engines, and channel managers.',
    },
    {
      question: 'What kind of support do you provide?',
      answer:
        'We provide 24/7 technical support, comprehensive training, and dedicated account management.',
    },
    {
      question: 'Is it suitable for different property types?',
      answer:
        'Yes, our platform is customizable for hotels, resorts, boutique properties, and vacation rentals.',
    },
    {
      question: 'How do you handle guest data privacy?',
      answer:
        'We implement strict data protection measures and comply with global privacy regulations.',
    },
  ],
  cta: {
    title: 'Ready to Transform Your Hospitality Business?',
    description:
      'Join leading hospitality brands using our platform to enhance guest experiences and streamline operations.',
  },
};

export default function HospitalitySolutionPage() {
  return <SolutionPage config={config} />;
}
