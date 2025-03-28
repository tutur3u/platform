'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { Card } from '@tuturuuu/ui/card';
import {
  AlertTriangle,
  Bug,
  Eye,
  FileText,
  Fingerprint,
  Globe2,
  Key,
  Lock,
  LucideIcon,
  Mail,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
} from '@tuturuuu/ui/icons';
import { motion } from 'framer-motion';

interface SecurityFeature {
  icon: LucideIcon;
  title: string;
  description: string;
}

const securityFeatures: SecurityFeature[] = [
  {
    icon: Lock,
    title: 'End-to-End Encryption',
    description:
      'All sensitive data is encrypted in transit and at rest using industry-standard encryption protocols.',
  },
  {
    icon: Shield,
    title: 'Regular Security Audits',
    description:
      'Continuous security assessments and penetration testing to identify and address potential vulnerabilities.',
  },
  {
    icon: UserCheck,
    title: 'Access Control',
    description:
      'Role-based access control (RBAC) and multi-factor authentication (MFA) to ensure secure access.',
  },
  {
    icon: Fingerprint,
    title: 'Data Privacy',
    description:
      'Strict data privacy controls and compliance with global privacy regulations and standards.',
  },
  {
    icon: Key,
    title: 'Key Management',
    description:
      'Secure key management system with regular rotation and strict access policies.',
  },
  {
    icon: Server,
    title: 'Infrastructure Security',
    description:
      'Secure cloud infrastructure with multiple layers of protection and redundancy.',
  },
  {
    icon: Eye,
    title: 'Monitoring & Logging',
    description:
      '24/7 security monitoring and comprehensive logging of all system activities.',
  },
  {
    icon: Bug,
    title: 'Bug Bounty Program',
    description:
      'Active bug bounty program to encourage responsible disclosure of security vulnerabilities.',
  },
];

export default function SecurityPage() {
  return (
    <main className="container relative space-y-24 py-16 md:py-24">
      {/* Enhanced Background Effects */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(var(--primary-rgb),0.05)_1px,transparent_1px)] bg-[size:24px_24px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(var(--primary-rgb),0.02)_1px,transparent_1px)] bg-[size:120px] opacity-20" />
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.1, 0.15, 0.1] }}
          transition={{
            duration: 5,
            repeat: Infinity,
            ease: 'linear',
          }}
          className="absolute inset-0 bg-[conic-gradient(from_0deg_at_50%_50%,rgba(var(--primary-rgb),0.05),transparent)]"
        />
      </div>

      {/* Hero Section */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center"
      >
        <Badge
          variant="secondary"
          className="mb-6 px-4 py-2 text-base font-medium"
        >
          Security First
        </Badge>
        <h1 className="text-foreground mb-6 text-balance text-4xl font-bold md:text-5xl lg:text-6xl">
          Your Security is Our{' '}
          <span className="from-primary bg-gradient-to-r via-purple-500 to-pink-500 bg-clip-text text-transparent">
            Top Priority
          </span>
        </h1>
        <p className="text-foreground/80 mx-auto max-w-2xl text-lg md:text-xl">
          We are committed to protecting your data with industry-leading
          security practices and continuous monitoring.
        </p>
      </motion.section>

      {/* Security Features Grid */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="relative"
      >
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {securityFeatures.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              whileHover={{ y: -5 }}
              className="group"
            >
              <Card className="bg-foreground/5 relative h-full overflow-hidden backdrop-blur-sm">
                <motion.div
                  initial={{ opacity: 0 }}
                  whileHover={{ opacity: 1 }}
                  className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-pink-500/5 to-transparent"
                />
                <div className="pointer-events-none relative p-6">
                  <div className="bg-primary/10 group-hover:bg-primary/20 mb-6 flex h-12 w-12 items-center justify-center rounded-xl transition-colors">
                    <feature.icon className="text-primary h-6 w-6" />
                  </div>
                  <h3 className="text-foreground mb-2 text-lg font-bold">
                    {feature.title}
                  </h3>
                  <p className="text-foreground/60">{feature.description}</p>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* Report Vulnerability Section */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="relative"
      >
        <Card className="group relative overflow-hidden">
          <div className="absolute inset-0">
            <div className="from-primary/10 absolute inset-0 bg-gradient-to-br via-purple-500/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(var(--primary-rgb),0.05)_1px,transparent_1px)] bg-[size:20px_20px]" />
          </div>

          <div className="relative grid gap-12 p-8 md:grid-cols-2 md:p-12">
            <div className="space-y-8">
              <motion.div
                initial={{ scale: 0.95 }}
                whileHover={{ scale: 1 }}
                className="bg-primary/10 group-hover:bg-primary/20 relative mx-auto flex h-20 w-20 items-center justify-center rounded-2xl transition-colors duration-300 md:mx-0"
              >
                <ShieldAlert className="text-primary relative h-10 w-10" />
              </motion.div>

              <div className="space-y-4 text-center md:text-left">
                <h2 className="text-foreground text-3xl font-bold">
                  <span className="from-primary bg-gradient-to-r via-purple-500 to-pink-500 bg-clip-text text-transparent">
                    Report a Vulnerability
                  </span>
                </h2>
                <p className="text-foreground/80 mx-auto max-w-2xl text-lg">
                  Found a security vulnerability? We appreciate your help in
                  disclosing it responsibly. Please contact our security team
                  directly.
                </p>
              </div>

              <div className="flex flex-wrap justify-center gap-4 md:justify-start">
                <motion.a
                  href="mailto:security@tuturuuu.com"
                  className="bg-foreground text-background hover:bg-foreground/90 group relative inline-flex items-center gap-2 overflow-hidden rounded-lg px-8 py-4 font-semibold transition-all duration-300"
                  whileHover={{ scale: 1.05 }}
                >
                  <div className="from-primary/20 to-primary/0 absolute inset-0 bg-gradient-to-r opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  <Mail className="relative h-5 w-5" />
                  <span className="relative">Contact Security Team</span>
                </motion.a>

                <motion.a
                  href="https://github.com/tutur3u/platform/blob/main/SECURITY.md"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-foreground/10 hover:bg-foreground/20 group relative inline-flex items-center gap-2 overflow-hidden rounded-lg px-8 py-4 font-semibold transition-all duration-300"
                  whileHover={{ scale: 1.05 }}
                >
                  <div className="from-primary/10 to-primary/0 absolute inset-0 bg-gradient-to-r opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  <FileText className="relative h-5 w-5" />
                  <span className="relative">Security Policy</span>
                </motion.a>
              </div>

              <div className="flex flex-wrap justify-center gap-6 md:justify-start">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="text-primary h-5 w-5" />
                  <span className="text-foreground/60 text-sm">
                    Responsible Disclosure
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Globe2 className="text-primary h-5 w-5" />
                  <span className="text-foreground/60 text-sm">
                    Bug Bounty Program
                  </span>
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="bg-foreground/5 relative overflow-hidden rounded-2xl p-6 backdrop-blur-sm md:p-8">
                <div className="space-y-6">
                  <h3 className="text-foreground text-xl font-bold">
                    Reporting Guidelines
                  </h3>
                  <div className="space-y-4">
                    <div className="border-primary/10 bg-background/50 flex items-center gap-3 rounded-lg border p-4">
                      <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-full">
                        <AlertTriangle className="text-primary h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="font-semibold">Scope</h4>
                        <p className="text-foreground/60 text-sm">
                          Security issues in our core services and
                          infrastructure
                        </p>
                      </div>
                    </div>

                    <div className="border-primary/10 bg-background/50 flex items-center gap-3 rounded-lg border p-4">
                      <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-full">
                        <Mail className="text-primary h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="font-semibold">Contact</h4>
                        <p className="text-foreground/60 text-sm">
                          Email security@tuturuuu.com with detailed reports
                        </p>
                      </div>
                    </div>

                    <div className="border-primary/10 bg-background/50 flex items-center gap-3 rounded-lg border p-4">
                      <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-full">
                        <Shield className="text-primary h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="font-semibold">Response</h4>
                        <p className="text-foreground/60 text-sm">
                          We'll respond within 24 hours to acknowledge reports
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </motion.section>
    </main>
  );
}
