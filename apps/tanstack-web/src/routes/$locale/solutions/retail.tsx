import { createFileRoute } from '@tanstack/react-router';
import {
  BarChart3,
  Bell,
  Box,
  CreditCard,
  DollarSign,
  Gift,
  LineChart,
  PackageSearch,
  QrCode,
  Receipt,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Store,
  Tag,
} from '@tuturuuu/icons/lucide';
import {
  SolutionPage,
  type SolutionPageConfig,
} from '../../../components/solutions/solution-page';
import { createPageHead } from '../../../lib/platform/head';

export const Route = createFileRoute('/$locale/solutions/retail')({
  component: RetailSolutionPage,
  head: () =>
    createPageHead({
      description:
        'Connect stores, inventory, and customer communications with Tuturuuu.',
      title: 'Retail Solution',
    }),
});

const config: SolutionPageConfig = {
  badge: 'Retail Management Solutions',
  title: 'Transform Your Retail Business',
  description:
    'Streamline operations, boost sales, and delight customers with our comprehensive retail management platform.',
  trust: {
    title: 'Trusted by Leading Retailers',
    description:
      'Join thousands of retailers who have transformed their operations with our platform.',
    icon: <ShoppingBag className="h-12 w-12" />,
  },
  featuresTitle: 'Comprehensive Retail Management',
  features: [
    {
      title: 'Point of Sale',
      description: 'Fast and intuitive POS system for seamless transactions.',
      icon: <CreditCard className="h-6 w-6" />,
    },
    {
      title: 'Inventory Management',
      description: 'Real-time tracking and automated reordering.',
      icon: <Box className="h-6 w-6" />,
    },
    {
      title: 'Customer Loyalty',
      description: 'Reward programs and customer relationship management.',
      icon: <Gift className="h-6 w-6" />,
    },
    {
      title: 'Sales Analytics',
      description: 'Comprehensive sales reporting and insights.',
      icon: <BarChart3 className="h-6 w-6" />,
    },
    {
      title: 'Multi-Store',
      description: 'Manage multiple locations from one platform.',
      icon: <Store className="h-6 w-6" />,
    },
    {
      title: 'E-commerce',
      description: 'Integrated online store and inventory sync.',
      icon: <ShoppingCart className="h-6 w-6" />,
    },
  ],
  primaryBenefit: {
    title: 'Increased Revenue',
    description:
      'Boost your sales with smart inventory management, customer insights, and optimized pricing strategies.',
    icon: <DollarSign className="h-8 w-8" />,
  },
  benefits: [
    {
      title: 'Smart Pricing',
      description: 'AI-powered price optimization.',
      icon: <Tag className="h-6 w-6" />,
    },
    {
      title: 'Real-time Alerts',
      description: 'Instant stock level notifications.',
      icon: <Bell className="h-6 w-6" />,
    },
    {
      title: 'Digital Receipts',
      description: 'Eco-friendly paperless options.',
      icon: <Receipt className="h-6 w-6" />,
    },
    {
      title: 'Resource Planning',
      description: 'Staff scheduling and management.',
      icon: <Settings className="h-6 w-6" />,
    },
  ],
  coreFeatures: [
    {
      title: 'Smart Scanning',
      description: 'Quick barcode and QR code scanning',
      icon: <QrCode className="h-8 w-8" />,
    },
    {
      title: 'Sales Analytics',
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
      '"This platform has revolutionized our retail operations. We\'ve seen significant improvements in efficiency, sales, and customer satisfaction."',
    author: '- Sarah Johnson',
    role: 'Operations Director, Fashion Retail Co.',
    metrics: [
      { value: '45%', label: 'Increased Sales' },
      { value: '60%', label: 'Faster Checkout' },
      { value: '30%', label: 'Cost Reduction' },
    ],
  },
  faqs: [
    {
      question: 'How quickly can we get started?',
      answer:
        'You can start using our retail management system within 24 hours. Our team will help with setup and training.',
    },
    {
      question: 'Can it integrate with my existing hardware?',
      answer:
        'Yes, our system is compatible with most POS hardware, barcode scanners, and receipt printers.',
    },
    {
      question: 'What kind of support do you provide?',
      answer:
        'We offer 24/7 technical support, on-site training, and dedicated account managers for enterprise clients.',
    },
    {
      question: 'Is it suitable for small businesses?',
      answer:
        'Absolutely! Our platform is scalable and offers plans suitable for businesses of all sizes.',
    },
    {
      question: 'How secure are the transactions?',
      answer:
        'We use bank-grade encryption and comply with PCI DSS standards to ensure secure transactions.',
    },
  ],
  cta: {
    title: 'Ready to Transform Your Retail Business?',
    description:
      'Join leading retailers using our platform to optimize operations and drive growth.',
  },
};

export default function RetailSolutionPage() {
  return <SolutionPage config={config} />;
}
