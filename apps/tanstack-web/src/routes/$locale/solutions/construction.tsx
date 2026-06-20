import { createFileRoute } from '@tanstack/react-router';
import {
  BarChart3,
  Building2,
  Calendar,
  ClipboardList,
  Clock,
  FileText,
  Hammer,
  HardHat,
  LineChart,
  MessageSquare,
  Settings,
  Shield,
  Truck,
  Users,
  Wrench,
} from '@tuturuuu/icons/lucide';
import {
  SolutionPage,
  type SolutionPageConfig,
} from '../../../components/solutions/solution-page';
import { createPageHead } from '../../../lib/platform/head';

export const Route = createFileRoute('/$locale/solutions/construction')({
  component: ConstructionSolutionPage,
  head: () =>
    createPageHead({
      description:
        'Coordinate crews and projects with Tuturuuu for construction teams.',
      title: 'Construction Solution',
    }),
});

const config: SolutionPageConfig = {
  badge: 'Construction Management Solutions',
  title: 'Transform Your Construction Business',
  description:
    'Streamline project management, improve efficiency, and ensure safety with our comprehensive construction management platform.',
  trust: {
    title: 'Trusted by Leading Construction Companies',
    description:
      'Join thousands of construction professionals who have transformed their operations with our platform.',
    icon: <HardHat className="h-12 w-12" />,
  },
  featuresTitle: 'Comprehensive Construction Management',
  features: [
    {
      title: 'Project Management',
      description: 'Comprehensive project planning and execution tools.',
      icon: <Building2 className="h-6 w-6" />,
    },
    {
      title: 'Resource Planning',
      description: 'Efficient allocation of equipment and personnel.',
      icon: <Wrench className="h-6 w-6" />,
    },
    {
      title: 'Safety Compliance',
      description: 'Ensure workplace safety and regulatory compliance.',
      icon: <Shield className="h-6 w-6" />,
    },
    {
      title: 'Document Management',
      description: 'Centralized storage for plans and permits.',
      icon: <FileText className="h-6 w-6" />,
    },
    {
      title: 'Progress Tracking',
      description: 'Real-time monitoring of construction progress.',
      icon: <BarChart3 className="h-6 w-6" />,
    },
    {
      title: 'Equipment Management',
      description: 'Track and maintain construction equipment.',
      icon: <Truck className="h-6 w-6" />,
    },
  ],
  primaryBenefit: {
    title: 'Enhanced Project Management',
    description:
      'Improve project outcomes with advanced planning tools and real-time progress tracking.',
    icon: <Hammer className="h-8 w-8" />,
  },
  benefits: [
    {
      title: 'Task Management',
      description: 'Streamlined workflow organization.',
      icon: <ClipboardList className="h-6 w-6" />,
    },
    {
      title: 'Team Communication',
      description: 'Real-time site coordination.',
      icon: <MessageSquare className="h-6 w-6" />,
    },
    {
      title: 'Schedule Optimization',
      description: 'Smart project timeline planning.',
      icon: <Calendar className="h-6 w-6" />,
    },
    {
      title: 'Resource Allocation',
      description: 'Efficient resource management.',
      icon: <Settings className="h-6 w-6" />,
    },
  ],
  coreFeatures: [
    {
      title: 'Team Management',
      description: 'Efficient workforce coordination',
      icon: <Users className="h-8 w-8" />,
    },
    {
      title: 'Project Analytics',
      description: 'Real-time performance tracking',
      icon: <LineChart className="h-8 w-8" />,
    },
    {
      title: 'Timeline Management',
      description: 'Smart scheduling and planning',
      icon: <Clock className="h-8 w-8" />,
    },
  ],
  story: {
    quote:
      '"This platform has revolutionized how we manage construction projects. We\'ve seen significant improvements in efficiency, safety, and project delivery times."',
    author: '- John Anderson',
    role: 'Project Director, Premier Construction Group',
    metrics: [
      { value: '35%', label: 'Faster Project Delivery' },
      { value: '45%', label: 'Cost Reduction' },
      { value: '99%', label: 'Safety Compliance' },
    ],
  },
  faqs: [
    {
      question: 'How quickly can we implement the system?',
      answer:
        'Implementation typically takes 2-3 weeks, including staff training and data migration.',
    },
    {
      question: 'Can it handle multiple construction projects?',
      answer:
        'Yes, our platform is designed to manage multiple projects simultaneously with comprehensive tracking and reporting.',
    },
    {
      question: 'What kind of support do you provide?',
      answer:
        'We offer 24/7 technical support, on-site training, and dedicated project implementation specialists.',
    },
    {
      question: 'Is it suitable for different types of construction?',
      answer:
        'Yes, our platform is customizable for residential, commercial, industrial, and infrastructure projects.',
    },
    {
      question: 'How do you ensure data security?',
      answer:
        'We implement industry-leading security measures and regular backups to protect your project data.',
    },
  ],
  cta: {
    title: 'Ready to Transform Your Construction Business?',
    description:
      'Join leading construction companies using our platform to improve project management and drive growth.',
  },
};

export default function ConstructionSolutionPage() {
  return <SolutionPage config={config} />;
}
