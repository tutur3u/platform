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
            About Us
          </Badge>
          <h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl">
            Our Mission is to Transform Education
          </h1>
          <p className="text-muted-foreground mx-auto max-w-2xl text-lg">
            We're building a platform that empowers educators and students
            through technology, making high-quality education accessible to
            everyone, everywhere.
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
              <div className="from-primary/10 absolute inset-0 rounded-xl bg-gradient-to-br via-transparent to-transparent" />
              <div className="relative flex h-full items-center justify-center p-8">
                <div className="from-primary bg-gradient-to-r via-purple-500 to-blue-500 bg-clip-text text-center text-4xl font-bold text-transparent md:text-5xl">
                  Education for Everyone,
                  <br />
                  Everywhere
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
              <h2 className="mb-4 text-3xl font-bold">Our Mission</h2>
              <p className="text-muted-foreground">
                Our mission is to democratize education by providing a platform
                that connects passionate educators with eager learners from
                around the world. We believe that quality education should be
                accessible to everyone, regardless of location or background.
              </p>
            </div>

            <div>
              <h2 className="mb-4 text-3xl font-bold">Our Vision</h2>
              <p className="text-muted-foreground">
                We envision a world where anyone can learn anything, anytime,
                anywhere. A future where technology enhances the learning
                experience, where AI assists both teachers and students, and
                where education is personalized to each individual's needs and
                learning style.
              </p>
            </div>

            <div className="pt-4">
              <Link href="/guide">
                <Button>
                  Explore Our Platform
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
            <h2 className="mb-2 text-3xl font-bold">Our Impact</h2>
            <p className="text-muted-foreground mx-auto max-w-2xl">
              We're proud of the difference we're making in education around the
              world.
            </p>
          </div>

          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={<Users className="h-8 w-8" />}
              value="100,000+"
              label="Active Learners"
              delay={0.1}
            />
            <StatCard
              icon={<School className="h-8 w-8" />}
              value="5,000+"
              label="Verified Teachers"
              delay={0.2}
            />
            <StatCard
              icon={<BookOpen className="h-8 w-8" />}
              value="2,500+"
              label="Courses Available"
              delay={0.3}
            />
            <StatCard
              icon={<Award className="h-8 w-8" />}
              value="250,000+"
              label="Certificates Issued"
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
          <h2 className="mb-2 text-3xl font-bold">Our Core Values</h2>
          <p className="text-muted-foreground mx-auto max-w-2xl">
            The principles that guide everything we do.
          </p>
        </motion.div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <ValueCard
            icon={<BookOpen className="h-6 w-6" />}
            title="Accessible Education"
            description="We believe quality education should be available to everyone, regardless of location or background."
            delay={0.1}
          />
          <ValueCard
            icon={<Users className="h-6 w-6" />}
            title="Community"
            description="We foster inclusive communities where educators and learners can connect, collaborate, and grow together."
            delay={0.2}
          />
          <ValueCard
            icon={<Brain className="h-6 w-6" />}
            title="Innovation"
            description="We continuously evolve our platform with cutting-edge technology to enhance the teaching and learning experience."
            delay={0.3}
          />
          <ValueCard
            icon={<Lightbulb className="h-6 w-6" />}
            title="Lifelong Learning"
            description="We support the journey of continuous personal and professional development throughout life."
            delay={0.4}
          />
          <ValueCard
            icon={<HeartHandshake className="h-6 w-6" />}
            title="Integrity"
            description="We maintain high ethical standards and transparency in all our operations and relationships."
            delay={0.5}
          />
          <ValueCard
            icon={<Compass className="h-6 w-6" />}
            title="Student-Centered"
            description="We design our platform with the needs and experiences of learners at the forefront of our decisions."
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
          <h2 className="mb-2 text-3xl font-bold">Meet Our Leadership Team</h2>
          <p className="text-muted-foreground mx-auto max-w-2xl">
            Passionate educators and technologists committed to transforming
            online education.
          </p>
        </motion.div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <TeamMemberCard
            name="Sarah Johnson"
            role="CEO & Co-Founder"
            bio="Former education technology executive with over 15 years of experience in EdTech innovation."
            imageSrc="/media/background/team1.jpg"
            delay={0.1}
          />
          <TeamMemberCard
            name="David Chen"
            role="CTO & Co-Founder"
            bio="AI researcher and software architect specializing in educational technology and personalized learning."
            imageSrc="/media/background/team2.jpg"
            delay={0.2}
          />
          <TeamMemberCard
            name="Maria Rodriguez"
            role="Chief Learning Officer"
            bio="Educational psychologist with expertise in curriculum development and online learning methodologies."
            imageSrc="/media/background/team3.jpg"
            delay={0.3}
          />
          <TeamMemberCard
            name="James Wilson"
            role="Chief Product Officer"
            bio="Product leader with experience building user-centered educational platforms and scalable learning solutions."
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
            <h2 className="text-3xl font-bold">Our Approach</h2>
            <p className="text-muted-foreground">
              We combine traditional educational principles with innovative
              technology to create a learning experience that is engaging,
              effective, and accessible.
            </p>

            <div className="space-y-4">
              {[
                {
                  title: 'Human-Centered Design',
                  description:
                    'Our platform is designed with educators and learners in mind, focusing on intuitive interfaces and seamless experiences.',
                },
                {
                  title: 'AI-Enhanced Learning',
                  description:
                    'We leverage artificial intelligence to personalize learning experiences, provide immediate feedback, and support educators in content creation.',
                },
                {
                  title: 'Community Collaboration',
                  description:
                    'We foster connections between students and teachers across the globe, creating a collaborative learning environment.',
                },
                {
                  title: 'Continuous Improvement',
                  description:
                    'We regularly update our platform based on user feedback and emerging educational research and technologies.',
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
                  <div className="bg-primary/10 text-primary mt-1 flex-shrink-0 rounded-full p-1">
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
                      <h3 className="font-semibold">Personalized Learning</h3>
                      <p className="text-muted-foreground text-sm">
                        Tailored to individual needs
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
                      <h3 className="font-semibold">AI Integration</h3>
                      <p className="text-muted-foreground text-sm">
                        Advanced learning assistance
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
                      <h3 className="font-semibold">Certification</h3>
                      <p className="text-muted-foreground text-sm">
                        Industry-recognized credentials
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
          <h2 className="mb-4 text-2xl font-bold">
            Join Our Educational Journey
          </h2>
          <p className="text-muted-foreground mb-6">
            Whether you're a student eager to learn or an educator ready to
            share your knowledge, our platform is built for you.
          </p>
          <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href="/guide">
              <Button size="lg">
                Explore Platform
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/contact">
              <Button variant="outline" size="lg">
                Contact Us
              </Button>
            </Link>
          </div>
        </div>
      </motion.section>
    </div>
  );
}
