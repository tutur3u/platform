import { createFileRoute } from '@tanstack/react-router';
import {
  BarChart3,
  ChefHat,
  Clock,
  CreditCard,
  FileText,
  Gift,
  HeartHandshake,
  LayoutDashboard,
  Receipt,
  ShoppingBag,
  Smartphone,
  Star,
  Store,
  Truck,
  Utensils,
  Wallet,
} from '@tuturuuu/icons/lucide';
import {
  SolutionPage,
  type SolutionPageConfig,
} from '../../../components/solutions/solution-page';
import { createPageHead } from '../../../lib/platform/head';

export const Route = createFileRoute('/$locale/solutions/restaurants')({
  component: RestaurantsSolutionPage,
  head: () =>
    createPageHead({
      description:
        'Run restaurant operations, scheduling, and loyalty with Tuturuuu.',
      title: 'Restaurant Solution',
    }),
});

const config: SolutionPageConfig = {
  badge: 'Restaurant Management Solutions',
  title: 'Transform Your Restaurant Operations',
  description:
    'Streamline operations, boost efficiency, and delight customers with our comprehensive restaurant management platform.',
  trust: {
    title: 'Trusted by Leading Restaurants Worldwide',
    description:
      'Join thousands of restaurants that have transformed their operations with our platform.',
    icon: <Star className="h-12 w-12" />,
  },
  featuresTitle: 'Everything You Need to Succeed',
  features: [
    {
      title: 'Smart POS System',
      description:
        'Streamline orders and payments with our intuitive point-of-sale system.',
      icon: <CreditCard className="h-6 w-6" />,
    },
    {
      title: 'Inventory Management',
      description:
        'Track ingredients and supplies in real-time with automated alerts.',
      icon: <Store className="h-6 w-6" />,
    },
    {
      title: 'Online Ordering',
      description:
        'Accept orders through your website and mobile app seamlessly.',
      icon: <ShoppingBag className="h-6 w-6" />,
    },
    {
      title: 'Table Management',
      description: 'Optimize seating arrangements and reduce wait times.',
      icon: <LayoutDashboard className="h-6 w-6" />,
    },
    {
      title: 'Staff Scheduling',
      description:
        'Manage employee shifts and performance tracking efficiently.',
      icon: <Clock className="h-6 w-6" />,
    },
    {
      title: 'Analytics & Reports',
      description:
        'Make data-driven decisions with comprehensive business insights.',
      icon: <BarChart3 className="h-6 w-6" />,
    },
  ],
  primaryBenefit: {
    title: "Boost Your Restaurant's Efficiency",
    description:
      'Streamline operations, reduce costs, and increase customer satisfaction with our comprehensive solution.',
    icon: <Utensils className="h-8 w-8" />,
  },
  benefits: [
    {
      title: 'Digital Menu Management',
      description: 'Update prices and items instantly across all platforms.',
      icon: <FileText className="h-6 w-6" />,
    },
    {
      title: 'Customer Loyalty Program',
      description: 'Reward regular customers and boost retention.',
      icon: <Gift className="h-6 w-6" />,
    },
    {
      title: 'Mobile App Integration',
      description: 'Reach customers on their preferred devices.',
      icon: <Smartphone className="h-6 w-6" />,
    },
    {
      title: 'Kitchen Display System',
      description: 'Streamline kitchen operations and order fulfillment.',
      icon: <ChefHat className="h-6 w-6" />,
    },
  ],
  coreFeaturesTitle: 'Seamless Integrations',
  coreFeatures: [
    {
      title: 'Payment Processors',
      description: 'Connect with major payment providers',
      icon: <Wallet className="h-8 w-8" />,
    },
    {
      title: 'Delivery Services',
      description: 'Integrate with popular delivery platforms',
      icon: <Truck className="h-8 w-8" />,
    },
    {
      title: 'Accounting Software',
      description: 'Sync with your accounting system',
      icon: <Receipt className="h-8 w-8" />,
    },
  ],
  story: {
    icon: <HeartHandshake className="h-8 w-8" />,
    quote:
      '"Since implementing this system, we\'ve seen a 30% increase in efficiency and a 25% boost in customer satisfaction. The platform has transformed how we operate."',
    author: '- John Smith',
    role: 'Owner, The Gourmet Kitchen',
    metrics: [
      { value: '30%', label: 'Increased Efficiency' },
      { value: '25%', label: 'Higher Satisfaction' },
      { value: '2x', label: 'Revenue Growth' },
    ],
  },
  faqs: [
    {
      question: 'How quickly can I get started with the system?',
      answer:
        'Our restaurant management system can be set up within 24-48 hours. We provide comprehensive training and support to ensure a smooth transition.',
    },
    {
      question: 'Is the system suitable for multiple locations?',
      answer:
        'Yes, our system is designed to handle multiple locations with centralized management and reporting capabilities.',
    },
    {
      question: 'What kind of support do you provide?',
      answer:
        '24/7 technical support, regular system updates, and dedicated account management for enterprise clients.',
    },
    {
      question: 'Can I integrate with my existing systems?',
      answer:
        'Yes, we offer integration with popular accounting, delivery, and payment processing systems.',
    },
    {
      question: 'How secure is the payment processing?',
      answer:
        'We use bank-grade encryption and are fully PCI DSS compliant to ensure secure transactions.',
    },
  ],
  cta: {
    title: 'Ready to Transform Your Restaurant?',
    description:
      'Join thousands of successful restaurants using our platform to streamline operations and delight customers.',
  },
};

export default function RestaurantsSolutionPage() {
  return <SolutionPage config={config} />;
}
