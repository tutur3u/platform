import { createFileRoute } from '@tanstack/react-router';
import {
  BarChart3,
  Bell,
  Book,
  BookOpen,
  Brain,
  Calendar,
  Clock,
  FileText,
  GraduationCap,
  LineChart,
  MessageSquare,
  Monitor,
  Settings,
  Users,
  Video,
} from '@tuturuuu/icons/lucide';
import {
  SolutionPage,
  type SolutionPageConfig,
} from '../../../components/solutions/solution-page';
import { createPageHead } from '../../../lib/platform/head';

export const Route = createFileRoute('/$locale/solutions/education')({
  component: EducationSolutionPage,
  head: () =>
    createPageHead({
      description:
        'Empower classrooms and campuses with the Tuturuuu education suite.',
      title: 'Education Solution',
    }),
});

const config: SolutionPageConfig = {
  badge: 'Education Management Solutions',
  title: 'Transform Your Educational Institution',
  description:
    'Empower educators and students with our comprehensive education management platform.',
  trust: {
    title: 'Trusted by Leading Educational Institutions',
    description:
      'Join thousands of schools and universities who have transformed their educational experience with our platform.',
    icon: <GraduationCap className="h-12 w-12" />,
  },
  featuresTitle: 'Comprehensive Education Management',
  features: [
    {
      title: 'Learning Management',
      description: 'Comprehensive course creation and delivery platform.',
      icon: <BookOpen className="h-6 w-6" />,
    },
    {
      title: 'Student Progress',
      description: 'Track and analyze student performance.',
      icon: <BarChart3 className="h-6 w-6" />,
    },
    {
      title: 'Virtual Classroom',
      description: 'Interactive online learning environment.',
      icon: <Monitor className="h-6 w-6" />,
    },
    {
      title: 'Assignment Management',
      description: 'Create, distribute, and grade assignments.',
      icon: <FileText className="h-6 w-6" />,
    },
    {
      title: 'Communication Tools',
      description: 'Seamless interaction between students and teachers.',
      icon: <MessageSquare className="h-6 w-6" />,
    },
    {
      title: 'Resource Library',
      description: 'Centralized repository for learning materials.',
      icon: <Book className="h-6 w-6" />,
    },
  ],
  primaryBenefit: {
    title: 'Enhanced Learning Experience',
    description:
      'Improve student engagement and outcomes with interactive learning tools and personalized instruction.',
    icon: <Users className="h-8 w-8" />,
  },
  benefits: [
    {
      title: 'AI Learning',
      description: 'Personalized learning paths.',
      icon: <Brain className="h-6 w-6" />,
    },
    {
      title: 'Real-time Updates',
      description: 'Instant progress notifications.',
      icon: <Bell className="h-6 w-6" />,
    },
    {
      title: 'Time Management',
      description: 'Schedule optimization tools.',
      icon: <Clock className="h-6 w-6" />,
    },
    {
      title: 'Resource Planning',
      description: 'Efficient resource allocation.',
      icon: <Settings className="h-6 w-6" />,
    },
  ],
  coreFeatures: [
    {
      title: 'Video Learning',
      description: 'Interactive video lessons',
      icon: <Video className="h-8 w-8" />,
    },
    {
      title: 'Performance Analytics',
      description: 'Detailed progress tracking',
      icon: <LineChart className="h-8 w-8" />,
    },
    {
      title: 'Schedule Management',
      description: 'Automated timetabling',
      icon: <Calendar className="h-8 w-8" />,
    },
  ],
  story: {
    quote:
      '"This platform has revolutionized how we deliver education. We\'ve seen remarkable improvements in student engagement, performance, and overall learning outcomes."',
    author: '- Dr. Michael Chen',
    role: 'Dean of Academic Affairs, International University',
    metrics: [
      { value: '40%', label: 'Improved Engagement' },
      { value: '50%', label: 'Time Saved' },
      { value: '95%', label: 'Student Satisfaction' },
    ],
  },
  faqs: [
    {
      question: 'How quickly can we implement the system?',
      answer:
        'Implementation typically takes 2-4 weeks, including setup, training, and data migration.',
    },
    {
      question: 'Can it integrate with existing school systems?',
      answer:
        'Yes, our platform integrates with most Student Information Systems (SIS) and other educational tools.',
    },
    {
      question: 'What kind of support do you provide?',
      answer:
        'We offer comprehensive support including technical assistance, training sessions, and dedicated account managers.',
    },
    {
      question: 'Is it suitable for different education levels?',
      answer:
        'Yes, our platform is customizable for K-12, higher education, and professional training programs.',
    },
    {
      question: 'How do you handle data privacy?',
      answer:
        'We comply with FERPA, GDPR, and other education data privacy regulations to ensure student data protection.',
    },
  ],
  cta: {
    title: 'Ready to Transform Your Educational Institution?',
    description:
      'Join leading educational institutions using our platform to enhance learning and drive student success.',
  },
};

export default function EducationSolutionPage() {
  return <SolutionPage config={config} />;
}
