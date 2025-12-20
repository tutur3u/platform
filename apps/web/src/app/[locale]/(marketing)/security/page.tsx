'use client';

import {
  AlertTriangle,
  ArrowRight,
  Bug,
  Eye,
  FileText,
  Fingerprint,
  Globe2,
  Key,
  type LucideIcon,
  Mail,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trophy,
  UserCheck,
  Users,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { cn } from '@tuturuuu/utils/format';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { GITHUB_OWNER, GITHUB_REPO } from '@/constants/common';

interface SecurityFeature {
  icon: LucideIcon;
  title: string;
  description: string;
  color: string;
}

const securityFeatures: SecurityFeature[] = [
  {
    icon: Shield,
    title: 'End-to-End Encryption',
    description:
      'All sensitive data is encrypted in transit and at rest using industry-standard encryption protocols.',
    color: 'blue',
  },
  {
    icon: ShieldCheck,
    title: 'Regular Security Audits',
    description:
      'Continuous security assessments and penetration testing to identify and address potential vulnerabilities.',
    color: 'green',
  },
  {
    icon: UserCheck,
    title: 'Access Control',
    description:
      'Role-based access control (RBAC) and multi-factor authentication (MFA) to ensure secure access.',
    color: 'purple',
  },
  {
    icon: Fingerprint,
    title: 'Data Privacy',
    description:
      'Strict data privacy controls and compliance with global privacy regulations and standards.',
    color: 'cyan',
  },
  {
    icon: Key,
    title: 'Key Management',
    description:
      'Secure key management system with regular rotation and strict access policies.',
    color: 'orange',
  },
  {
    icon: Server,
    title: 'Infrastructure Security',
    description:
      'Secure cloud infrastructure with multiple layers of protection and redundancy.',
    color: 'pink',
  },
  {
    icon: Eye,
    title: 'Monitoring & Logging',
    description:
      '24/7 security monitoring and comprehensive logging of all system activities.',
    color: 'yellow',
  },
  {
    icon: Bug,
    title: 'Bug Bounty Program',
    description:
      'Active bug bounty program to encourage responsible disclosure of security vulnerabilities.',
    color: 'red',
  },
];

export default function SecurityPage() {
  return (
    <main className="relative mx-auto w-full overflow-x-hidden text-balance">
      {/* Dynamic Floating Orbs */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.2, 0.3, 0.2],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="absolute top-0 -left-32 h-96 w-96 rounded-full bg-linear-to-br from-dynamic-purple/40 via-dynamic-pink/30 to-transparent blur-3xl sm:-left-64 sm:h-[40rem] sm:w-[40rem]"
        />
        <motion.div
          animate={{
            scale: [1, 1.15, 1],
            opacity: [0.15, 0.25, 0.15],
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="absolute top-[40%] -right-32 h-80 w-80 rounded-full bg-linear-to-br from-dynamic-blue/40 via-dynamic-cyan/30 to-transparent blur-3xl sm:-right-64 sm:h-[35rem] sm:w-[35rem]"
        />
        <motion.div
          animate={{
            scale: [1, 1.3, 1],
            opacity: [0.2, 0.3, 0.2],
          }}
          transition={{
            duration: 12,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="absolute -bottom-32 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-linear-to-br from-dynamic-green/30 via-dynamic-emerald/20 to-transparent blur-3xl sm:-bottom-64 sm:h-[45rem] sm:w-[45rem]"
        />
      </div>

      {/* Grid Pattern Overlay */}
      <div className="pointer-events-none fixed inset-0 -z-10 opacity-30">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(var(--primary-rgb),0.08)_1px,transparent_1px)] bg-[size:32px_32px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(var(--primary-rgb),0.04)_1px,transparent_1px)] bg-[size:120px]" />
      </div>

      {/* Hero Section */}
      <section className="relative px-4 pt-24 pb-16 sm:px-6 sm:pt-32 sm:pb-20 lg:px-8 lg:pt-40 lg:pb-24">
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="text-center"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1, duration: 0.5 }}
            >
              <Badge
                variant="secondary"
                className="mb-6 border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue transition-all hover:scale-105 hover:bg-dynamic-blue/20 hover:shadow-dynamic-blue/20 hover:shadow-lg"
              >
                <Shield className="mr-1.5 h-3.5 w-3.5" />
                Security First
              </Badge>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.8 }}
              className="mb-6 text-balance font-bold text-4xl tracking-tight sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl"
            >
              Your Security is Our{' '}
              <span className="animate-gradient bg-linear-to-r from-dynamic-blue via-dynamic-cyan to-dynamic-green bg-clip-text text-transparent">
                Top Priority
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.8 }}
              className="mx-auto mb-12 max-w-3xl text-balance text-base text-foreground/70 leading-relaxed sm:text-lg md:text-xl lg:text-2xl"
            >
              We are committed to protecting your data with industry-leading
              security practices, continuous monitoring, and transparent
              communication.
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* Security Features Grid */}
      <section className="relative px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-16 text-center"
          >
            <h2 className="mb-4 font-bold text-4xl sm:text-5xl">
              Built on{' '}
              <span className="bg-linear-to-r from-dynamic-purple via-dynamic-pink to-dynamic-orange bg-clip-text text-transparent">
                Security
              </span>
            </h2>
            <p className="mx-auto max-w-2xl text-foreground/60 text-lg">
              Multiple layers of protection to keep your data safe and secure
            </p>
          </motion.div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {securityFeatures.map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <Card
                  className={cn(
                    'group h-full p-6 transition-all hover:shadow-lg',
                    `border-dynamic-${feature.color}/30 bg-linear-to-br from-dynamic-${feature.color}/5 via-background to-background hover:border-dynamic-${feature.color}/50 hover:shadow-dynamic-${feature.color}/10`
                  )}
                >
                  <div
                    className={cn(
                      'mb-4 flex h-12 w-12 items-center justify-center rounded-xl transition-transform group-hover:rotate-12 group-hover:scale-110',
                      `bg-dynamic-${feature.color}/10`
                    )}
                  >
                    <feature.icon
                      className={cn('h-6 w-6', `text-dynamic-${feature.color}`)}
                    />
                  </div>
                  <h3 className="mb-2 font-semibold text-lg">
                    {feature.title}
                  </h3>
                  <p className="text-foreground/60 text-sm leading-relaxed">
                    {feature.description}
                  </p>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Report Vulnerability Section */}
      <section className="relative px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <Card className="overflow-hidden border-dynamic-red/30 bg-linear-to-br from-dynamic-red/5 via-background to-background p-8 md:p-12">
              <div className="grid gap-12 lg:grid-cols-2">
                <div className="flex flex-col justify-center">
                  <motion.div
                    initial={{ scale: 0.9 }}
                    whileInView={{ scale: 1 }}
                    viewport={{ once: true }}
                    className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-dynamic-red/10"
                  >
                    <ShieldAlert className="h-10 w-10 text-dynamic-red" />
                  </motion.div>

                  <h2 className="mb-4 font-bold text-3xl sm:text-4xl">
                    <span className="bg-linear-to-r from-dynamic-red via-dynamic-orange to-dynamic-yellow bg-clip-text text-transparent">
                      Report a Vulnerability
                    </span>
                  </h2>
                  <p className="mb-8 text-foreground/70 text-lg leading-relaxed">
                    Found a security vulnerability? We appreciate your help in
                    disclosing it responsibly. Please contact our security team
                    directly.
                  </p>

                  <div className="mb-8 flex flex-col flex-wrap gap-3 sm:flex-row sm:gap-4">
                    <Button size="lg" asChild>
                      <a href="mailto:security@tuturuuu.com">
                        <Mail className="mr-2 h-5 w-5" />
                        Contact Security Team
                      </a>
                    </Button>
                    <Button size="lg" variant="outline" asChild>
                      <a
                        href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/blob/main/SECURITY.md`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <FileText className="mr-2 h-5 w-5" />
                        Security Policy
                      </a>
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-6">
                    <Link
                      href="/security/bug-bounty"
                      className="group flex items-center gap-2 text-foreground/60 transition-colors hover:text-foreground"
                    >
                      <Trophy className="h-5 w-5 text-dynamic-yellow" />
                      <span>Bug Bounty Hall of Fame</span>
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </Link>
                    <Link
                      href="/contributors"
                      className="group flex items-center gap-2 text-foreground/60 transition-colors hover:text-foreground"
                    >
                      <Users className="h-5 w-5 text-dynamic-purple" />
                      <span>Contributors</span>
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </Link>
                  </div>
                </div>

                <div>
                  <div className="space-y-4">
                    <h3 className="mb-6 font-bold text-2xl">
                      Reporting Guidelines
                    </h3>

                    <Card className="border-dynamic-orange/30 bg-dynamic-orange/5 p-6">
                      <div className="mb-3 flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-dynamic-orange/10">
                          <AlertTriangle className="h-5 w-5 text-dynamic-orange" />
                        </div>
                        <h4 className="font-semibold text-lg">Scope</h4>
                      </div>
                      <p className="text-foreground/70 text-sm leading-relaxed">
                        Security issues in our core services and infrastructure
                      </p>
                    </Card>

                    <Card className="border-dynamic-blue/30 bg-dynamic-blue/5 p-6">
                      <div className="mb-3 flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-dynamic-blue/10">
                          <Mail className="h-5 w-5 text-dynamic-blue" />
                        </div>
                        <h4 className="font-semibold text-lg">Contact</h4>
                      </div>
                      <p className="text-foreground/70 text-sm leading-relaxed">
                        Email security@tuturuuu.com with detailed reports
                      </p>
                    </Card>

                    <Card className="border-dynamic-green/30 bg-dynamic-green/5 p-6">
                      <div className="mb-3 flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-dynamic-green/10">
                          <Shield className="h-5 w-5 text-dynamic-green" />
                        </div>
                        <h4 className="font-semibold text-lg">Response</h4>
                      </div>
                      <p className="text-foreground/70 text-sm leading-relaxed">
                        We'll respond within 24 hours to acknowledge reports
                      </p>
                    </Card>
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>
        </div>
      </section>

      {/* Trust Indicators */}
      <section className="relative px-4 py-24 pb-32 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-16 text-center"
          >
            <h2 className="mb-4 font-bold text-4xl sm:text-5xl">
              Trusted{' '}
              <span className="bg-linear-to-r from-dynamic-green via-dynamic-cyan to-dynamic-blue bg-clip-text text-transparent">
                Globally
              </span>
            </h2>
            <p className="mx-auto max-w-2xl text-foreground/60 text-lg">
              Our commitment to security and transparency
            </p>
          </motion.div>

          <div className="grid gap-8 md:grid-cols-3">
            {[
              {
                icon: ShieldCheck,
                title: 'Responsible Disclosure',
                description:
                  'We work with security researchers to responsibly disclose vulnerabilities',
                color: 'green',
              },
              {
                icon: Globe2,
                title: 'Bug Bounty Program',
                description:
                  'Active program rewarding ethical hackers for finding security issues',
                color: 'blue',
              },
              {
                icon: FileText,
                title: 'Transparent Communication',
                description:
                  'Regular security updates and clear documentation of our practices',
                color: 'purple',
              },
            ].map((item, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <Card
                  className={cn(
                    'h-full p-8 text-center transition-all hover:shadow-lg',
                    `border-dynamic-${item.color}/30 bg-linear-to-br from-dynamic-${item.color}/5 via-background to-background hover:border-dynamic-${item.color}/50 hover:shadow-dynamic-${item.color}/10`
                  )}
                >
                  <div
                    className={cn(
                      'mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl',
                      `bg-dynamic-${item.color}/10`
                    )}
                  >
                    <item.icon
                      className={cn('h-8 w-8', `text-dynamic-${item.color}`)}
                    />
                  </div>
                  <h3 className="mb-3 font-bold text-xl">{item.title}</h3>
                  <p className="text-foreground/60 text-sm leading-relaxed">
                    {item.description}
                  </p>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
