'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import {
  ArrowRight,
  Award,
  BookOpen,
  Brain,
  CheckCircle,
  Compass,
  GraduationCap,
  HeartHandshake,
  InfoIcon,
  Lightbulb,
  School,
  Users,
} from '@tuturuuu/ui/icons';
import { Separator } from '@tuturuuu/ui/separator';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import Link from 'next/link';

// StatCard component
function StatCard({
  value,
  label,
  icon,
  delay = 0,
}: {
  value: string;
  label: string;
  icon: React.ReactNode;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay }}
      className="text-center"
    >
      <div className="bg-primary/10 text-primary mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full">
        {icon}
      </div>
      <h3 className="mb-1 text-3xl font-bold">{value}</h3>
      <p className="text-muted-foreground">{label}</p>
    </motion.div>
  );
}

// Team member card component
function TeamMemberCard({
  name,
  role,
  bio,
  imageSrc,
  delay = 0,
}: {
  name: string;
  role: string;
  bio: string;
  imageSrc: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay }}
      className="group"
    >
      <Card className="border-foreground/10 hover:border-primary/40 overflow-hidden transition-colors">
        <div className="aspect-square overflow-hidden">
          <div className="relative h-full w-full">
            <Image
              src={imageSrc}
              alt={name}
              fill
              className="object-cover transition-transform duration-500 group-hover:scale-105"
              sizes="(max-width: 768px) 100vw, 25vw"
            />
          </div>
        </div>
        <div className="p-6">
          <h3 className="text-xl font-bold">{name}</h3>
          <p className="text-primary mb-3 text-sm font-medium">{role}</p>
          <p className="text-muted-foreground">{bio}</p>
        </div>
      </Card>
    </motion.div>
  );
}

// Value card component
function ValueCard({
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

export default function AboutPage() {
  const t = useTranslations('boarding-pages.about');
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
      <div className="mb-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8 text-center"
        >
          <Badge variant="outline" className="mb-4">
            <InfoIcon className="mr-2 h-4 w-4" />
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

      {/* Mission & Vision Section */}
      <section className="mb-24">
        <div className="grid gap-12 md:grid-cols-2 md:items-center">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="relative order-2 md:order-1"
          >
            <div className="bg-primary/5 relative aspect-square rounded-xl border backdrop-blur-sm">
              <div className="from-primary/10 bg-linear-to-br absolute inset-0 rounded-xl via-transparent to-transparent" />
              <div className="relative flex h-full items-center justify-center p-8">
                <div className="from-primary bg-linear-to-r via-purple-500 to-blue-500 bg-clip-text text-center text-4xl font-bold text-transparent md:text-5xl">
                  {t('mission-vision.slogan-1')}
                  <br />
                  {t('mission-vision.slogan-2')}
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="order-1 space-y-6 md:order-2"
          >
            <div>
              <h2 className="mb-4 text-3xl font-bold">
                {t('mission-vision.mission.title')}
              </h2>
              <p className="text-muted-foreground">
                {t('mission-vision.mission.description')}
              </p>
            </div>

            <div>
              <h2 className="mb-4 text-3xl font-bold">
                {t('mission-vision.vision.title')}
              </h2>
              <p className="text-muted-foreground">
                {t('mission-vision.vision.description')}
              </p>
            </div>

            <div className="pt-4">
              <Link href="/guide">
                <Button>
                  {t('mission-vision.button')}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Stats Section */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="mb-24"
      >
        <div className="bg-primary/5 rounded-xl p-12">
          <div className="mb-8 text-center">
            <h2 className="mb-2 text-3xl font-bold">{t('impact.title')}</h2>
            <p className="text-muted-foreground mx-auto max-w-2xl">
              {t('impact.description')}
            </p>
          </div>

          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={<Users className="h-8 w-8" />}
              value="100,000+"
              label={t('impact.impact-1')}
              delay={0.1}
            />
            <StatCard
              icon={<School className="h-8 w-8" />}
              value="5,000+"
              label={t('impact.impact-2')}
              delay={0.2}
            />
            <StatCard
              icon={<BookOpen className="h-8 w-8" />}
              value="2,500+"
              label={t('impact.impact-3')}
              delay={0.3}
            />
            <StatCard
              icon={<Award className="h-8 w-8" />}
              value="250,000+"
              label={t('impact.impact-4')}
              delay={0.4}
            />
          </div>
        </div>
      </motion.section>

      {/* Our Values Section */}
      <section className="mb-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-8 text-center"
        >
          <h2 className="mb-2 text-3xl font-bold">{t('values.title')}</h2>
          <p className="text-muted-foreground mx-auto max-w-2xl">
            {t('values.description')}
          </p>
        </motion.div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <ValueCard
            icon={<BookOpen className="h-6 w-6" />}
            title={t('values.value-1.title')}
            description={t('values.value-1.description')}
            delay={0.1}
          />
          <ValueCard
            icon={<Users className="h-6 w-6" />}
            title={t('values.value-2.title')}
            description={t('values.value-2.description')}
            delay={0.2}
          />
          <ValueCard
            icon={<Brain className="h-6 w-6" />}
            title={t('values.value-3.title')}
            description={t('values.value-3.description')}
            delay={0.3}
          />
          <ValueCard
            icon={<Lightbulb className="h-6 w-6" />}
            title={t('values.value-4.title')}
            description={t('values.value-4.description')}
            delay={0.4}
          />
          <ValueCard
            icon={<HeartHandshake className="h-6 w-6" />}
            title={t('values.value-5.title')}
            description={t('values.value-5.description')}
            delay={0.5}
          />
          <ValueCard
            icon={<Compass className="h-6 w-6" />}
            title={t('values.value-6.title')}
            description={t('values.value-6.description')}
            delay={0.6}
          />
        </div>
      </section>

      {/* Our Team Section */}
      <section className="mb-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-8 text-center"
        >
          <h2 className="mb-2 text-3xl font-bold">{t('team.title')}</h2>
          <p className="text-muted-foreground mx-auto max-w-2xl">
            {t('team.description')}
          </p>
        </motion.div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <TeamMemberCard
            name="Sarah Johnson"
            role={t('team.member-1.role')}
            bio={t('team.member-1.description')}
            imageSrc="/media/background/team1.jpg"
            delay={0.1}
          />
          <TeamMemberCard
            name="David Chen"
            role={t('team.member-2.role')}
            bio={t('team.member-2.description')}
            imageSrc="/media/background/team2.jpg"
            delay={0.2}
          />
          <TeamMemberCard
            name="Maria Rodriguez"
            role={t('team.member-3.role')}
            bio={t('team.member-3.description')}
            imageSrc="/media/background/team3.jpg"
            delay={0.3}
          />
          <TeamMemberCard
            name="James Wilson"
            role={t('team.member-4.role')}
            bio={t('team.member-4.description')}
            imageSrc="/media/background/team4.jpg"
            delay={0.4}
          />
        </div>
      </section>

      <Separator className="mb-16" />

      {/* Our Approach Section */}
      <section className="mb-24">
        <div className="grid gap-12 md:grid-cols-2 md:items-center">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="space-y-6"
          >
            <h2 className="text-3xl font-bold">{t('approach.title')}</h2>
            <p className="text-muted-foreground">{t('approach.description')}</p>

            <div className="space-y-4">
              {[
                {
                  title: t('approach.approach-1.title'),
                  description: t('approach.approach-1.description'),
                },
                {
                  title: t('approach.approach-2.title'),
                  description: t('approach.approach-2.description'),
                },
                {
                  title: t('approach.approach-3.title'),
                  description: t('approach.approach-3.description'),
                },
                {
                  title: t('approach.approach-4.title'),
                  description: t('approach.approach-4.description'),
                },
              ].map((item, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className="flex items-start gap-3"
                >
                  <div className="bg-primary/10 text-primary mt-1 shrink-0 rounded-full p-1">
                    <CheckCircle className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-bold">{item.title}</h3>
                    <p className="text-muted-foreground text-sm">
                      {item.description}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="relative"
          >
            <Card className="overflow-hidden p-6">
              <div className="grid gap-4">
                <div className="bg-primary/5 flex items-center justify-between rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <div className="bg-primary/10 text-primary rounded-full p-2">
                      <BookOpen className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold">
                        {t('approach.detail-1.title')}
                      </h3>
                      <p className="text-muted-foreground text-sm">
                        {t('approach.detail-1.description')}
                      </p>
                    </div>
                  </div>
                  <div className="text-primary font-bold">95%</div>
                </div>

                <div className="bg-primary/5 flex items-center justify-between rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <div className="bg-primary/10 text-primary rounded-full p-2">
                      <Brain className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold">
                        {t('approach.detail-2.title')}
                      </h3>
                      <p className="text-muted-foreground text-sm">
                        {t('approach.detail-2.description')}
                      </p>
                    </div>
                  </div>
                  <div className="text-primary font-bold">100%</div>
                </div>

                <div className="bg-primary/5 flex items-center justify-between rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <div className="bg-primary/10 text-primary rounded-full p-2">
                      <GraduationCap className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold">
                        {t('approach.detail-3.title')}
                      </h3>
                      <p className="text-muted-foreground text-sm">
                        {t('approach.detail-3.description')}
                      </p>
                    </div>
                  </div>
                  <div className="text-primary font-bold">98%</div>
                </div>
              </div>
            </Card>
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-center"
      >
        <div className="bg-primary/5 mx-auto max-w-3xl rounded-xl p-8">
          <h2 className="mb-4 text-2xl font-bold">{t('cta-section.title')}</h2>
          <p className="text-muted-foreground mb-6">
            {t('cta-section.description')}
          </p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href="/guide">
              <Button size="lg">
                {t('cta-section.button')}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/contact">
              <Button variant="outline" size="lg">
                {t('cta-section.contact-button')}
              </Button>
            </Link>
          </div>
        </div>
      </motion.section>
    </div>
  );
}
