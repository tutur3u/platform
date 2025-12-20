'use client';

import {
  AlertTriangle,
  ArrowRight,
  Bug,
  Calendar,
  Clock,
  FileText,
  GithubIcon,
  Globe2,
  Mail,
  MessageSquare,
  Shield,
  ShieldCheck,
  Sparkles,
  Star,
  Trophy,
  Upload,
  Users,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { motion, type Variants } from 'framer-motion';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { GITHUB_OWNER, GITHUB_REPO } from '@/constants/common';

// Dynamically import Confetti to avoid hydration issues
const Confetti = dynamic(() => import('react-confetti'), { ssr: false });

interface BugReport {
  title: string;
  reporter: string;
  dateSubmitted: string;
  severity: 'High' | 'Medium' | 'Low' | 'Informational';
  status: 'Patched' | 'In Progress' | 'Scheduled';
  cwe: string;
  description: string;
  impact?: string;
  remediation?: string;
  patchPlan?: string;
}

const bugReport: BugReport = {
  title: 'Stored Cross-Site Scripting (XSS) via SVG file upload',
  reporter: 'Nguyen Nghia Hiep (vapour)',
  dateSubmitted: '2025-03-30',
  severity: 'Low',
  status: 'Scheduled',
  cwe: '79 & 434',
  description:
    'A vulnerability was discovered that affects all Tuturuuu products and services that integrate Supabase-based storage management for avatar uploads. When users upload an SVG image to edit their avatar, this triggers a POST request to an endpoint that can be manipulated by a malicious actor. While Tuturuuu infrastructure automatically blocks scripts from running on Tuturuuu-powered websites, this vulnerability becomes exploitable when users directly access the uploaded SVG file through the Supabase storage link.',
  impact:
    'If a user were to access the SVG file directly via the Supabase storage link, malicious JavaScript code embedded within the SVG could be executed, potentially leading to session hijacking, credential theft, or redirection to malicious sites. This is a low-priority issue as it does not affect end users who do not directly access avatar images from the Supabase storage URLs.',
  remediation:
    'The recommended solution is to restrict SVG file uploads or implement server-side sanitization of SVG content to remove JavaScript before storage.',
  patchPlan:
    'Future patching will include blocking public uploads to the Supabase avatars folder, implementing SVG sanitization on our backend servers, and enhancing the security procedures for handling image-related uploads. This will involve more thorough business logic validation and improved content security policies.',
};

// Floating animation variants
const floatingVariants = {
  initial: { y: 0 },
  float: {
    y: [-5, 5],
    transition: {
      duration: 2,
      repeat: Infinity,
      repeatType: 'reverse',
      ease: 'easeInOut',
    },
  },
} satisfies Variants;

export default function BugBountyPage() {
  const [isConfettiActive, setIsConfettiActive] = useState(false);
  const [windowDimensions, setWindowDimensions] = useState({
    width: 0,
    height: 0,
  });

  useEffect(() => {
    // Set window dimensions
    setWindowDimensions({
      width: window.innerWidth,
      height: window.innerHeight,
    });

    // Start confetti
    setIsConfettiActive(true);

    // Disable confetti after 5 seconds
    const timer = setTimeout(() => {
      setIsConfettiActive(false);
    }, 5000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <main className="relative mx-auto w-full overflow-x-hidden text-balance">
      {/* Confetti Celebration */}
      {isConfettiActive && (
        <Confetti
          width={windowDimensions.width}
          height={windowDimensions.height}
          numberOfPieces={200}
          recycle={false}
          colors={[
            '#4180E9',
            '#4ACA3F',
            '#FB7B05',
            '#E94646',
            '#9333EA',
            '#EC4899',
          ]}
        />
      )}

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
              variants={floatingVariants}
              initial="initial"
              animate="float"
            >
              <Badge
                variant="secondary"
                className="mb-6 border-dynamic-yellow/30 bg-dynamic-yellow/10 text-dynamic-yellow transition-all hover:scale-105 hover:bg-dynamic-yellow/20 hover:shadow-dynamic-yellow/20 hover:shadow-lg"
              >
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                Security Hero
              </Badge>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.8 }}
              className="mb-6 text-balance font-bold text-4xl tracking-tight sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl"
            >
              Thank You for Your{' '}
              <span className="animate-gradient bg-linear-to-r from-dynamic-yellow via-dynamic-orange to-dynamic-red bg-clip-text text-transparent">
                Security Contribution
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.8 }}
              className="mx-auto mb-12 max-w-3xl text-balance text-base text-foreground/70 leading-relaxed sm:text-lg md:text-xl lg:text-2xl"
            >
              We celebrate the security researchers who help make Tuturuuu safer
              for everyone. Your vigilance and expertise are invaluable to our
              community.
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* Spotlight Hero Section */}
      <section className="relative px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <Card className="overflow-hidden border-dynamic-yellow/30 bg-linear-to-br from-dynamic-yellow/10 via-dynamic-orange/5 to-background p-8 md:p-12">
              <div className="mb-12 flex flex-col items-center justify-center gap-6">
                <motion.div
                  initial={{ scale: 0.9 }}
                  animate={{ scale: 1 }}
                  whileHover={{ scale: 1.05 }}
                  className="relative"
                >
                  <div className="absolute inset-0 rounded-full bg-linear-to-r from-dynamic-yellow/30 via-dynamic-orange/30 to-dynamic-red/30 blur-2xl" />
                  <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-linear-to-br from-dynamic-yellow via-dynamic-orange to-dynamic-red shadow-lg">
                    <Trophy className="h-12 w-12 text-white" />
                  </div>
                </motion.div>

                <div className="text-center">
                  <h2 className="mb-2 font-bold text-3xl sm:text-4xl">
                    Nguyen Nghia Hiep (vapour)
                  </h2>
                  <p className="text-foreground/60 text-lg">
                    Security Researcher Extraordinaire
                  </p>
                </div>

                <Badge
                  variant="secondary"
                  className="border-dynamic-yellow/30 bg-dynamic-yellow/10 px-6 py-2 text-dynamic-yellow"
                >
                  <Star className="mr-2 h-4 w-4" />
                  Top Contributor
                </Badge>
              </div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.3 }}
                className="mx-auto max-w-2xl text-balance text-center"
              >
                <p className="text-foreground/70 text-lg italic leading-relaxed">
                  "Thank you for your valuable contribution to making Tuturuuu's
                  products more secure. Your ethical approach to security
                  research helps protect our users worldwide."
                </p>
              </motion.div>
            </Card>
          </motion.div>
        </div>
      </section>

      {/* Bug Report Section */}
      <section className="relative px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-16 text-center"
          >
            <Badge
              variant="secondary"
              className="mb-4 border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red"
            >
              <Bug className="mr-2 h-4 w-4" />
              Security Report
            </Badge>
            <h2 className="mb-4 font-bold text-4xl sm:text-5xl">
              Vulnerability{' '}
              <span className="bg-linear-to-r from-dynamic-red via-dynamic-orange to-dynamic-yellow bg-clip-text text-transparent">
                Discovery
              </span>
            </h2>
            <p className="mx-auto max-w-2xl text-foreground/60 text-lg">
              This report has helped us identify a security vulnerability,
              allowing us to plan appropriate mitigations.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
          >
            <Card className="overflow-hidden border-dynamic-orange/30 bg-linear-to-br from-dynamic-orange/5 via-background to-background p-8 md:p-10">
              <div className="mb-8 flex flex-wrap items-center gap-4">
                <Badge
                  variant="secondary"
                  className="border-dynamic-yellow/30 bg-dynamic-yellow/10 px-4 py-2 text-dynamic-yellow"
                >
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  {bugReport.severity} Severity
                </Badge>
                <Badge
                  variant="secondary"
                  className="border-dynamic-blue/30 bg-dynamic-blue/10 px-4 py-2 text-dynamic-blue"
                >
                  <Clock className="mr-2 h-4 w-4" />
                  {bugReport.status}
                </Badge>
                <Badge
                  variant="secondary"
                  className="border-dynamic-purple/30 bg-dynamic-purple/10 px-4 py-2 text-dynamic-purple"
                >
                  <FileText className="mr-2 h-4 w-4" />
                  CWE: {bugReport.cwe}
                </Badge>
                <div className="flex items-center gap-2 rounded-full bg-foreground/5 px-4 py-2 text-foreground/60 text-sm">
                  <Calendar className="h-4 w-4" />
                  {bugReport.dateSubmitted}
                </div>
              </div>

              <h3 className="mb-6 font-bold text-2xl sm:text-3xl">
                {bugReport.title}
              </h3>

              <div className="mb-8 flex items-center gap-3 rounded-lg border border-foreground/10 bg-foreground/5 px-4 py-3">
                <Users className="h-5 w-5 text-primary" />
                <span className="text-foreground/60">Reported by:</span>
                <span className="font-medium">{bugReport.reporter}</span>
              </div>

              <div className="space-y-6">
                <Card className="border-dynamic-red/30 bg-dynamic-red/5 p-6">
                  <h4 className="mb-3 flex items-center gap-2 font-semibold text-lg">
                    <Bug className="h-5 w-5 text-dynamic-red" />
                    Description
                  </h4>
                  <p className="text-foreground/70 leading-relaxed">
                    {bugReport.description}
                  </p>
                </Card>

                {bugReport.impact && (
                  <Card className="border-dynamic-orange/30 bg-dynamic-orange/5 p-6">
                    <h4 className="mb-3 flex items-center gap-2 font-semibold text-lg">
                      <AlertTriangle className="h-5 w-5 text-dynamic-orange" />
                      Impact
                    </h4>
                    <p className="text-foreground/70 leading-relaxed">
                      {bugReport.impact}
                    </p>
                  </Card>
                )}

                {bugReport.remediation && (
                  <Card className="border-dynamic-green/30 bg-dynamic-green/5 p-6">
                    <h4 className="mb-3 flex items-center gap-2 font-semibold text-lg">
                      <ShieldCheck className="h-5 w-5 text-dynamic-green" />
                      Recommended Remediation
                    </h4>
                    <p className="text-foreground/70 leading-relaxed">
                      {bugReport.remediation}
                    </p>
                  </Card>
                )}

                {bugReport.patchPlan && (
                  <Card className="border-dynamic-blue/30 bg-dynamic-blue/5 p-6">
                    <h4 className="mb-3 flex items-center gap-2 font-semibold text-lg">
                      <Upload className="h-5 w-5 text-dynamic-blue" />
                      Future Patching Plan
                    </h4>
                    <p className="text-foreground/70 leading-relaxed">
                      {bugReport.patchPlan}
                    </p>
                  </Card>
                )}
              </div>

              <div className="mt-8 flex justify-center">
                <Badge
                  variant="secondary"
                  className="border-dynamic-blue/30 bg-dynamic-blue/10 px-6 py-3 text-dynamic-blue"
                >
                  <Clock className="mr-2 h-5 w-5" />
                  Scheduled for Future Release
                </Badge>
              </div>
            </Card>
          </motion.div>
        </div>
      </section>

      {/* Program Information Section */}
      <section className="relative px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <Card className="overflow-hidden border-dynamic-purple/30 bg-linear-to-br from-dynamic-purple/5 via-background to-background p-8 md:p-12">
              <div className="grid gap-12 lg:grid-cols-2">
                <div className="flex flex-col justify-center">
                  <motion.div
                    initial={{ scale: 0.9 }}
                    whileHover={{ scale: 1 }}
                    className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-dynamic-purple/10"
                  >
                    <Bug className="h-10 w-10 text-dynamic-purple" />
                  </motion.div>

                  <h2 className="mb-4 font-bold text-3xl sm:text-4xl">
                    <span className="bg-linear-to-r from-dynamic-purple via-dynamic-pink to-dynamic-red bg-clip-text text-transparent">
                      Join Our Bug Bounty Program
                    </span>
                  </h2>
                  <p className="mb-8 text-foreground/70 text-lg leading-relaxed">
                    Help us identify security vulnerabilities and get recognized
                    for your contributions. We value ethical security research.
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
                        <GithubIcon className="mr-2 h-5 w-5" />
                        Security Policy
                      </a>
                    </Button>
                  </div>
                </div>

                <div>
                  <div className="space-y-4">
                    <h3 className="mb-6 font-bold text-2xl">
                      Program Benefits
                    </h3>

                    <Card className="border-dynamic-yellow/30 bg-dynamic-yellow/5 p-6">
                      <div className="mb-3 flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-dynamic-yellow/10">
                          <Trophy className="h-5 w-5 text-dynamic-yellow" />
                        </div>
                        <h4 className="font-semibold text-lg">Recognition</h4>
                      </div>
                      <p className="text-foreground/70 text-sm leading-relaxed">
                        Get your name listed on our Bug Bounty Hall of Fame
                      </p>
                    </Card>

                    <Card className="border-dynamic-blue/30 bg-dynamic-blue/5 p-6">
                      <div className="mb-3 flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-dynamic-blue/10">
                          <MessageSquare className="h-5 w-5 text-dynamic-blue" />
                        </div>
                        <h4 className="font-semibold text-lg">
                          Direct Communication
                        </h4>
                      </div>
                      <p className="text-foreground/70 text-sm leading-relaxed">
                        Work directly with our security team
                      </p>
                    </Card>

                    <Card className="border-dynamic-green/30 bg-dynamic-green/5 p-6">
                      <div className="mb-3 flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-dynamic-green/10">
                          <Globe2 className="h-5 w-5 text-dynamic-green" />
                        </div>
                        <h4 className="font-semibold text-lg">Global Impact</h4>
                      </div>
                      <p className="text-foreground/70 text-sm leading-relaxed">
                        Help protect Tuturuuu users around the world
                      </p>
                    </Card>
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>
        </div>
      </section>

      {/* Call to Action */}
      <section className="relative px-4 py-24 pb-32 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <Card className="relative overflow-hidden border-dynamic-purple/30 bg-linear-to-br from-dynamic-purple/10 via-dynamic-pink/5 to-background p-12">
              {/* Decorative Elements */}
              <div className="absolute inset-0 overflow-hidden opacity-10">
                <div className="absolute top-10 left-10 h-40 w-40 rounded-full bg-dynamic-purple blur-3xl" />
                <div className="absolute right-20 bottom-20 h-40 w-40 rounded-full bg-dynamic-pink blur-3xl" />
              </div>

              <div className="relative text-center">
                <motion.div
                  variants={floatingVariants}
                  initial="initial"
                  animate="float"
                >
                  <Shield className="mx-auto mb-6 h-16 w-16 text-dynamic-purple" />
                </motion.div>
                <h2 className="mb-4 font-bold text-4xl sm:text-5xl">
                  Found a vulnerability?
                </h2>
                <p className="mx-auto mb-8 max-w-2xl text-foreground/70 text-lg leading-relaxed">
                  Report it responsibly and join our list of security
                  contributors.
                </p>

                <div className="flex flex-wrap items-center justify-center gap-4">
                  <Button size="lg" asChild>
                    <a href="mailto:security@tuturuuu.com">
                      <Mail className="mr-2 h-5 w-5" />
                      Report a Vulnerability
                    </a>
                  </Button>
                  <Button size="lg" variant="outline" asChild>
                    <Link href="/security">
                      <Shield className="mr-2 h-5 w-5" />
                      Security Page
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Link>
                  </Button>
                </div>
              </div>
            </Card>
          </motion.div>
        </div>
      </section>
    </main>
  );
}
