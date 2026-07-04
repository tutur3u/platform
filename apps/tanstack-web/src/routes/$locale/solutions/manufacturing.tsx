import { createFileRoute } from '@tanstack/react-router';
import {
  BarChart3,
  Bell,
  Bot,
  Cog,
  Factory,
  Gauge,
  LineChart,
  PackageSearch,
  Scan,
  Settings,
  Shield,
  Truck,
  Warehouse,
  Wrench,
} from '@tuturuuu/icons/lucide';
import {
  SolutionPage,
  type SolutionPageConfig,
} from '../../../components/solutions/solution-page';
import { createPageHead } from '../../../lib/platform/head';

export const Route = createFileRoute('/$locale/solutions/manufacturing')({
  component: ManufacturingSolutionPage,
  head: () =>
    createPageHead({
      description:
        'Synchronize production and quality operations with Tuturuuu.',
      title: 'Manufacturing Solution',
    }),
});

const config: SolutionPageConfig = {
  badge: 'Manufacturing Management Solutions',
  title: 'Transform Your Manufacturing Operations',
  description:
    'Optimize production, improve quality, and drive efficiency with our comprehensive manufacturing management platform.',
  trust: {
    title: 'Trusted by Leading Manufacturers',
    description:
      'Join thousands of manufacturers who have transformed their operations with our platform.',
    icon: <Cog className="h-12 w-12" />,
  },
  featuresTitle: 'Comprehensive Manufacturing Management',
  features: [
    {
      title: 'Production Management',
      description: 'Streamline manufacturing processes and workflows.',
      icon: <Factory className="h-6 w-6" />,
    },
    {
      title: 'Inventory Control',
      description: 'Real-time tracking of materials and finished goods.',
      icon: <Warehouse className="h-6 w-6" />,
    },
    {
      title: 'Quality Control',
      description: 'Comprehensive quality assurance and testing tools.',
      icon: <Shield className="h-6 w-6" />,
    },
    {
      title: 'Equipment Maintenance',
      description: 'Preventive maintenance scheduling and tracking.',
      icon: <Wrench className="h-6 w-6" />,
    },
    {
      title: 'Performance Analytics',
      description: 'Real-time production metrics and insights.',
      icon: <BarChart3 className="h-6 w-6" />,
    },
    {
      title: 'Supply Chain',
      description: 'End-to-end supply chain management and optimization.',
      icon: <Truck className="h-6 w-6" />,
    },
  ],
  primaryBenefit: {
    title: 'Optimized Manufacturing',
    description:
      'Improve production efficiency, reduce waste, and enhance quality with our comprehensive solution.',
    icon: <Factory className="h-8 w-8" />,
  },
  benefits: [
    {
      title: 'Smart Automation',
      description: 'AI-powered process automation.',
      icon: <Bot className="h-6 w-6" />,
    },
    {
      title: 'Real-time Monitoring',
      description: 'Live production line monitoring.',
      icon: <Gauge className="h-6 w-6" />,
    },
    {
      title: 'Alerts & Notifications',
      description: 'Instant alerts for critical events.',
      icon: <Bell className="h-6 w-6" />,
    },
    {
      title: 'Resource Planning',
      description: 'Efficient resource allocation.',
      icon: <Settings className="h-6 w-6" />,
    },
  ],
  coreFeatures: [
    {
      title: 'Quality Tracking',
      description: 'Advanced quality control systems',
      icon: <Scan className="h-8 w-8" />,
    },
    {
      title: 'Production Analytics',
      description: 'Real-time performance metrics',
      icon: <LineChart className="h-8 w-8" />,
    },
    {
      title: 'Inventory Tracking',
      description: 'Automated stock management',
      icon: <PackageSearch className="h-8 w-8" />,
    },
  ],
  story: {
    quote:
      '"This platform has revolutionized our manufacturing processes. We\'ve seen significant improvements in efficiency, quality, and overall productivity."',
    author: '- Robert Chang',
    role: 'Operations Director, Global Manufacturing Inc.',
    metrics: [
      { value: '35%', label: 'Increased Efficiency' },
      { value: '45%', label: 'Reduced Downtime' },
      { value: '99%', label: 'Quality Rate' },
    ],
  },
  faqs: [
    {
      question: 'How quickly can we implement the system?',
      answer:
        'Implementation typically takes 4-6 weeks, including setup, training, and integration with existing systems.',
    },
    {
      question: 'Can it integrate with our existing machinery?',
      answer:
        'Yes, our system supports integration with most modern manufacturing equipment and legacy systems.',
    },
    {
      question: 'What kind of support do you provide?',
      answer:
        'We offer 24/7 technical support, on-site training, and dedicated implementation specialists.',
    },
    {
      question: 'How do you handle data security?',
      answer:
        'We implement industry-leading security measures, including encryption and regular security audits.',
    },
    {
      question: 'Can it scale with our business?',
      answer:
        'Yes, our platform is designed to scale seamlessly as your manufacturing operations grow.',
    },
  ],
  cta: {
    title: 'Ready to Transform Your Manufacturing Operations?',
    description:
      'Join leading manufacturers using our platform to optimize production and drive growth.',
  },
};

export default function ManufacturingSolutionPage() {
  return <SolutionPage config={config} />;
}
