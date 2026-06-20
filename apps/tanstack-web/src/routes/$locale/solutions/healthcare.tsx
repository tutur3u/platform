import { createFileRoute } from '@tanstack/react-router';
import {
  Activity,
  BarChart3,
  Bell,
  Bot,
  Brain,
  Calendar,
  ClipboardList,
  Clock,
  FileText,
  HeartPulse,
  MessageSquare,
  Pill,
  Shield,
  Stethoscope,
  Users,
} from '@tuturuuu/icons/lucide';
import {
  SolutionPage,
  type SolutionPageConfig,
} from '../../../components/solutions/solution-page';
import { createPageHead } from '../../../lib/platform/head';

export const Route = createFileRoute('/$locale/solutions/healthcare')({
  component: HealthcareSolutionPage,
  head: () =>
    createPageHead({
      description:
        'Streamline care coordination and compliance with Tuturuuu for healthcare.',
      title: 'Healthcare Solution',
    }),
});

const config: SolutionPageConfig = {
  badge: 'Healthcare Management Solutions',
  title: 'Transform Your Healthcare Practice',
  description:
    'Streamline patient care, improve efficiency, and ensure compliance with our comprehensive healthcare management platform.',
  trust: {
    title: 'Trusted by Healthcare Professionals',
    description:
      'Join thousands of healthcare providers who have transformed their practice with our platform.',
    icon: <Shield className="h-12 w-12" />,
  },
  featuresTitle: 'Comprehensive Healthcare Management',
  features: [
    {
      title: 'Patient Management',
      description: 'Comprehensive patient records and appointment scheduling.',
      icon: <Users className="h-6 w-6" />,
    },
    {
      title: 'Clinical Records',
      description: 'Secure electronic health records and medical history.',
      icon: <ClipboardList className="h-6 w-6" />,
    },
    {
      title: 'Appointment System',
      description: 'Smart scheduling and patient reminders.',
      icon: <Calendar className="h-6 w-6" />,
    },
    {
      title: 'Prescription Management',
      description: 'Digital prescriptions and medication tracking.',
      icon: <Pill className="h-6 w-6" />,
    },
    {
      title: 'Analytics Dashboard',
      description: 'Insights into practice performance and patient care.',
      icon: <BarChart3 className="h-6 w-6" />,
    },
    {
      title: 'Medical Billing',
      description: 'Streamlined insurance claims and payment processing.',
      icon: <FileText className="h-6 w-6" />,
    },
  ],
  primaryBenefit: {
    title: 'Enhanced Patient Care',
    description:
      'Improve patient outcomes with advanced healthcare management tools and streamlined workflows.',
    icon: <HeartPulse className="h-8 w-8" />,
  },
  benefits: [
    {
      title: 'AI Diagnostics',
      description: 'Advanced diagnostic support tools.',
      icon: <Brain className="h-6 w-6" />,
    },
    {
      title: 'Virtual Care',
      description: 'Telemedicine and remote consultations.',
      icon: <Stethoscope className="h-6 w-6" />,
    },
    {
      title: 'Patient Portal',
      description: 'Self-service portal for patients.',
      icon: <MessageSquare className="h-6 w-6" />,
    },
    {
      title: 'Smart Alerts',
      description: 'Critical updates and notifications.',
      icon: <Bell className="h-6 w-6" />,
    },
  ],
  coreFeatures: [
    {
      title: 'Health Monitoring',
      description: 'Real-time patient vitals tracking',
      icon: <Activity className="h-8 w-8" />,
    },
    {
      title: 'AI Assistance',
      description: 'Smart diagnostic support',
      icon: <Bot className="h-8 w-8" />,
    },
    {
      title: '24/7 Access',
      description: 'Always available patient care',
      icon: <Clock className="h-8 w-8" />,
    },
  ],
  story: {
    quote:
      '"This platform has revolutionized how we deliver healthcare. Patient satisfaction has improved dramatically, and our administrative processes are more efficient than ever."',
    author: '- Dr. James Wilson',
    role: 'Medical Director, Advanced Care Clinic',
    metrics: [
      { value: '40%', label: 'Time Saved' },
      { value: '95%', label: 'Patient Satisfaction' },
      { value: '50%', label: 'Reduced Errors' },
    ],
  },
  faqs: [
    {
      question: 'Is the system HIPAA compliant?',
      answer:
        'Yes, our healthcare management system is fully HIPAA compliant with advanced security features to protect patient data.',
    },
    {
      question: 'Can it integrate with existing medical systems?',
      answer:
        'Yes, we offer integration with major EMR systems, lab systems, and healthcare networks.',
    },
    {
      question: 'What support do you provide?',
      answer:
        'We provide 24/7 technical support, comprehensive training, and dedicated account management.',
    },
    {
      question: 'How do you handle patient data security?',
      answer:
        'We implement bank-grade encryption, regular security audits, and strict access controls.',
    },
    {
      question: 'Can patients access their records?',
      answer:
        'Yes, patients get secure access to their medical records, appointments, and test results through our patient portal.',
    },
  ],
  cta: {
    title: 'Ready to Transform Your Healthcare Practice?',
    description:
      'Join leading healthcare providers using our platform to enhance patient care and streamline operations.',
  },
};

export default function HealthcareSolutionPage() {
  return <SolutionPage config={config} />;
}
