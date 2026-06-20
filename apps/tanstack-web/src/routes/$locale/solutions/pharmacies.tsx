import { createFileRoute } from '@tanstack/react-router';
import {
  Activity,
  BarChart3,
  Bot,
  Box,
  Calendar,
  ClipboardList,
  Database,
  HeartPulse,
  MessageSquare,
  Pill,
  Receipt,
  Shield,
  ShieldCheck,
  Smartphone,
  Stethoscope,
  Users,
} from '@tuturuuu/icons/lucide';
import {
  SolutionPage,
  type SolutionPageConfig,
} from '../../../components/solutions/solution-page';
import { createPageHead } from '../../../lib/platform/head';

export const Route = createFileRoute('/$locale/solutions/pharmacies')({
  component: PharmaciesSolutionPage,
  head: () =>
    createPageHead({
      description: 'Manage pharmacy workflows and compliance with Tuturuuu.',
      title: 'Pharmacies Solution',
    }),
});

const config: SolutionPageConfig = {
  badge: 'Pharmacy Management Solutions',
  title: 'Modern Solutions for Modern Pharmacies',
  description:
    'Streamline your pharmacy operations, enhance patient care, and ensure compliance with our comprehensive management system.',
  trust: {
    title: 'Trusted by Leading Pharmacies',
    description:
      'Join thousands of pharmacies that have transformed their operations with our platform.',
    icon: <ShieldCheck className="h-12 w-12" />,
  },
  featuresTitle: 'Comprehensive Pharmacy Management',
  features: [
    {
      title: 'Inventory Management',
      description:
        'Real-time tracking of medications and supplies with automated reordering.',
      icon: <Box className="h-6 w-6" />,
    },
    {
      title: 'Prescription Processing',
      description:
        'Streamlined prescription handling with digital verification.',
      icon: <ClipboardList className="h-6 w-6" />,
    },
    {
      title: 'Patient Records',
      description: 'Secure electronic health records and medication history.',
      icon: <Database className="h-6 w-6" />,
    },
    {
      title: 'Insurance Claims',
      description: 'Automated insurance processing and claims management.',
      icon: <Receipt className="h-6 w-6" />,
    },
    {
      title: 'Clinical Services',
      description: 'Support for vaccination programs and health screenings.',
      icon: <Stethoscope className="h-6 w-6" />,
    },
    {
      title: 'Analytics Dashboard',
      description: 'Comprehensive reporting and business intelligence tools.',
      icon: <BarChart3 className="h-6 w-6" />,
    },
  ],
  primaryBenefit: {
    title: 'Enhanced Patient Care',
    description:
      'Improve patient outcomes with advanced medication management and clinical decision support.',
    icon: <Pill className="h-8 w-8" />,
  },
  benefits: [
    {
      title: 'Mobile App Integration',
      description: 'Allow patients to manage prescriptions from their phones.',
      icon: <Smartphone className="h-6 w-6" />,
    },
    {
      title: 'Automated Compliance',
      description: 'Stay compliant with regulatory requirements automatically.',
      icon: <Shield className="h-6 w-6" />,
    },
    {
      title: 'Patient Communication',
      description: 'Automated refill reminders and health notifications.',
      icon: <MessageSquare className="h-6 w-6" />,
    },
    {
      title: 'AI-Powered Insights',
      description:
        'Smart analytics for better patient care and business growth.',
      icon: <Bot className="h-6 w-6" />,
    },
  ],
  coreFeaturesTitle: 'Clinical Services Support',
  coreFeatures: [
    {
      title: 'Health Monitoring',
      description: 'Track patient vitals and health metrics',
      icon: <HeartPulse className="h-8 w-8" />,
    },
    {
      title: 'Appointment Scheduling',
      description: 'Manage vaccinations and consultations',
      icon: <Calendar className="h-8 w-8" />,
    },
    {
      title: 'Health Analytics',
      description: 'Monitor patient health trends',
      icon: <Activity className="h-8 w-8" />,
    },
  ],
  story: {
    icon: <Users className="h-8 w-8" />,
    quote:
      '"The system has revolutionized how we operate. We\'ve seen significant improvements in efficiency and patient satisfaction, while ensuring perfect compliance with regulations."',
    author: '- Dr. Sarah Johnson',
    role: 'Chief Pharmacist, HealthCare Pharmacy',
    metrics: [
      { value: '40%', label: 'Time Saved' },
      { value: '99.9%', label: 'Accuracy Rate' },
      { value: '50%', label: 'Reduced Errors' },
    ],
  },
  faqs: [
    {
      question: 'Is the system HIPAA compliant?',
      answer:
        'Yes, our pharmacy management system is fully HIPAA compliant and includes all necessary security features to protect patient data.',
    },
    {
      question: 'Can it integrate with existing healthcare systems?',
      answer:
        'Yes, we offer integration with major EMR systems, insurance providers, and healthcare networks.',
    },
    {
      question: 'What training and support do you provide?',
      answer:
        'We provide comprehensive training for all staff members and 24/7 technical support.',
    },
    {
      question: 'How do you handle system updates?',
      answer:
        'Regular updates are automatically deployed with zero downtime, ensuring you always have the latest features and security patches.',
    },
    {
      question: 'Can it handle multiple locations?',
      answer:
        'Yes, our system is designed to manage multiple pharmacy locations with centralized control and reporting.',
    },
  ],
  cta: {
    title: 'Ready to Transform Your Pharmacy?',
    description:
      'Join leading pharmacies using our platform to enhance patient care and streamline operations.',
  },
};

export default function PharmaciesSolutionPage() {
  return <SolutionPage config={config} />;
}
