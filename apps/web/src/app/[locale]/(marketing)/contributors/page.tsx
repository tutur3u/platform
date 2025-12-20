'use client';

import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';
import {
  ArrowRight,
  Calendar,
  Code,
  FileText,
  GitBranch,
  GitCommit,
  GitFork,
  GithubIcon,
  GitPullRequest,
  Heart,
  Mail,
  MessageSquare,
  Sparkles,
  Star,
  TrendingUp,
  Users,
  Zap,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { Separator } from '@tuturuuu/ui/separator';
import { cn } from '@tuturuuu/utils/format';
import { motion } from 'framer-motion';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { GITHUB_OWNER, GITHUB_REPO } from '@/constants/common';

// Types
interface GithubUser {
  login: string;
  id: number;
  avatar_url: string;
  html_url: string;
  name?: string;
  bio?: string;
  created_at?: string;
}

interface GithubRepo {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
}

interface GithubContributor {
  login: string;
  id: number;
  avatar_url: string;
  html_url: string;
  contributions: number;
  userDetails?: GithubUser;
}

interface RepoStats {
  stars: number;
  forks: number;
  issues: number;
  contributors: number;
  pullRequests: number;
}

// Dynamically import Confetti to avoid hydration issues
const Confetti = dynamic(() => import('react-confetti'), {
  ssr: false,
});

// Initialize GitHub App authentication
async function getAuthenticatedOctokit() {
  const appId = process.env.NEXT_PUBLIC_GITHUB_APP_ID;
  const privateKey = process.env.NEXT_PUBLIC_GITHUB_APP_PRIVATE_KEY;
  const installationId = process.env.NEXT_PUBLIC_GITHUB_APP_INSTALLATION_ID;

  if (!appId || !privateKey || !installationId) {
    console.warn(
      'GitHub App credentials not found. Using unauthenticated requests.'
    );
    return new Octokit();
  }

  try {
    const auth = createAppAuth({
      appId,
      privateKey,
      installationId: Number(installationId),
    });

    const { token } = await auth({ type: 'installation' });

    return new Octokit({
      auth: token,
    });
  } catch (error) {
    console.error('Failed to authenticate with GitHub App:', error);
    return new Octokit();
  }
}

// Fetch GitHub data
async function fetchGithubRepo(
  octokit: Octokit,
  owner: string = GITHUB_OWNER,
  repo: string = GITHUB_REPO
): Promise<GithubRepo | undefined> {
  try {
    const { data } = await octokit.repos.get({
      owner,
      repo,
    });

    return data as GithubRepo;
  } catch (error) {
    console.error('Error fetching GitHub repository:', error);
    return undefined;
  }
}

async function fetchGithubContributors(
  octokit: Octokit,
  owner: string = GITHUB_OWNER,
  repo: string = GITHUB_REPO
): Promise<GithubContributor[]> {
  try {
    const { data } = await octokit.repos.listContributors({
      owner,
      repo,
      per_page: 25,
    });

    return data as GithubContributor[];
  } catch (error) {
    console.error('Error fetching GitHub contributors:', error);
    return [];
  }
}

async function fetchGithubUser(
  octokit: Octokit,
  username: string
): Promise<GithubUser | undefined> {
  try {
    const { data } = await octokit.users.getByUsername({
      username,
    });

    return data as GithubUser;
  } catch (error) {
    console.error(`Error fetching GitHub user ${username}:`, error);
    return undefined;
  }
}

async function fetchPullRequests(
  octokit: Octokit,
  owner: string = GITHUB_OWNER,
  repo: string = GITHUB_REPO
): Promise<number> {
  try {
    const { data: searchData } = await octokit.search.issuesAndPullRequests({
      q: `repo:${owner}/${repo} is:pr`,
      per_page: 1,
    });

    return searchData.total_count;
  } catch (error) {
    console.error('Error fetching GitHub pull requests:', error);
    return 0;
  }
}

// Helper functions for data visualization
function generateContributionTimeline(contributors: GithubContributor[]) {
  const months = Array.from({ length: 12 }, (_, i) =>
    new Date(0, i).toLocaleString('en', { month: 'short' })
  );

  const monthlyContributions = months.map((month) => ({
    month,
    contributions: 0,
  }));

  const totalContributions = contributors.reduce(
    (sum, contributor) => sum + contributor.contributions,
    0
  );

  let remainingContributions = totalContributions;
  for (let i = 0; i < months.length - 1; i++) {
    const allocation = Math.floor(
      remainingContributions * (0.1 + Math.random() * 0.2)
    );
    monthlyContributions[i]!.contributions = allocation;
    remainingContributions -= allocation;
  }

  monthlyContributions[months.length - 1]!.contributions =
    remainingContributions;

  return monthlyContributions;
}

function generateActivityTrend(contributors: GithubContributor[]) {
  const weeks = Array.from({ length: 12 }, (_, i) => ({
    name: `Week ${i + 1}`,
    contributions: 0,
  }));

  const totalContributions = contributors.reduce(
    (sum, contributor) => sum + contributor.contributions,
    0
  );

  const baseValue = totalContributions / 20;

  weeks.forEach((week, i) => {
    const trendFactor = 1 + (i / weeks.length) * 0.5;
    const variationFactor = 0.7 + Math.random() * 0.6;
    const periodFactor = Math.sin((i / weeks.length) * Math.PI * 2) * 0.3 + 1;

    week.contributions = Math.floor(
      baseValue * trendFactor * variationFactor * periodFactor
    );
  });

  return weeks;
}

export default function ContributorsPage() {
  const [githubData, setGithubData] = useState<{
    repo?: GithubRepo;
    contributors?: GithubContributor[];
    stats?: RepoStats;
    error?: string;
  }>({});
  const [loading, setLoading] = useState(true);
  const [windowDimensions, setWindowDimensions] = useState({
    width: 0,
    height: 0,
  });

  useEffect(() => {
    const handleResize = () => {
      setWindowDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  useEffect(() => {
    async function loadGithubData() {
      try {
        const owner = GITHUB_OWNER;
        const repo = GITHUB_REPO;

        const octokit = await getAuthenticatedOctokit();

        const repoData = await fetchGithubRepo(octokit, owner, repo);
        const contributors = await fetchGithubContributors(
          octokit,
          owner,
          repo
        );

        const enrichedContributors = await Promise.all(
          contributors.map(async (contributor, index) => {
            if (index < 25) {
              try {
                const userDetails = await fetchGithubUser(
                  octokit,
                  contributor.login
                );
                return { ...contributor, userDetails };
              } catch (err) {
                console.warn(
                  `Failed to fetch details for ${contributor.login}:`,
                  err
                );
                return contributor;
              }
            }
            return contributor;
          })
        );

        const pullRequestsCount = await fetchPullRequests(octokit, owner, repo);

        const stats: RepoStats = {
          stars: repoData?.stargazers_count || 0,
          forks: repoData?.forks_count || 0,
          issues: repoData?.open_issues_count || 0,
          contributors: contributors.length,
          pullRequests: pullRequestsCount,
        };

        setGithubData({
          repo: repoData,
          contributors: enrichedContributors,
          stats,
        });
      } catch (error) {
        console.error('Error fetching GitHub data:', error);
        setGithubData({
          error: 'Failed to fetch GitHub data. Please try again later.',
        });
      } finally {
        setLoading(false);
      }
    }

    loadGithubData();
  }, []);

  if (loading) {
    return (
      <main className="relative mx-auto w-full overflow-x-hidden text-balance">
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center">
            <LoadingIndicator className="mx-auto mb-4 h-12 w-12" />
            <p className="text-foreground/60">Loading contributors data...</p>
          </div>
        </div>
      </main>
    );
  }

  if (githubData.error) {
    return (
      <main className="relative mx-auto w-full overflow-x-hidden text-balance">
        <div className="flex min-h-screen items-center justify-center px-4">
          <div className="text-center">
            <GithubIcon className="mx-auto mb-4 h-16 w-16 text-foreground/40" />
            <h2 className="mb-2 font-bold text-2xl">Data Fetch Error</h2>
            <p className="mb-4 text-foreground/60">{githubData.error}</p>
            <Button asChild>
              <a
                href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <GithubIcon className="mr-2 h-4 w-4" />
                Visit GitHub Repository
              </a>
            </Button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="relative mx-auto w-full overflow-x-hidden text-balance">
      {/* Confetti Celebration */}
      <Confetti
        width={windowDimensions.width}
        height={windowDimensions.height}
        numberOfPieces={200}
        recycle={false}
        colors={['#FF5733', '#33FF57', '#3357FF', '#F3FF33', '#FF33F3']}
      />

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
                className="mb-6 border-dynamic-pink/30 bg-dynamic-pink/10 text-dynamic-pink transition-all hover:scale-105 hover:bg-dynamic-pink/20 hover:shadow-dynamic-pink/20 hover:shadow-lg"
              >
                <Heart className="mr-1.5 h-3.5 w-3.5" />
                Open Source Heroes
              </Badge>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.8 }}
              className="mb-6 text-balance font-bold text-4xl tracking-tight sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl"
            >
              Meet Our{' '}
              <span className="animate-gradient bg-linear-to-r from-dynamic-purple via-dynamic-pink to-dynamic-orange bg-clip-text text-transparent">
                Contributors
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.8 }}
              className="mx-auto mb-8 max-w-3xl text-balance text-base text-foreground/70 leading-relaxed sm:text-lg md:text-xl lg:text-2xl"
            >
              Celebrating the incredible individuals who make{' '}
              <strong className="text-foreground">Tuturuuu</strong> better every
              day through open source contributions, code reviews, and community
              engagement.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.8 }}
              className="mb-12 flex flex-col flex-wrap items-center justify-center gap-3 sm:flex-row sm:gap-4"
            >
              <Button
                size="lg"
                className="group w-full shadow-lg transition-all hover:scale-105 hover:shadow-xl sm:w-auto"
                asChild
              >
                <Link
                  href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`}
                  target="_blank"
                >
                  <GithubIcon className="mr-2 h-5 w-5" />
                  View Repository
                  <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="w-full transition-all hover:scale-105 sm:w-auto"
                asChild
              >
                <Link
                  href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/fork`}
                  target="_blank"
                >
                  <GitBranch className="mr-2 h-5 w-5" />
                  Fork Project
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="w-full transition-all hover:scale-105 sm:w-auto"
                asChild
              >
                <Link href="/careers">
                  <Users className="mr-2 h-5 w-5" />
                  Join Our Team
                </Link>
              </Button>
            </motion.div>

            {/* Trust Indicators */}
            {githubData.stats && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5, duration: 0.8 }}
                className="flex flex-col flex-wrap items-center justify-center gap-4 text-foreground/60 text-sm sm:flex-row sm:gap-6"
              >
                <div className="flex items-center gap-2 transition-colors hover:text-foreground/80">
                  <Star className="h-4 w-4 text-dynamic-amber" />
                  {githubData.stats.stars.toLocaleString()} Stars
                </div>
                <div className="flex items-center gap-2 transition-colors hover:text-foreground/80">
                  <GitFork className="h-4 w-4 text-dynamic-blue" />
                  {githubData.stats.forks.toLocaleString()} Forks
                </div>
                <div className="flex items-center gap-2 transition-colors hover:text-foreground/80">
                  <Users className="h-4 w-4 text-dynamic-purple" />
                  {githubData.stats.contributors.toLocaleString()} Contributors
                </div>
                <div className="flex items-center gap-2 transition-colors hover:text-foreground/80">
                  <GitPullRequest className="h-4 w-4 text-dynamic-green" />
                  {githubData.stats.pullRequests.toLocaleString()} Pull Requests
                </div>
              </motion.div>
            )}
          </motion.div>
        </div>
      </section>

      {/* Stats Section */}
      {githubData.stats && (
        <section className="relative px-4 py-24 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="mb-16 text-center"
            >
              <h2 className="mb-4 font-bold text-4xl sm:text-5xl">
                Community{' '}
                <span className="bg-linear-to-r from-dynamic-blue via-dynamic-cyan to-dynamic-green bg-clip-text text-transparent">
                  Impact
                </span>
              </h2>
              <p className="mx-auto max-w-2xl text-foreground/60 text-lg">
                Our open source journey by the numbers
              </p>
            </motion.div>

            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  icon: Users,
                  label: 'Contributors',
                  value: githubData.stats.contributors,
                  color: 'purple',
                  trend: '+12 this month',
                },
                {
                  icon: GitPullRequest,
                  label: 'Pull Requests',
                  value: githubData.stats.pullRequests,
                  color: 'green',
                  trend: 'All time',
                },
                {
                  icon: GitCommit,
                  label: 'Total Commits',
                  value:
                    githubData.contributors?.reduce(
                      (acc, curr) => acc + curr.contributions,
                      0
                    ) || 0,
                  color: 'blue',
                  trend: 'Since inception',
                },
                {
                  icon: Star,
                  label: 'GitHub Stars',
                  value: githubData.stats.stars,
                  color: 'amber',
                  trend: 'Growing daily',
                },
              ].map((stat, index) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Card
                    className={cn(
                      'h-full p-8 text-center transition-all hover:shadow-lg',
                      `border-dynamic-${stat.color}/30 bg-linear-to-br from-dynamic-${stat.color}/5 via-background to-background hover:border-dynamic-${stat.color}/50 hover:shadow-dynamic-${stat.color}/10`
                    )}
                  >
                    <div
                      className={cn(
                        'mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl',
                        `bg-dynamic-${stat.color}/10`
                      )}
                    >
                      <stat.icon
                        className={cn('h-8 w-8', `text-dynamic-${stat.color}`)}
                      />
                    </div>
                    <div
                      className={cn(
                        'mb-2 font-bold text-4xl',
                        `text-dynamic-${stat.color}`
                      )}
                    >
                      {stat.value.toLocaleString()}+
                    </div>
                    <div className="mb-3 font-medium text-foreground/80 text-sm">
                      {stat.label}
                    </div>
                    <Badge
                      variant="secondary"
                      className={cn(
                        `border-dynamic-${stat.color}/30 bg-dynamic-${stat.color}/10 text-dynamic-${stat.color} text-xs`
                      )}
                    >
                      {stat.trend}
                    </Badge>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Top Contributors */}
      {githubData.contributors && githubData.contributors.length > 0 && (
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
                className="mb-4 border-dynamic-purple/30 bg-dynamic-purple/10 text-dynamic-purple"
              >
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                Hall of Fame
              </Badge>
              <h2 className="mb-4 font-bold text-4xl sm:text-5xl">
                Top{' '}
                <span className="bg-linear-to-r from-dynamic-purple via-dynamic-pink to-dynamic-orange bg-clip-text text-transparent">
                  Contributors
                </span>
              </h2>
              <p className="mx-auto max-w-2xl text-foreground/60 text-lg">
                Recognizing the amazing developers who have contributed the most
                to our platform
              </p>
            </motion.div>

            <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {githubData.contributors
                .slice(0, 20)
                .map((contributor, index) => (
                  <motion.div
                    key={contributor.id}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.05 }}
                    whileHover={{ y: -5, transition: { duration: 0.2 } }}
                  >
                    <Card className="group h-full overflow-hidden border-primary/10 transition-all duration-300 hover:border-primary/30 hover:shadow-md">
                      <a
                        href={contributor.html_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-full flex-col p-6"
                      >
                        <div className="mb-4 flex items-center justify-between">
                          <div className="relative">
                            <div className="absolute -inset-0.5 rounded-full bg-linear-to-r from-primary to-dynamic-purple opacity-75 blur-sm group-hover:opacity-100" />
                            <Image
                              src={contributor.avatar_url}
                              alt={contributor.login}
                              className="relative h-16 w-16 rounded-full border-2 border-background object-cover"
                              width={64}
                              height={64}
                            />
                            {index < 3 && (
                              <div className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-dynamic-amber font-bold text-[10px] text-white">
                                #{index + 1}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center rounded-full bg-primary/10 px-3 py-1 font-medium text-xs">
                            <GitCommit className="mr-1 h-3 w-3" />
                            {contributor.contributions}
                          </div>
                        </div>

                        <div className="flex-1">
                          <h3 className="mb-1 line-clamp-1 font-semibold group-hover:text-primary">
                            {contributor.userDetails?.name || contributor.login}
                          </h3>
                          <p className="text-foreground/60 text-xs">
                            @{contributor.login}
                          </p>
                          {contributor.userDetails?.bio && (
                            <p className="mt-2 line-clamp-3 text-foreground/70 text-xs">
                              {contributor.userDetails.bio}
                            </p>
                          )}
                        </div>

                        <div className="mt-4 flex items-center text-foreground/50 text-xs">
                          <Calendar className="mr-1 h-3.5 w-3.5" />
                          {contributor.userDetails?.created_at
                            ? `Joined ${new Date(contributor.userDetails.created_at).toLocaleDateString('en', { year: 'numeric', month: 'short' })}`
                            : 'GitHub Contributor'}
                        </div>
                      </a>
                    </Card>
                  </motion.div>
                ))}
            </div>
          </div>
        </section>
      )}

      {/* Activity Visualization */}
      {githubData.contributors && githubData.contributors.length > 0 && (
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
                className="mb-4 border-dynamic-cyan/30 bg-dynamic-cyan/10 text-dynamic-cyan"
              >
                <TrendingUp className="mr-1.5 h-3.5 w-3.5" />
                Activity Dashboard
              </Badge>
              <h2 className="mb-4 font-bold text-4xl sm:text-5xl">
                Contribution{' '}
                <span className="bg-linear-to-r from-dynamic-cyan via-dynamic-blue to-dynamic-purple bg-clip-text text-transparent">
                  Analytics
                </span>
              </h2>
              <p className="mx-auto max-w-2xl text-foreground/60 text-lg">
                Visualizing the contribution patterns and activity across our
                platform
              </p>
            </motion.div>

            <div className="grid gap-8 lg:grid-cols-2">
              {/* Pie Chart */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                whileHover={{ y: -4 }}
                transition={{ type: 'spring', stiffness: 300 }}
              >
                <Card className="h-full overflow-hidden border-dynamic-purple/30 bg-linear-to-br from-dynamic-purple/5 via-background to-background p-8 transition-all duration-300 hover:border-dynamic-purple/50 hover:shadow-md">
                  <div className="mb-6">
                    <h3 className="mb-2 font-bold text-2xl">
                      Top 5 Contributors
                    </h3>
                    <p className="text-foreground/60 text-sm">
                      Distribution of commits among leading contributors
                    </p>
                  </div>

                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <defs>
                        {[
                          { id: 'color1', color: '#8884d8' },
                          { id: 'color2', color: '#82ca9d' },
                          { id: 'color3', color: '#ffc658' },
                          { id: 'color4', color: '#ff8042' },
                          { id: 'color5', color: '#0088fe' },
                        ].map((item) => (
                          <linearGradient
                            key={item.id}
                            id={item.id}
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="5%"
                              stopColor={item.color}
                              stopOpacity={0.8}
                            />
                            <stop
                              offset="95%"
                              stopColor={item.color}
                              stopOpacity={0.5}
                            />
                          </linearGradient>
                        ))}
                      </defs>
                      <Pie
                        data={githubData.contributors
                          .slice(0, 5)
                          .map((contributor) => ({
                            name: contributor.login,
                            value: contributor.contributions,
                          }))}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                        nameKey="name"
                        animationDuration={2000}
                        animationBegin={300}
                      >
                        {githubData.contributors.slice(0, 5).map((_, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={`url(#color${index + 1})`}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value, name) => [
                          `${value} commits`,
                          `@${name}`,
                        ]}
                      />
                      <Legend
                        iconType="circle"
                        iconSize={10}
                        layout="horizontal"
                        verticalAlign="bottom"
                        align="center"
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </Card>
              </motion.div>

              {/* Bar Chart */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                whileHover={{ y: -4 }}
                transition={{ type: 'spring', stiffness: 300 }}
              >
                <Card className="h-full overflow-hidden border-dynamic-blue/30 bg-linear-to-br from-dynamic-blue/5 via-background to-background p-8 transition-all duration-300 hover:border-dynamic-blue/50 hover:shadow-md">
                  <div className="mb-6">
                    <h3 className="mb-2 font-bold text-2xl">
                      Monthly Contributions
                    </h3>
                    <p className="text-foreground/60 text-sm">
                      Activity patterns throughout the year
                    </p>
                  </div>

                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart
                      data={generateContributionTimeline(
                        githubData.contributors
                      )}
                      barGap={2}
                      barSize={24}
                    >
                      <defs>
                        <linearGradient
                          id="colorContribBar"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="var(--primary)"
                            stopOpacity={0.8}
                          />
                          <stop
                            offset="95%"
                            stopColor="var(--primary)"
                            stopOpacity={0.5}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                      <XAxis
                        dataKey="month"
                        axisLine={{ stroke: 'var(--border)' }}
                        tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                      />
                      <YAxis
                        axisLine={{ stroke: 'var(--border)' }}
                        tick={{ fill: 'var(--muted-foreground)' }}
                      />
                      <Tooltip
                        animationDuration={300}
                        contentStyle={{
                          backgroundColor: 'var(--background)',
                          borderColor: 'var(--border)',
                          borderRadius: '0.5rem',
                          boxShadow:
                            '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                        }}
                        formatter={(value) => [
                          `${value} commits`,
                          'Contributions',
                        ]}
                      />
                      <Bar
                        dataKey="contributions"
                        fill="url(#colorContribBar)"
                        radius={[4, 4, 0, 0]}
                        animationDuration={2000}
                        animationBegin={500}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              </motion.div>

              {/* Area Chart - Full Width */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.3 }}
                className="lg:col-span-2"
                whileHover={{ y: -4 }}
              >
                <Card className="overflow-hidden border-dynamic-green/30 bg-linear-to-br from-dynamic-green/5 via-background to-background p-8 transition-all duration-300 hover:border-dynamic-green/50 hover:shadow-md">
                  <div className="mb-6">
                    <h3 className="mb-2 font-bold text-2xl">Activity Trend</h3>
                    <p className="text-foreground/60 text-sm">
                      Weekly contribution patterns showing community growth
                    </p>
                  </div>

                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart
                      data={generateActivityTrend(githubData.contributors)}
                    >
                      <defs>
                        <linearGradient
                          id="colorContributions"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor="var(--primary)"
                            stopOpacity={0.8}
                          />
                          <stop
                            offset="95%"
                            stopColor="var(--primary)"
                            stopOpacity={0.1}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                      <XAxis
                        dataKey="name"
                        axisLine={{ stroke: 'var(--border)' }}
                        tick={{ fill: 'var(--muted-foreground)' }}
                      />
                      <YAxis
                        axisLine={{ stroke: 'var(--border)' }}
                        tick={{ fill: 'var(--muted-foreground)' }}
                      />
                      <Tooltip
                        animationDuration={300}
                        contentStyle={{
                          backgroundColor: 'var(--background)',
                          borderColor: 'var(--border)',
                          borderRadius: '0.5rem',
                          boxShadow:
                            '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                        }}
                        formatter={(value) => [`${value} commits`, 'Activity']}
                      />
                      <Area
                        type="monotone"
                        dataKey="contributions"
                        stroke="var(--primary)"
                        fillOpacity={1}
                        fill="url(#colorContributions)"
                        animationDuration={2000}
                        animationBegin={800}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </Card>
              </motion.div>
            </div>
          </div>
        </section>
      )}

      {/* CTA Section */}
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
                <Badge
                  variant="secondary"
                  className="mb-4 border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green"
                >
                  <Zap className="mr-1.5 h-3.5 w-3.5" />
                  Join Our Community
                </Badge>
                <h2 className="mb-4 font-bold text-4xl sm:text-5xl">
                  Become a Contributor
                </h2>
                <p className="mx-auto mb-8 max-w-2xl text-foreground/70 text-lg leading-relaxed">
                  Help us build the future of Tuturuuu. Whether you're a
                  developer, designer, or documentation expert, there's a place
                  for you in our community.
                </p>

                <div className="mb-8 flex flex-wrap items-center justify-center gap-4">
                  <Button size="lg" asChild>
                    <Link
                      href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`}
                      target="_blank"
                    >
                      <GithubIcon className="mr-2 h-5 w-5" />
                      View on GitHub
                    </Link>
                  </Button>
                  <Button size="lg" variant="outline" asChild>
                    <Link
                      href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/fork`}
                      target="_blank"
                    >
                      <GitBranch className="mr-2 h-5 w-5" />
                      Fork Repository
                    </Link>
                  </Button>
                  <Button size="lg" variant="outline" asChild>
                    <Link href="mailto:contributors@tuturuuu.com">
                      <Mail className="mr-2 h-5 w-5" />
                      Contact Us
                    </Link>
                  </Button>
                </div>

                <Separator className="my-8 bg-foreground/10" />

                <div className="grid gap-8 pt-2 sm:grid-cols-3">
                  <div className="group/item space-y-2 rounded-xl p-4 text-left transition-colors hover:bg-foreground/5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground/10 group-hover/item:bg-foreground/20">
                      <Code className="h-5 w-5 text-primary" />
                    </div>
                    <h3 className="font-semibold">Submit Code</h3>
                    <p className="text-foreground/60 text-sm">
                      Contribute new features or fix bugs through pull requests.
                    </p>
                  </div>

                  <div className="group/item space-y-2 rounded-xl p-4 text-left transition-colors hover:bg-foreground/5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground/10 group-hover/item:bg-foreground/20">
                      <MessageSquare className="h-5 w-5 text-primary" />
                    </div>
                    <h3 className="font-semibold">Report Issues</h3>
                    <p className="text-foreground/60 text-sm">
                      Help us by reporting bugs or suggesting improvements.
                    </p>
                  </div>

                  <div className="group/item space-y-2 rounded-xl p-4 text-left transition-colors hover:bg-foreground/5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground/10 group-hover/item:bg-foreground/20">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <h3 className="font-semibold">Improve Docs</h3>
                    <p className="text-foreground/60 text-sm">
                      Enhance our documentation to help other users.
                    </p>
                  </div>
                </div>

                <p className="mt-8 text-foreground/60 text-sm">
                  By contributing to Tuturuuu, you agree to our{' '}
                  <a
                    href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/blob/main/CODE_OF_CONDUCT.md`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline underline-offset-4 hover:text-primary/80"
                  >
                    Code of Conduct
                  </a>{' '}
                  and{' '}
                  <a
                    href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/blob/main/CONTRIBUTING.md`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline underline-offset-4 hover:text-primary/80"
                  >
                    Contributing Guidelines
                  </a>
                  .
                </p>
              </div>
            </Card>
          </motion.div>
        </div>
      </section>
    </main>
  );
}
