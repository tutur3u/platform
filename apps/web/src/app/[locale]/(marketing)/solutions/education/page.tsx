'use client';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@repo/ui/components/ui/accordion';
import { Badge } from '@repo/ui/components/ui/badge';
import { Button } from '@repo/ui/components/ui/button';
import { Card } from '@repo/ui/components/ui/card';
import { motion } from 'framer-motion';
import {
  BookOpen,
  BrainCircuit,
  Calendar,
  CheckCircle2,
  Globe,
  GraduationCap,
  Layout,
  Library,
  LineChart,
  Network,
  Presentation,
  School,
  ShieldCheck,
  Trophy,
  Users,
  Video,
  Wand2,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const features = [
  {
    title: 'Smart Learning Management',
    description:
      "AI-powered LMS that adapts to each student's learning style and pace.",
    icon: <BrainCircuit className="h-6 w-6" />,
  },
  {
    title: 'Interactive Classrooms',
    description:
      'Engage students with real-time collaboration and virtual classroom tools.',
    icon: <Presentation className="h-6 w-6" />,
  },
  {
    title: 'Progress Tracking',
    description:
      'Comprehensive analytics to monitor student performance and engagement.',
    icon: <LineChart className="h-6 w-6" />,
  },
  {
    title: 'Course Creation',
    description:
      'Easy-to-use tools for creating and managing educational content.',
    icon: <BookOpen className="h-6 w-6" />,
  },
  {
    title: 'Virtual Classrooms',
    description: 'Seamless video conferencing integration for remote learning.',
    icon: <Video className="h-6 w-6" />,
  },
  {
    title: 'AI Assessment',
    description: 'Automated grading and personalized feedback powered by AI.',
    icon: <Wand2 className="h-6 w-6" />,
  },
];

const useCases = [
  {
    title: 'K-12 Education',
    description:
      'Comprehensive tools for primary and secondary education management.',
    items: [
      'Interactive lessons',
      'Parent communication',
      'Homework management',
      'Progress reports',
    ],
  },
  {
    title: 'Higher Education',
    description: 'Advanced features for universities and colleges.',
    items: [
      'Course management',
      'Research collaboration',
      'Student analytics',
      'Resource sharing',
    ],
  },
  {
    title: 'Professional Training',
    description: 'Corporate training and professional development solutions.',
    items: [
      'Skill assessments',
      'Certification programs',
      'Employee onboarding',
      'Performance tracking',
    ],
  },
];

const testimonials = [
  {
    quote:
      "The AI-powered learning tools have transformed how we teach. Our students' engagement has increased dramatically.",
    author: 'Dr. Sarah Johnson',
    role: 'Education Director',
    institution: 'International Academy',
  },
  {
    quote:
      'The analytics provide invaluable insights into student performance. We can now identify and address learning gaps early.',
    author: 'Prof. Michael Chen',
    role: 'Department Head',
    institution: 'Tech University',
  },
  {
    quote:
      'Implementation was seamless, and the support team has been exceptional. A game-changer for our institution.',
    author: 'Lisa Rodriguez',
    role: 'IT Administrator',
    institution: 'Valley School District',
  },
];

const achievements = [
  { number: '250K+', label: 'Active Students' },
  { number: '1.5M+', label: 'Courses Completed' },
  { number: '98%', label: 'Success Rate' },
  { number: '50+', label: 'Countries' },
];

const learningData = {
  courses: [
    { month: 'Jan', completed: 45, active: 120, newEnroll: 65 },
    { month: 'Feb', completed: 52, active: 140, newEnroll: 78 },
    { month: 'Mar', completed: 61, active: 158, newEnroll: 89 },
    { month: 'Apr', completed: 67, active: 172, newEnroll: 95 },
    { month: 'May', completed: 75, active: 188, newEnroll: 102 },
    { month: 'Jun', completed: 89, active: 201, newEnroll: 111 },
  ],
};

const satisfactionData = [
  { name: 'Very Satisfied', value: 45, color: 'hsl(var(--light-green))' },
  { name: 'Satisfied', value: 35, color: 'hsl(var(--light-blue))' },
  { name: 'Neutral', value: 15, color: 'hsl(var(--light-purple))' },
  { name: 'Unsatisfied', value: 5, color: 'hsl(var(--light-red))' },
];

const enhancedFaqs = [
  {
    question: 'How does the AI-powered learning system work?',
    answer:
      'Our AI system analyzes student performance, learning patterns, and engagement levels to create personalized learning paths. It adapts in real-time to provide optimal content delivery and support.',
  },
  {
    question: 'What security measures are in place?',
    answer:
      'We implement enterprise-grade encryption, regular security audits, and comply with FERPA and GDPR requirements to ensure student data protection.',
  },
  {
    question: 'Can it integrate with existing systems?',
    answer:
      'Yes, our platform offers robust API integration capabilities and supports common education technology standards for seamless integration with existing systems.',
  },
  {
    question: 'What kind of support do you offer?',
    answer:
      'We provide 24/7 technical support, dedicated customer success managers, and comprehensive onboarding assistance. Our team also offers regular training sessions and educational webinars.',
  },
  {
    question: 'How customizable is the platform?',
    answer:
      "The platform is highly customizable with white-labeling options, custom branding, configurable workflows, and API integrations. You can tailor the learning experience to match your institution's needs.",
  },
  {
    question: 'What are the hardware requirements?',
    answer:
      'Our cloud-based platform works on any modern web browser. For optimal video conferencing, we recommend a stable internet connection and updated devices with camera and microphone capabilities.',
  },
  {
    question: 'How do you handle data backup?',
    answer:
      'We maintain automated daily backups with 30-day retention, geo-redundant storage, and disaster recovery protocols. Your data is always safe and accessible.',
  },
];

export default function EducationPage() {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.2 },
    },
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { duration: 0.5 },
    },
  };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="container mx-auto mt-8 flex max-w-6xl flex-col gap-6 px-3 py-16 lg:gap-14 lg:py-24"
    >
      {/* Enhanced Hero Section */}
      <motion.div variants={itemVariants} className="mb-8 text-center">
        <Badge variant="secondary" className="mb-4">
          Education Solutions
        </Badge>
        <h1 className="mb-4 text-4xl font-bold">Transform Education with AI</h1>
        <p className="text-muted-foreground mx-auto max-w-2xl text-lg">
          Empower educators and students with intelligent tools for personalized
          learning, seamless collaboration, and enhanced educational outcomes.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Button size="lg" asChild>
            <Link href="/contact">Schedule Demo</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/pricing">View Pricing</Link>
          </Button>
        </div>
        <motion.div
          className="absolute inset-0 -z-10"
          animate={{
            background: [
              'radial-gradient(circle at 50% 50%, rgba(var(--primary-rgb), 0.1) 0%, transparent 50%)',
              'radial-gradient(circle at 60% 60%, rgba(var(--primary-rgb), 0.15) 0%, transparent 50%)',
              'radial-gradient(circle at 40% 40%, rgba(var(--primary-rgb), 0.1) 0%, transparent 50%)',
            ],
          }}
          transition={{ duration: 5, repeat: Infinity }}
        />
      </motion.div>

      {/* Animated Hero Image */}
      <motion.div
        variants={itemVariants}
        whileHover={{ scale: 1.02 }}
        className="from-primary/10 to-primary/5 relative mx-auto mb-24 aspect-[1.67] w-full max-w-5xl overflow-hidden rounded-xl border bg-gradient-to-br"
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <Image
            src="/media/marketing/education.png"
            alt="Education Platform Interface"
            width={2980}
            height={1786}
          />
        </div>
      </motion.div>

      {/* Trust Section */}
      <section className="mb-24">
        <Card className="border-primary bg-primary/5 p-8">
          <div className="mx-auto flex max-w-4xl flex-col items-center gap-4 text-center">
            <ShieldCheck className="text-primary h-12 w-12" />
            <h2 className="text-2xl font-bold">
              Trusted by Educational Institutions
            </h2>
            <p className="text-muted-foreground">
              Our platform is designed to meet the highest standards of security
              and privacy, ensuring a safe learning environment for students of
              all ages.
            </p>
          </div>
        </Card>
      </section>

      {/* Interactive Features Grid */}
      <motion.section variants={itemVariants} className="mb-24">
        <h2 className="mb-12 text-center text-3xl font-bold">
          Powerful Educational Tools
        </h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <motion.div
              key={feature.title}
              variants={itemVariants}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Card className="hover:border-primary h-full p-6 transition-colors">
                <div className="mb-4 flex items-center gap-3">
                  <div className="text-primary">{feature.icon}</div>
                  <h3 className="text-xl font-semibold">{feature.title}</h3>
                </div>
                <p className="text-muted-foreground">{feature.description}</p>
              </Card>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* Use Cases */}
      <section className="mb-24">
        <h2 className="mb-12 text-center text-3xl font-bold">
          Solutions For Every Level
        </h2>
        <div className="grid gap-8 md:grid-cols-3">
          {useCases.map((useCase) => (
            <Card key={useCase.title} className="p-6">
              <School className="text-primary mb-4 h-8 w-8" />
              <h3 className="mb-2 text-xl font-semibold">{useCase.title}</h3>
              <p className="text-muted-foreground mb-4">
                {useCase.description}
              </p>
              <ul className="text-muted-foreground space-y-2">
                {useCase.items.map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="bg-primary h-1.5 w-1.5 rounded-full" />
                    {item}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </section>

      {/* New Testimonials Section */}
      <motion.section variants={itemVariants} className="mb-24">
        <h2 className="mb-12 text-center text-3xl font-bold">
          Trusted by Educators
        </h2>
        <div className="grid gap-8 md:grid-cols-3">
          {testimonials.map((testimonial, index) => (
            <motion.div
              key={index}
              variants={itemVariants}
              whileHover={{ y: -5 }}
            >
              <Card className="h-full p-6">
                <div className="text-primary mb-4">❝</div>
                <p className="text-muted-foreground mb-4">
                  {testimonial.quote}
                </p>
                <div className="mt-auto">
                  <p className="font-semibold">{testimonial.author}</p>
                  <p className="text-muted-foreground text-sm">
                    {testimonial.role}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {testimonial.institution}
                  </p>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* Enhanced Success Metrics with Animation */}
      <motion.section
        variants={itemVariants}
        className="mb-24"
        whileInView={{ scale: [0.95, 1] }}
        transition={{ duration: 0.5 }}
      >
        <Card className="overflow-hidden">
          <div className="grid gap-8 p-8 md:grid-cols-3">
            {[
              { metric: '95%', label: 'Student Satisfaction', icon: Users },
              {
                metric: '40%',
                label: 'Improved Engagement',
                icon: GraduationCap,
              },
              { metric: '2x', label: 'Learning Efficiency', icon: BookOpen },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <stat.icon className="text-primary mx-auto mb-4 h-8 w-8" />
                <div className="text-3xl font-bold">{stat.metric}</div>
                <div className="text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>
        </Card>
      </motion.section>

      <motion.section variants={itemVariants} className="mb-24">
        <h2 className="mb-12 text-center text-3xl font-bold">
          Learning Analytics
        </h2>
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="p-6">
            <h3 className="mb-4 text-xl font-bold">Course Activity</h3>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={learningData.courses}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Bar
                    dataKey="completed"
                    name="Completed"
                    fill="hsl(var(--light-green))"
                  />
                  <Bar
                    dataKey="active"
                    name="Active"
                    fill="hsl(var(--light-blue))"
                  />
                  <Bar
                    dataKey="newEnroll"
                    name="New Enrollments"
                    fill="hsl(var(--light-orange))"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Student Satisfaction */}
          <Card className="p-6">
            <h3 className="mb-4 text-xl font-bold">Student Satisfaction</h3>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={satisfactionData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label
                  >
                    {satisfactionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      </motion.section>

      {/* New ROI Calculator Section */}
      <motion.section variants={itemVariants} className="mb-24">
        <Card className="p-8">
          <h2 className="mb-8 text-center text-3xl font-bold">
            Calculate Your ROI
          </h2>
          <div className="grid gap-8 md:grid-cols-2">
            <div className="space-y-4">
              <h3 className="text-xl font-bold">Potential Annual Savings</h3>
              <ul className="space-y-2">
                <li className="flex items-center justify-between">
                  <span>Administrative Time Savings</span>
                  <span className="text-primary font-bold">$24,000</span>
                </li>
                <li className="flex items-center justify-between">
                  <span>Reduced Training Costs</span>
                  <span className="text-primary font-bold">$18,000</span>
                </li>
                <li className="flex items-center justify-between">
                  <span>Improved Learning Outcomes</span>
                  <span className="text-primary font-bold">$32,000</span>
                </li>
                <li className="border-border flex items-center justify-between border-t pt-2">
                  <span className="font-bold">Total Annual Savings</span>
                  <span className="text-primary font-bold">$74,000</span>
                </li>
              </ul>
            </div>
            <div className="flex flex-col justify-center">
              <Button size="lg" className="mb-4">
                Calculate Your Custom ROI
              </Button>
              <p className="text-muted-foreground text-center text-sm">
                Book a consultation with our team to get a detailed ROI analysis
                for your institution
              </p>
            </div>
          </div>
        </Card>
      </motion.section>

      {/* Achievements Grid */}
      <motion.section variants={itemVariants} className="mb-24">
        <div className="grid gap-4 md:grid-cols-4">
          {achievements.map((achievement) => (
            <Card
              key={achievement.label}
              className="bg-primary/5 p-6 text-center"
            >
              <motion.div
                initial={{ scale: 1 }}
                whileHover={{ scale: 1.05 }}
                className="text-primary mb-2 text-3xl font-bold"
              >
                {achievement.number}
              </motion.div>
              <div className="text-muted-foreground">{achievement.label}</div>
            </Card>
          ))}
        </div>
      </motion.section>

      {/* Bento Grid Features */}
      <motion.section variants={itemVariants} className="mb-24">
        <h2 className="mb-12 text-center text-3xl font-bold">
          Learning Excellence
        </h2>
        <div className="grid gap-4 md:grid-cols-4 md:grid-rows-2">
          <Card className="bg-primary/5 md:col-span-2 md:row-span-2">
            <div className="flex h-full flex-col p-6">
              <Library className="text-primary mb-4 h-8 w-8" />
              <h3 className="mb-2 text-xl font-bold">Comprehensive Library</h3>
              <p className="text-muted-foreground">
                Access thousands of curated educational resources, textbooks,
                and multimedia content.
              </p>
              <div className="bg-background/50 mt-4 flex-grow rounded-lg p-4">
                <div className="space-y-2">
                  <div className="bg-primary/20 h-2 w-3/4 rounded" />
                  <div className="bg-primary/20 h-2 w-1/2 rounded" />
                  <div className="bg-primary/20 h-2 w-2/3 rounded" />
                </div>
              </div>
            </div>
          </Card>

          {[
            {
              icon: Globe,
              title: 'Global Reach',
              desc: 'Connect with learners worldwide',
            },
            {
              icon: Trophy,
              title: 'Gamification',
              desc: 'Earn badges and certificates',
            },
            {
              icon: Network,
              title: 'Smart Network',
              desc: 'AI-powered learning paths',
            },
            {
              icon: Layout,
              title: 'Custom Dashboard',
              desc: 'Personalized learning space',
            },
          ].map((item) => (
            <Card key={item.title} className="group overflow-hidden">
              <motion.div
                className="flex h-full flex-col p-6"
                whileHover={{ y: -5 }}
              >
                <item.icon className="text-primary mb-4 h-6 w-6" />
                <h3 className="mb-2 font-bold">{item.title}</h3>
                <p className="text-muted-foreground text-sm">{item.desc}</p>
                <div className="bg-primary/10 mt-4 h-1 w-0 transition-all group-hover:w-full" />
              </motion.div>
            </Card>
          ))}
        </div>
      </motion.section>

      {/* Timeline Section */}
      <motion.section variants={itemVariants} className="mb-24">
        <h2 className="mb-12 text-center text-3xl font-bold">
          Implementation Journey
        </h2>
        <div className="relative">
          <div className="bg-primary/20 absolute left-1/2 h-full w-px" />
          {[
            { icon: CheckCircle2, title: 'Platform Setup', duration: 'Week 1' },
            { icon: Calendar, title: 'Staff Training', duration: 'Week 2' },
            { icon: BarChart, title: 'Data Migration', duration: 'Week 3' },
            {
              icon: GraduationCap,
              title: 'Full Deployment',
              duration: 'Week 4',
            },
          ].map((step, index) => (
            <motion.div
              key={step.title}
              variants={itemVariants}
              className={`mb-8 flex items-center gap-4 ${
                index % 2 === 0 ? 'flex-row-reverse md:pr-32' : 'md:pl-32'
              }`}
            >
              <Card className="flex-1 p-6">
                <div className="flex items-center gap-4">
                  <step.icon className="text-primary h-6 w-6" />
                  <div>
                    <h3 className="font-bold">{step.title}</h3>
                    <p className="text-muted-foreground text-sm">
                      {step.duration}
                    </p>
                  </div>
                </div>
              </Card>
              <div className="bg-primary z-10 h-4 w-4 rounded-full" />
            </motion.div>
          ))}
        </div>
      </motion.section>

      <motion.section variants={itemVariants}>
        <h2 className="mb-12 text-center text-3xl font-bold">
          Frequently Asked Questions
        </h2>
        <div className="grid gap-6 md:grid-cols-2">
          <Accordion type="single" className="grid h-fit gap-4" collapsible>
            {enhancedFaqs
              .slice(0, Math.ceil(enhancedFaqs.length / 2))
              .map((faq, index) => (
                <AccordionItem key={index} value={`item-${index}`}>
                  <AccordionTrigger>{faq.question}</AccordionTrigger>
                  <AccordionContent>{faq.answer}</AccordionContent>
                </AccordionItem>
              ))}
          </Accordion>
          <Accordion type="single" className="grid h-fit gap-4" collapsible>
            {enhancedFaqs
              .slice(Math.ceil(enhancedFaqs.length / 2))
              .map((faq, index) => (
                <AccordionItem
                  key={index}
                  value={`item-${index + Math.ceil(enhancedFaqs.length / 2)}`}
                >
                  <AccordionTrigger>{faq.question}</AccordionTrigger>
                  <AccordionContent>{faq.answer}</AccordionContent>
                </AccordionItem>
              ))}
          </Accordion>
        </div>
      </motion.section>
    </motion.div>
  );
}
