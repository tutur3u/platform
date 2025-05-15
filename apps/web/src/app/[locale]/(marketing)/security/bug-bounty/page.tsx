'use client';

import { GITHUB_OWNER, GITHUB_REPO } from '@/constants/common';
import { Badge } from '@tuturuuu/ui/badge';
import { Card } from '@tuturuuu/ui/card';
import {
  AlertTriangle,
  Bug,
  Calendar,
  Clock,
  ExternalLink,
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
} from '@tuturuuu/ui/icons';
import { Variants, motion, useAnimation } from 'framer-motion';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useState } from 'react';

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
const floatingVariants: Variants = {
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
};

// Glowing animation variants
const glowVariants: Variants = {
  initial: { opacity: 0.7, scale: 1 },
  glow: {
    opacity: [0.7, 1, 0.7],
    scale: [1, 1.05, 1],
    transition: {
      duration: 3,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
};

export default function BugBountyPage() {
  const [isConfettiActive, setIsConfettiActive] = useState(false);
  const [windowDimensions, setWindowDimensions] = useState({
    width: 0,
    height: 0,
  });
  const controls = useAnimation();

  useEffect(() => {
    // Set window dimensions
    setWindowDimensions({
      width: window.innerWidth,
      height: window.innerHeight,
    });

    // Start animations and confetti
    controls.start('glow');
    setIsConfettiActive(true);

    // Disable confetti after 5 seconds
    const timer = setTimeout(() => {
      controls.stop();
    }, 5000);

    return () => clearTimeout(timer);
  }, [controls]);

  return (
    <main className="container relative space-y-24 py-16 md:py-24">
      {/* Confetti Celebration */}
      {isConfettiActive && (
        <Confetti
          width={windowDimensions.width}
          height={windowDimensions.height}
          numberOfPieces={200}
          recycle={false}
          colors={['#FF5733', '#33FF57', '#3357FF', '#F3FF33', '#FF33F3']}
        />
      )}

      {/* Enhanced Background Effects */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(var(--primary-rgb),0.05)_1px,transparent_1px)] bg-size-[24px_24px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(var(--primary-rgb),0.02)_1px,transparent_1px)] bg-size-[120px] opacity-20" />
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

      {/* Hero Section with Enhanced Effects */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center"
      >
        <motion.div
          variants={floatingVariants}
          initial="initial"
          animate="float"
        >
          <Badge
            variant="secondary"
            className="mb-6 px-4 py-2 text-base font-medium"
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Security Hero
          </Badge>
        </motion.div>

        <h1 className="text-foreground mb-6 text-balance text-4xl font-bold md:text-5xl lg:text-6xl">
          <span className="relative inline-block">
            <motion.span
              animate={{
                opacity: [0.2, 1, 0.2],
                scale: [0.98, 1, 0.98],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              className="from-primary/40 absolute -inset-1 -z-10 rounded-lg bg-linear-to-r via-purple-500/40 to-pink-500/40 blur-lg"
            />
            Thank You
          </span>{' '}
          for Your{' '}
          <span className="from-primary bg-linear-to-r via-purple-500 to-pink-500 bg-clip-text text-transparent">
            Security Contribution
          </span>
        </h1>

        <motion.p
          className="text-foreground/80 mx-auto max-w-2xl text-balance text-lg md:text-xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.8 }}
        >
          We celebrate the security researchers who help make Tuturuuu safer for
          everyone. Your vigilance and expertise are invaluable to our
          community.
        </motion.p>
      </motion.section>

      {/* Spotlight Hero Section */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="relative"
      >
        <Card className="border-primary/10 group relative overflow-hidden">
          <div className="absolute inset-0">
            <div className="from-primary/10 absolute inset-0 bg-linear-to-br via-purple-500/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            <motion.div
              className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(var(--primary-rgb),0.05)_1px,transparent_1px)] bg-size-[20px_20px]"
              animate={{
                backgroundPosition: ['0% 0%', '100% 100%'],
              }}
              transition={{
                duration: 20,
                repeat: Infinity,
                repeatType: 'reverse',
                ease: 'linear',
              }}
            />
          </div>

          <div className="relative p-8 md:p-12">
            <div className="mb-12 flex flex-col items-center justify-center gap-4">
              <motion.div
                variants={glowVariants}
                initial="initial"
                animate={controls}
                className="relative"
              >
                <div className="from-primary/20 absolute -inset-3 rounded-full bg-linear-to-r via-purple-500/20 to-pink-500/20 blur-md" />
                <div className="from-primary relative flex h-24 w-24 items-center justify-center rounded-full bg-linear-to-br via-purple-500/80 to-pink-500/80">
                  <Trophy className="h-10 w-10 text-white" />
                </div>
              </motion.div>

              <div className="text-center">
                <h2 className="text-foreground mb-2 text-3xl font-bold">
                  Nguyen Nghia Hiep (vapour)
                </h2>
                <p className="text-muted-foreground">
                  Security Researcher Extraordinaire
                </p>
              </div>

              <motion.div className="bg-primary/10 mt-4 flex items-center gap-2 rounded-full px-6 py-2">
                <Star className="text-primary h-4 w-4" />
                <span>Top Contributor</span>
              </motion.div>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
              className="mx-auto mb-8 max-w-2xl text-balance text-center"
            >
              <p className="text-foreground/80 italic">
                "Thank you for your valuable contribution to making Tuturuuu's
                products more secure. Your ethical approach to security research
                helps protect our users worldwide."
              </p>
            </motion.div>
          </div>
        </Card>
      </motion.section>

      {/* Bug Report Section with Enhanced Design */}
      <motion.section
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="relative"
      >
        <div className="mb-12 text-center">
          <Badge variant="outline" className="mb-4">
            <Bug className="mr-2 h-4 w-4" />
            Security Report
          </Badge>
          <h2 className="mb-4 text-3xl font-bold">Vulnerability Discovery</h2>
          <p className="text-muted-foreground mx-auto max-w-2xl">
            This report has helped us identify a security vulnerability,
            allowing us to plan appropriate mitigations.
          </p>
        </div>

        <motion.div
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          className="group"
        >
          <Card className="border-primary/10 bg-foreground/5 relative overflow-hidden backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0 }}
              whileHover={{ opacity: 1 }}
              className="absolute inset-0 bg-linear-to-br from-purple-500/10 via-pink-500/5 to-transparent"
            />
            <div className="relative p-8 md:p-10">
              <div className="mb-8 flex flex-wrap items-center gap-4">
                <Badge variant="outline" className="px-4 py-2">
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  {bugReport.severity} Severity
                </Badge>
                <Badge
                  variant={
                    bugReport.status === 'Patched'
                      ? 'default'
                      : bugReport.status === 'In Progress'
                        ? 'secondary'
                        : 'outline'
                  }
                  className="px-4 py-2"
                >
                  <Clock className="mr-2 h-4 w-4" />
                  {bugReport.status}
                </Badge>
                <Badge variant="outline" className="px-4 py-2">
                  <FileText className="mr-2 h-4 w-4" />
                  CWE: {bugReport.cwe}
                </Badge>
                <div className="bg-foreground/5 text-muted-foreground flex items-center gap-2 rounded-full px-4 py-2 text-sm">
                  <Calendar className="h-4 w-4" />
                  {bugReport.dateSubmitted}
                </div>
              </div>

              <h3 className="text-foreground mb-6 text-lg font-bold md:text-2xl">
                {bugReport.title}
              </h3>

              <div className="bg-foreground/5 mb-6 flex flex-col items-center gap-2 rounded-lg px-4 py-3 text-sm md:flex-row">
                <Users className="text-primary h-5 w-5" />
                <span className="text-muted-foreground">Reported by:</span>
                <span className="font-medium">{bugReport.reporter}</span>
              </div>

              <div className="mb-8 space-y-6">
                <div className="border-primary/10 bg-background/50 rounded-lg border p-6">
                  <h4 className="mb-3 flex items-center gap-2 font-semibold">
                    <Bug className="text-primary h-5 w-5" />
                    Description
                  </h4>
                  <p className="text-foreground/80">{bugReport.description}</p>
                </div>

                {bugReport.impact && (
                  <div className="border-primary/10 bg-background/50 rounded-lg border p-6">
                    <h4 className="mb-3 flex items-center gap-2 font-semibold">
                      <AlertTriangle className="text-primary h-5 w-5" />
                      Impact
                    </h4>
                    <p className="text-foreground/80">{bugReport.impact}</p>
                  </div>
                )}

                {bugReport.remediation && (
                  <div className="border-primary/10 bg-background/50 rounded-lg border p-6">
                    <h4 className="mb-3 flex items-center gap-2 font-semibold">
                      <ShieldCheck className="text-primary h-5 w-5" />
                      Recommended Remediation
                    </h4>
                    <p className="text-foreground/80">
                      {bugReport.remediation}
                    </p>
                  </div>
                )}

                {bugReport.patchPlan && (
                  <div className="border-primary/10 bg-background/50 rounded-lg border p-6">
                    <h4 className="mb-3 flex items-center gap-2 font-semibold">
                      <Upload className="text-primary h-5 w-5" />
                      Future Patching Plan
                    </h4>
                    <p className="text-foreground/80">{bugReport.patchPlan}</p>
                  </div>
                )}
              </div>

              <div className="mt-8 flex justify-center">
                <motion.div
                  whileTap={{ scale: 0.95 }}
                  className="bg-primary/10 inline-flex items-center gap-2 rounded-full px-6 py-3"
                >
                  <Clock className="text-primary h-5 w-5" />
                  <span>Scheduled for Future Release</span>
                </motion.div>
              </div>
            </div>
          </Card>
        </motion.div>
      </motion.section>

      {/* Program Information Section */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="relative"
      >
        <Card className="border-primary/10 group relative overflow-hidden">
          <div className="absolute inset-0">
            <div className="from-primary/10 absolute inset-0 bg-linear-to-br via-purple-500/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            <motion.div
              className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(var(--primary-rgb),0.05)_1px,transparent_1px)] bg-size-[20px_20px]"
              animate={{
                backgroundPosition: ['0% 0%', '100% 100%'],
              }}
              transition={{
                duration: 20,
                repeat: Infinity,
                repeatType: 'reverse',
                ease: 'linear',
              }}
            />
          </div>

          <div className="relative grid gap-12 p-8 md:grid-cols-2 md:p-12">
            <div className="space-y-8">
              <motion.div
                initial={{ scale: 0.95 }}
                whileHover={{ scale: 1 }}
                className="bg-primary/10 group-hover:bg-primary/20 relative mx-auto flex h-20 w-20 items-center justify-center rounded-2xl transition-colors duration-300 md:mx-0"
              >
                <Bug className="text-primary relative h-10 w-10" />
              </motion.div>

              <div className="space-y-4 text-center md:text-left">
                <h2 className="text-foreground text-3xl font-bold">
                  <span className="from-primary bg-linear-to-r via-purple-500 to-pink-500 bg-clip-text text-transparent">
                    Join Our Bug Bounty Program
                  </span>
                </h2>
                <p className="text-foreground/80 mx-auto max-w-2xl text-lg">
                  Help us identify security vulnerabilities and get recognized
                  for your contributions. We value ethical security research.
                </p>
              </div>

              <div className="flex flex-wrap justify-center gap-4 md:justify-start">
                <motion.a
                  href="mailto:security@tuturuuu.com"
                  className="bg-foreground text-background hover:bg-foreground/90 group relative inline-flex items-center gap-2 overflow-hidden rounded-lg px-8 py-4 font-semibold transition-all duration-300"
                >
                  <div className="from-primary/20 to-primary/0 absolute inset-0 bg-linear-to-r opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  <Mail className="relative h-5 w-5" />
                  <span className="relative">Contact Security Team</span>
                </motion.a>

                <motion.a
                  href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/blob/main/SECURITY.md`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-foreground/10 hover:bg-foreground/20 group relative inline-flex items-center gap-2 overflow-hidden rounded-lg px-8 py-4 font-semibold transition-all duration-300"
                >
                  <div className="from-primary/10 to-primary/0 absolute inset-0 bg-linear-to-r opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  <GithubIcon className="relative h-5 w-5" />
                  <span className="relative">Security Policy</span>
                </motion.a>
              </div>
            </div>

            <div className="relative">
              <div className="bg-foreground/5 relative overflow-hidden rounded-2xl p-6 backdrop-blur-sm md:p-8">
                <div className="space-y-6">
                  <h3 className="text-foreground text-xl font-bold">
                    Program Benefits
                  </h3>
                  <div className="space-y-4">
                    <div className="border-primary/10 bg-background/50 flex items-center gap-3 rounded-lg border p-4">
                      <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-full">
                        <Trophy className="text-primary h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="font-semibold">Recognition</h4>
                        <p className="text-foreground/60 text-sm">
                          Get your name listed on our Bug Bounty Hall of Fame
                        </p>
                      </div>
                    </div>

                    <div className="border-primary/10 bg-background/50 flex items-center gap-3 rounded-lg border p-4">
                      <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-full">
                        <MessageSquare className="text-primary h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="font-semibold">Direct Communication</h4>
                        <p className="text-foreground/60 text-sm">
                          Work directly with our security team
                        </p>
                      </div>
                    </div>

                    <div className="border-primary/10 bg-background/50 flex items-center gap-3 rounded-lg border p-4">
                      <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-full">
                        <Globe2 className="text-primary h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="font-semibold">Global Impact</h4>
                        <p className="text-foreground/60 text-sm">
                          Help protect Tuturuuu users around the world
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

      {/* Call to Action with Enhanced Design */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-center"
      >
        <motion.div
          variants={floatingVariants}
          initial="initial"
          animate="float"
        >
          <h2 className="mb-6 text-2xl font-bold md:text-3xl">
            Found a vulnerability?
          </h2>
        </motion.div>
        <p className="text-muted-foreground mb-8">
          Report it responsibly and join our list of security contributors.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4">
          <motion.a
            href="mailto:security@tuturuuu.com"
            whileTap={{ scale: 0.95 }}
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-2 rounded-lg px-8 py-3 font-medium"
          >
            <Mail className="h-4 w-4" />
            Report a Vulnerability
          </motion.a>
          <Link href="/security">
            <motion.button
              whileTap={{ scale: 0.95 }}
              className="border-foreground/10 hover:bg-foreground/5 inline-flex items-center gap-2 rounded-lg border px-8 py-3 font-medium"
            >
              <Shield className="h-4 w-4" />
              Security Page
              <ExternalLink className="h-3 w-3" />
            </motion.button>
          </Link>
        </div>
      </motion.section>
    </main>
  );
}
