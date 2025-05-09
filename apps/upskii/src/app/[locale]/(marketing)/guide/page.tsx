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
  MessageSquare,
  Play,
  School,
  User,
  Video,
} from '@tuturuuu/ui/icons';
import { Separator } from '@tuturuuu/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('boarding-pages.guide');
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
            {t('hero.badge')}
          </Badge>
          <h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl">
            {t('hero.title')}
          </h1>
          <p className="text-muted-foreground mx-auto max-w-2xl text-lg">
            {t('hero.description')}
          </p>
        </motion.div>
      </div>

      <Tabs defaultValue="students" className="w-full">
        <div className="mb-8 flex justify-center">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="students">
              {t('for-students.title')}
            </TabsTrigger>
            <TabsTrigger value="teachers">
              {t('for-teachers.title')}
            </TabsTrigger>
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
                <h2 className="mb-2 text-3xl font-bold">
                  {t('for-students.detailed-guide.title')}
                </h2>
                <p className="text-muted-foreground">
                  {t('for-students.detailed-guide.description')}
                </p>
              </motion.div>

              <div className="space-y-8">
                <GuideStep
                  number={1}
                  title={t('for-students.detailed-guide.step-1.title')}
                  description={t(
                    'for-students.detailed-guide.step-1.description'
                  )}
                  icon={<User className="h-5 w-5" />}
                  delay={0.1}
                />
                <GuideStep
                  number={2}
                  title={t('for-students.detailed-guide.step-2.title')}
                  description={t(
                    'for-students.detailed-guide.step-2.description'
                  )}
                  icon={<Compass className="h-5 w-5" />}
                  delay={0.2}
                />
                <GuideStep
                  number={3}
                  title={t('for-students.detailed-guide.step-3.title')}
                  description={t(
                    'for-students.detailed-guide.step-3.description'
                  )}
                  icon={<BookOpen className="h-5 w-5" />}
                  delay={0.3}
                />
                <GuideStep
                  number={4}
                  title={t('for-students.detailed-guide.step-4.title')}
                  description={t(
                    'for-students.detailed-guide.step-4.description'
                  )}
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
                <h2 className="mb-2 text-3xl font-bold">
                  {t('for-students.key-features.title')}
                </h2>
                <p className="text-muted-foreground">
                  {t('for-students.key-features.description')}
                </p>
              </motion.div>

              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                <FeatureCard
                  icon={<Video className="h-6 w-6" />}
                  title={t('for-students.key-features.feature-1.title')}
                  description={t(
                    'for-students.key-features.feature-1.description'
                  )}
                  delay={0.1}
                />
                <FeatureCard
                  icon={<FileText className="h-6 w-6" />}
                  title={t('for-students.key-features.feature-2.title')}
                  description={t(
                    'for-students.key-features.feature-2.description'
                  )}
                  delay={0.2}
                />
                <FeatureCard
                  icon={<MessageSquare className="h-6 w-6" />}
                  title={t('for-students.key-features.feature-3.title')}
                  description={t(
                    'for-students.key-features.feature-3.description'
                  )}
                  delay={0.3}
                />
                <FeatureCard
                  icon={<Brain className="h-6 w-6" />}
                  title={t('for-students.key-features.feature-4.title')}
                  description={t(
                    'for-students.key-features.feature-4.description'
                  )}
                  delay={0.4}
                />
                <FeatureCard
                  icon={<GraduationCap className="h-6 w-6" />}
                  title={t('for-students.key-features.feature-5.title')}
                  description={t(
                    'for-students.key-features.feature-5.description'
                  )}
                  delay={0.5}
                />
                <FeatureCard
                  icon={<LayoutGrid className="h-6 w-6" />}
                  title={t('for-students.key-features.feature-6.title')}
                  description={t(
                    'for-students.key-features.feature-6.description'
                  )}
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
                <h2 className="mb-2 text-3xl font-bold">
                  {t('for-students.tips.title')}
                </h2>
                <p className="text-muted-foreground">
                  {t('for-students.tips.description')}
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
                      t('for-students.tips.tip-1'),
                      t('for-students.tips.tip-2'),
                      t('for-students.tips.tip-3'),
                      t('for-students.tips.tip-4'),
                      t('for-students.tips.tip-5'),
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
                      t('for-students.tips.tip-6'),
                      t('for-students.tips.tip-7'),
                      t('for-students.tips.tip-8'),
                      t('for-students.tips.tip-9'),
                      t('for-students.tips.tip-10'),
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
            {/* <motion.section
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
            </motion.section> */}
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
                <h2 className="mb-2 text-3xl font-bold">
                  {t('for-teachers.detailed-guide.title')}
                </h2>
                <p className="text-muted-foreground">
                  {t('for-teachers.detailed-guide.description')}
                </p>
              </motion.div>

              <div className="space-y-8">
                <GuideStep
                  number={1}
                  title={t('for-teachers.detailed-guide.step-1.title')}
                  description={t('for-teachers.detailed-guide.step-1.description')}
                  icon={<User className="h-5 w-5" />}
                  delay={0.1}
                />
                <GuideStep
                  number={2}
                  title={t('for-teachers.detailed-guide.step-2.title')}
                  description={t('for-teachers.detailed-guide.step-2.description')}
                  icon={<School className="h-5 w-5" />}
                  delay={0.2}
                />
                <GuideStep
                  number={3}
                  title={t('for-teachers.detailed-guide.step-3.title')}
                  description={t('for-teachers.detailed-guide.step-3.description')}
                  icon={<BookOpen className="h-5 w-5" />}
                  delay={0.3}
                />
                <GuideStep
                  number={4}
                  title={t('for-teachers.detailed-guide.step-4.title')}
                  description={t('for-teachers.detailed-guide.step-4.description')}
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
                <h2 className="mb-2 text-3xl font-bold">
                  {t('for-teachers.key-features.title')}
                </h2>
                <p className="text-muted-foreground">
                  {t('for-teachers.key-features.description')}
                </p>
              </motion.div>

              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                <FeatureCard
                  icon={<Video className="h-6 w-6" />}
                  title={t('for-teachers.key-features.feature-1.title')}
                  description={t('for-teachers.key-features.feature-1.description')}
                  delay={0.1}
                />
                <FeatureCard
                  icon={<Brain className="h-6 w-6" />}
                  title={t('for-teachers.key-features.feature-2.title')}
                  description={t('for-teachers.key-features.feature-2.description')}
                  delay={0.2}
                />
                <FeatureCard
                  icon={<MessageSquare className="h-6 w-6" />}
                  title={t('for-teachers.key-features.feature-3.title')}
                  description={t('for-teachers.key-features.feature-3.description')}
                  delay={0.3}
                />
                <FeatureCard
                  icon={<LayoutGrid className="h-6 w-6" />}
                  title={t('for-teachers.key-features.feature-4.title')}
                  description={t('for-teachers.key-features.feature-4.description')}
                  delay={0.4}
                />
                <FeatureCard
                  icon={<FileText className="h-6 w-6" />}
                  title={t('for-teachers.key-features.feature-5.title')}
                  description={t('for-teachers.key-features.feature-5.description')}
                  delay={0.5}
                />
                <FeatureCard
                  icon={<GraduationCap className="h-6 w-6" />}
                  title={t('for-teachers.key-features.feature-6.title')}
                  description={t('for-teachers.key-features.feature-6.description')}
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
                <h2 className="mb-2 text-3xl font-bold">
                  {t('for-teachers.tips.title')}
                </h2>
                <p className="text-muted-foreground">
                  {t('for-teachers.tips.description')}
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
                      t('for-teachers.tips.tip-1'),
                      t('for-teachers.tips.tip-1'),
                      t('for-teachers.tips.tip-1'),
                      t('for-teachers.tips.tip-1'),
                      t('for-teachers.tips.tip-1'),
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
                      t('for-teachers.tips.tip-6'),
                      t('for-teachers.tips.tip-7'),
                      t('for-teachers.tips.tip-8'),
                      t('for-teachers.tips.tip-9'),
                      t('for-teachers.tips.tip-10'),
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
                  {t('cta-section.title')}
                </h2>
                <p className="text-muted-foreground mb-6">
                  {t('cta-section.description')}
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
