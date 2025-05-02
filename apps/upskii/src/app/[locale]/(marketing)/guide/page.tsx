'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import {
  ArrowRight,
  BookOpen,
  Brain,
  CheckCircle,
  Compass,
  FileText,
  GraduationCap,
  LayoutGrid,
  Lightbulb,
  MessageSquare,
  Play,
  School,
  User,
  Video,
} from '@tuturuuu/ui/icons';
import { Separator } from '@tuturuuu/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { motion } from 'framer-motion';
import Link from 'next/link';

// Guide step component
function GuideStep({
  number,
  title,
  description,
  icon,
  delay = 0,
}: {
  number: number;
  title: string;
  description: string;
  icon: React.ReactNode;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay }}
      className="flex gap-4"
    >
      <div className="flex-shrink-0">
        <div className="bg-primary/10 text-primary flex h-10 w-10 items-center justify-center rounded-full text-lg font-bold">
          {number}
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="text-xl font-bold">{title}</h3>
        </div>
        <p className="text-muted-foreground">{description}</p>
      </div>
    </motion.div>
  );
}

// Feature card component
function FeatureCard({
  icon,
  title,
  description,
  delay = 0,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay }}
      whileHover={{ y: -5 }}
      className="group"
    >
      <Card className="border-foreground/10 hover:border-primary/40 h-full p-6 transition-colors">
        <div className="bg-primary/10 text-primary mb-4 inline-flex rounded-lg p-3">
          {icon}
        </div>
        <h3 className="mb-2 text-xl font-bold">{title}</h3>
        <p className="text-muted-foreground">{description}</p>
      </Card>
    </motion.div>
  );
}

export default function GuidePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
      <div className="mb-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8 text-center"
        >
          <Badge variant="outline" className="mb-4">
            <Compass className="mr-2 h-4 w-4" />
            Platform Guide
          </Badge>
          <h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl">
            How to Use Our Platform
          </h1>
          <p className="text-muted-foreground mx-auto max-w-2xl text-lg">
            A comprehensive guide to help you get started and make the most of
            our educational platform.
          </p>
        </motion.div>
      </div>

      <Tabs defaultValue="students" className="w-full">
        <div className="mb-8 flex justify-center">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="students">For Students</TabsTrigger>
            <TabsTrigger value="teachers">For Teachers</TabsTrigger>
          </TabsList>
        </div>

        {/* Students Guide */}
        <TabsContent value="students" id="for-students">
          <div className="grid gap-16">
            {/* Getting Started Section */}
            <section>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="mb-8"
              >
                <h2 className="mb-2 text-3xl font-bold">Getting Started</h2>
                <p className="text-muted-foreground">
                  Follow these simple steps to begin your learning journey.
                </p>
              </motion.div>

              <div className="space-y-8">
                <GuideStep
                  number={1}
                  title="Create Your Account"
                  description="Sign up using your email or Google account. Verify your email to activate your account and set up your profile with basic information."
                  icon={<User className="h-5 w-5" />}
                  delay={0.1}
                />
                <GuideStep
                  number={2}
                  title="Explore Course Catalog"
                  description="Browse through our diverse range of courses. Use filters to find courses by subject, difficulty level, duration, or instructor rating."
                  icon={<Compass className="h-5 w-5" />}
                  delay={0.2}
                />
                <GuideStep
                  number={3}
                  title="Enroll in Courses"
                  description="Choose courses that match your interests and learning goals. Enroll in free courses instantly or complete payment for premium courses."
                  icon={<BookOpen className="h-5 w-5" />}
                  delay={0.3}
                />
                <GuideStep
                  number={4}
                  title="Start Learning"
                  description="Access course materials, watch video lectures, complete assignments, and participate in discussions to enhance your learning experience."
                  icon={<Play className="h-5 w-5" />}
                  delay={0.4}
                />
              </div>
            </section>

            <Separator />

            {/* Key Features for Students */}
            <section>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="mb-8"
              >
                <h2 className="mb-2 text-3xl font-bold">Key Features</h2>
                <p className="text-muted-foreground">
                  Discover powerful tools and features designed to enhance your
                  learning experience.
                </p>
              </motion.div>

              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                <FeatureCard
                  icon={<Video className="h-6 w-6" />}
                  title="Video Lectures"
                  description="High-quality video content with interactive elements and the ability to take notes as you watch."
                  delay={0.1}
                />
                <FeatureCard
                  icon={<FileText className="h-6 w-6" />}
                  title="Course Materials"
                  description="Access downloadable resources, reading materials, and supplementary content."
                  delay={0.2}
                />
                <FeatureCard
                  icon={<MessageSquare className="h-6 w-6" />}
                  title="Discussion Forums"
                  description="Engage with instructors and fellow students to clarify doubts and share insights."
                  delay={0.3}
                />
                <FeatureCard
                  icon={<Brain className="h-6 w-6" />}
                  title="AI Learning Assistant"
                  description="Get personalized help, explanations, and learning recommendations from our AI tutor."
                  delay={0.4}
                />
                <FeatureCard
                  icon={<GraduationCap className="h-6 w-6" />}
                  title="Certificates"
                  description="Earn verified certificates upon course completion to showcase your achievements."
                  delay={0.5}
                />
                <FeatureCard
                  icon={<LayoutGrid className="h-6 w-6" />}
                  title="Learning Dashboard"
                  description="Track your progress, manage enrolled courses, and view recommendations."
                  delay={0.6}
                />
              </div>
            </section>

            <Separator />

            {/* Tips for Students */}
            <section>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="mb-8"
              >
                <h2 className="mb-2 text-3xl font-bold">Tips for Success</h2>
                <p className="text-muted-foreground">
                  Make the most of your learning journey with these helpful
                  tips.
                </p>
              </motion.div>

              <div className="grid gap-8 md:grid-cols-2">
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  className="space-y-4"
                >
                  <div className="space-y-4">
                    {[
                      'Set a regular study schedule to build consistency',
                      'Take notes while watching lectures and reading materials',
                      'Actively participate in discussion forums and Q&A sessions',
                      'Complete all assignments and quizzes to reinforce learning',
                      'Use the AI tutor when you need additional help or clarification',
                    ].map((tip, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, y: 10 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: index * 0.1 }}
                        className="flex items-start gap-3"
                      >
                        <div className="bg-primary/10 text-primary mt-0.5 flex-shrink-0 rounded-full p-1">
                          <CheckCircle className="h-4 w-4" />
                        </div>
                        <span>{tip}</span>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  className="space-y-4"
                >
                  <div className="space-y-4">
                    {[
                      'Connect with fellow students to form study groups',
                      'Apply what you learn through practical exercises',
                      'Provide feedback to instructors to improve course quality',
                      'Take breaks between study sessions to avoid burnout',
                      'Set realistic learning goals and track your progress',
                    ].map((tip, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, y: 10 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: index * 0.1 }}
                        className="flex items-start gap-3"
                      >
                        <div className="bg-primary/10 text-primary mt-0.5 flex-shrink-0 rounded-full p-1">
                          <CheckCircle className="h-4 w-4" />
                        </div>
                        <span>{tip}</span>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              </div>
            </section>

            <Separator />

            {/* CTA Section */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center"
            >
              <div className="bg-primary/5 mx-auto max-w-3xl rounded-xl p-8 backdrop-blur-sm">
                <div className="bg-primary/10 text-primary mx-auto mb-4 inline-flex rounded-full p-3">
                  <Lightbulb className="h-6 w-6" />
                </div>
                <h2 className="mb-4 text-2xl font-bold">
                  Ready to Start Learning?
                </h2>
                <p className="text-muted-foreground mb-6">
                  Join thousands of students who are enhancing their skills and
                  knowledge through our platform.
                </p>
                <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                  <Link href="/login">
                    <Button size="lg">
                      Get Started
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                  <Link href="/faq">
                    <Button variant="outline" size="lg">
                      View FAQ
                    </Button>
                  </Link>
                </div>
              </div>
            </motion.section>
          </div>
        </TabsContent>

        {/* Teachers Guide */}
        <TabsContent value="teachers" id="for-teachers">
          <div className="grid gap-16">
            {/* Getting Started for Teachers */}
            <section>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="mb-8"
              >
                <h2 className="mb-2 text-3xl font-bold">Becoming a Teacher</h2>
                <p className="text-muted-foreground">
                  Follow these steps to start creating and sharing your
                  knowledge on our platform.
                </p>
              </motion.div>

              <div className="space-y-8">
                <GuideStep
                  number={1}
                  title="Apply for Teacher Status"
                  description="Sign up for an account, then apply for teacher verification by providing your credentials and background information for review."
                  icon={<User className="h-5 w-5" />}
                  delay={0.1}
                />
                <GuideStep
                  number={2}
                  title="Set Up Your Teacher Profile"
                  description="Complete your educator profile with your expertise, teaching experience, education, and a professional photo to build trust with potential students."
                  icon={<School className="h-5 w-5" />}
                  delay={0.2}
                />
                <GuideStep
                  number={3}
                  title="Create Your First Course"
                  description="Use our course builder to design your curriculum, upload content, create assessments, and set up interactive elements."
                  icon={<BookOpen className="h-5 w-5" />}
                  delay={0.3}
                />
                <GuideStep
                  number={4}
                  title="Publish and Promote"
                  description="Submit your course for review, set pricing (if applicable), and use our platform tools to promote your course to potential students."
                  icon={<GraduationCap className="h-5 w-5" />}
                  delay={0.4}
                />
              </div>
            </section>

            <Separator />

            {/* Key Features for Teachers */}
            <section>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="mb-8"
              >
                <h2 className="mb-2 text-3xl font-bold">Teacher Tools</h2>
                <p className="text-muted-foreground">
                  Powerful features to help you create engaging courses and
                  manage your students effectively.
                </p>
              </motion.div>

              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                <FeatureCard
                  icon={<Video className="h-6 w-6" />}
                  title="Video Management"
                  description="Upload, edit, and manage video content with our integrated video hosting solution."
                  delay={0.1}
                />
                <FeatureCard
                  icon={<Brain className="h-6 w-6" />}
                  title="AI Content Generation"
                  description="Create quizzes, assignments, and supplementary content with AI assistance."
                  delay={0.2}
                />
                <FeatureCard
                  icon={<MessageSquare className="h-6 w-6" />}
                  title="Live Teaching"
                  description="Host live classes, webinars, and interactive sessions with your students."
                  delay={0.3}
                />
                <FeatureCard
                  icon={<LayoutGrid className="h-6 w-6" />}
                  title="Student Analytics"
                  description="Track student progress, engagement, and performance with detailed analytics."
                  delay={0.4}
                />
                <FeatureCard
                  icon={<FileText className="h-6 w-6" />}
                  title="Assessment Tools"
                  description="Create various types of assessments including quizzes, assignments, and projects."
                  delay={0.5}
                />
                <FeatureCard
                  icon={<GraduationCap className="h-6 w-6" />}
                  title="Certificate Designer"
                  description="Design custom certificates that will be automatically issued to successful students."
                  delay={0.6}
                />
              </div>
            </section>

            <Separator />

            {/* Best Practices for Teachers */}
            <section>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="mb-8"
              >
                <h2 className="mb-2 text-3xl font-bold">Best Practices</h2>
                <p className="text-muted-foreground">
                  Tips and strategies to help you create engaging courses and
                  build a successful teaching career.
                </p>
              </motion.div>

              <div className="grid gap-8 md:grid-cols-2">
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  className="space-y-4"
                >
                  <div className="space-y-4">
                    {[
                      'Structure your course content in a logical, progressive sequence',
                      'Keep video lectures concise (5-10 minutes) and focused on a single topic',
                      'Include a mix of content types: videos, readings, activities, discussions',
                      'Provide clear learning objectives at the beginning of each section',
                      'Use AI tools to generate supplementary content and assessments',
                    ].map((practice, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, y: 10 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: index * 0.1 }}
                        className="flex items-start gap-3"
                      >
                        <div className="bg-primary/10 text-primary mt-0.5 flex-shrink-0 rounded-full p-1">
                          <CheckCircle className="h-4 w-4" />
                        </div>
                        <span>{practice}</span>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  className="space-y-4"
                >
                  <div className="space-y-4">
                    {[
                      'Respond promptly to student questions and discussion posts',
                      'Schedule regular live sessions to engage directly with your students',
                      'Update course content regularly to keep it current and relevant',
                      'Gather and respond to student feedback to improve your course',
                      'Use analytics to identify areas where students might be struggling',
                    ].map((practice, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, y: 10 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: index * 0.1 }}
                        className="flex items-start gap-3"
                      >
                        <div className="bg-primary/10 text-primary mt-0.5 flex-shrink-0 rounded-full p-1">
                          <CheckCircle className="h-4 w-4" />
                        </div>
                        <span>{practice}</span>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              </div>
            </section>

            <Separator />

            {/* CTA Section for Teachers */}
            <motion.section
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center"
            >
              <div className="bg-primary/5 mx-auto max-w-3xl rounded-xl p-8 backdrop-blur-sm">
                <div className="bg-primary/10 text-primary mx-auto mb-4 inline-flex rounded-full p-3">
                  <School className="h-6 w-6" />
                </div>
                <h2 className="mb-4 text-2xl font-bold">
                  Ready to Share Your Knowledge?
                </h2>
                <p className="text-muted-foreground mb-6">
                  Join our community of educators and reach students around the
                  world with your expertise.
                </p>
                <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
                  <Link href="/login?teacher=true">
                    <Button size="lg">
                      Become a Teacher
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                  <Link href="/contact">
                    <Button variant="outline" size="lg">
                      Contact Support
                    </Button>
                  </Link>
                </div>
              </div>
            </motion.section>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
