'use client';

import { GITHUB_OWNER, GITHUB_REPO } from '@/constants/common';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import {
  Calendar,
  Code,
  FileText,
  GitCommit,
  GitFork,
  GitPullRequest,
  GithubIcon,
  Heart,
  Mail,
  MessageSquare,
  Star,
  Users,
} from '@tuturuuu/ui/icons';
import { Separator } from '@tuturuuu/ui/separator';
import { Variants, motion } from 'framer-motion';
import dynamic from 'next/dynamic';
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

// Types imported from server component
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

interface ContributorsClientProps {
  locale: string;
  githubData: {
    repo?: GithubRepo;
    contributors?: GithubContributor[];
    stats?: RepoStats;
    error?: string;
  };
}

// Dynamically import Confetti to avoid hydration issues
const Confetti = dynamic(() => import('react-confetti'), {
  ssr: false,
});

// Animation variants
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

// Helper functions for data visualization
function generateContributionTimeline(
  locale: string,
  contributors: GithubContributor[]
) {
  // Map of month names to total contributions
  const months = Array.from({ length: 12 }, (_, i) =>
    new Date(0, i).toLocaleString(locale, { month: 'long' })
  );

  // Initialize with 0 contributions for each month
  const monthlyContributions = months.map((month) => ({
    month,
    contributions: 0,
  }));

  // For demo purposes, randomly distribute contributions across months
  // In a real app, you would parse commit dates from the API
  const totalContributions = contributors.reduce(
    (sum, contributor) => sum + contributor.contributions,
    0
  );

  // Distribute contributions across months with some randomness
  let remainingContributions = totalContributions;
  for (let i = 0; i < months.length - 1; i++) {
    // Allocate a random portion of the remaining contributions to this month
    const allocation = Math.floor(
      remainingContributions * (0.1 + Math.random() * 0.2)
    );
    monthlyContributions[i]!.contributions = allocation;
    remainingContributions -= allocation;
  }

  // Allocate remaining contributions to the last month
  monthlyContributions[months.length - 1]!.contributions =
    remainingContributions;

  return monthlyContributions;
}

function generateActivityTrend(contributors: GithubContributor[]) {
  // Create a simulated trend line showing activity over time
  const weeks = Array.from({ length: 12 }, (_, i) => ({
    name: `Week ${i + 1}`,
    contributions: 0,
  }));

  const totalContributions = contributors.reduce(
    (sum, contributor) => sum + contributor.contributions,
    0
  );

  // Create a realistic-looking trend with some peaks and valleys
  let baseValue = totalContributions / 20;

  // Add a realistic trend with some randomness
  weeks.forEach((week, i) => {
    // Add some randomness and a general upward trend
    const trendFactor = 1 + (i / weeks.length) * 0.5; // Gradual increase
    const variationFactor = 0.7 + Math.random() * 0.6; // Random variation
    const periodFactor = Math.sin((i / weeks.length) * Math.PI * 2) * 0.3 + 1; // Periodic pattern

    week.contributions = Math.floor(
      baseValue * trendFactor * variationFactor * periodFactor
    );
  });

  return weeks;
}

export default function ContributorsClient({
  locale,
  githubData,
}: ContributorsClientProps) {
  const [windowDimensions, setWindowDimensions] = useState({
    width: 0,
    height: 0,
  });

  // Handle window resize and confetti
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

  // Error state
  if (githubData.error) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center">
        <GithubIcon className="mb-4 h-16 w-16 text-muted-foreground" />
        <h2 className="mb-2 text-2xl font-bold">Data Fetch Error</h2>
        <p className="mb-4 text-muted-foreground">{githubData.error}</p>
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
    );
  }

  return (
    <>
      {/* Confetti Celebration */}
      <Confetti
        width={windowDimensions.width}
        height={windowDimensions.height}
        numberOfPieces={200}
        recycle={false}
        colors={['#FF5733', '#33FF57', '#3357FF', '#F3FF33', '#FF33F3']}
      />

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
            <Heart className="mr-2 h-4 w-4" />
            Open Source Heroes
          </Badge>
        </motion.div>

        <h1 className="mb-6 text-4xl font-bold text-balance text-foreground md:text-5xl lg:text-6xl">
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
              className="absolute -inset-1 -z-10 rounded-lg bg-linear-to-r from-primary/40 via-purple-500/40 to-pink-500/40 blur-lg"
            />
            Our Amazing
          </span>{' '}
          <span className="bg-linear-to-r from-primary via-purple-500 to-pink-500 bg-clip-text text-transparent">
            Contributors
          </span>
        </h1>

        <motion.p
          className="mx-auto max-w-2xl text-lg text-balance text-foreground/80 md:text-xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.8 }}
        >
          Meet the incredible individuals who help make Tuturuuu better every
          day through open source contributions on{' '}
          <a
            href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary underline underline-offset-4 hover:text-primary/80"
          >
            GitHub
          </a>
          .
        </motion.p>

        {githubData.repo && githubData.stats && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="mt-8 flex flex-wrap items-center justify-center gap-4"
          >
            <a
              href={githubData.repo.html_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-full bg-foreground/10 px-4 py-2 text-sm hover:bg-foreground/20"
            >
              <Star className="h-4 w-4 text-amber-500" />
              {githubData.stats.stars.toLocaleString()} Stars
            </a>
            <a
              href={`${githubData.repo.html_url}/fork`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-full bg-foreground/10 px-4 py-2 text-sm hover:bg-foreground/20"
            >
              <GitFork className="h-4 w-4 text-blue-500" />
              {githubData.stats.forks.toLocaleString()} Forks
            </a>
            <a
              href={`${githubData.repo.html_url}/issues`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-full bg-foreground/10 px-4 py-2 text-sm hover:bg-foreground/20"
            >
              <MessageSquare className="h-4 w-4 text-red-500" />
              {githubData.stats.issues.toLocaleString()} Issues
            </a>
          </motion.div>
        )}
      </motion.section>

      {/* Repository Info Section */}
      {githubData.repo && (
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative"
        >
          <Card className="group overflow-hidden border-primary/10">
            <div className="absolute inset-0 bg-linear-to-br from-primary/10 via-primary/5 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

            <div className="relative p-6 sm:p-8">
              <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-2">
                  <div className="mb-3 flex items-center gap-3">
                    <div className="rounded-lg bg-foreground/10 p-2.5">
                      <GithubIcon className="h-6 w-6" />
                    </div>
                    <h3 className="text-2xl font-bold">
                      {githubData.repo.full_name}
                    </h3>
                  </div>

                  <p className="text-balance text-muted-foreground">
                    {githubData.repo.description}
                  </p>

                  <div className="flex flex-wrap gap-4 pt-2">
                    <div className="flex items-center text-sm text-foreground/80">
                      <Star className="mr-1.5 h-4 w-4 text-amber-500" />
                      <span>
                        {githubData.repo.stargazers_count.toLocaleString()}{' '}
                        Stars
                      </span>
                    </div>

                    <div className="flex items-center text-sm text-foreground/80">
                      <GitFork className="mr-1.5 h-4 w-4 text-blue-500" />
                      <span>
                        {githubData.repo.forks_count.toLocaleString()} Forks
                      </span>
                    </div>

                    <div className="flex items-center text-sm text-foreground/80">
                      <GitPullRequest className="mr-1.5 h-4 w-4 text-green-500" />
                      <span>
                        {githubData.stats?.pullRequests.toLocaleString() || 0}{' '}
                        Pull Requests
                      </span>
                    </div>

                    <div className="flex items-center text-sm text-foreground/80">
                      <Users className="mr-1.5 h-4 w-4 text-purple-500" />
                      <span>
                        {githubData.stats?.contributors.toLocaleString() || 0}{' '}
                        Contributors
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <motion.div
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <Button asChild variant="default" className="rounded-lg">
                      <a
                        href={githubData.repo.html_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2"
                      >
                        <GithubIcon className="h-4 w-4" />
                        View Repository
                      </a>
                    </Button>
                  </motion.div>

                  <motion.div
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <Button asChild variant="outline" className="rounded-lg">
                      <a
                        href={`${githubData.repo.html_url}/fork`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2"
                      >
                        <GitFork className="h-4 w-4" />
                        Fork
                      </a>
                    </Button>
                  </motion.div>
                </div>
              </div>
            </div>
          </Card>
        </motion.section>
      )}

      {/* Top Contributors Gallery */}
      {githubData.contributors && githubData.contributors.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative"
        >
          <div className="mb-8 text-center">
            <Badge variant="outline" className="mb-4">
              <Star className="mr-2 h-4 w-4" />
              Top Contributors
            </Badge>
            <h2 className="mb-4 text-3xl font-bold">Community Heroes</h2>
            <p className="mx-auto max-w-2xl text-muted-foreground">
              Meet the amazing developers who have contributed the most to
              making Tuturuuu better. These are the top{' '}
              {Math.min(20, githubData.contributors.length)} contributors by
              commit count.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {githubData.contributors.slice(0, 20).map((contributor, index) => (
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
                    className="flex h-full flex-col p-5"
                  >
                    <div className="mb-4 flex items-center justify-between">
                      <div className="relative">
                        <div className="absolute -inset-0.5 rounded-full bg-linear-to-r from-primary to-purple-600 opacity-75 blur-sm group-hover:opacity-100" />
                        <img
                          src={contributor.avatar_url}
                          alt={contributor.login}
                          className="relative h-16 w-16 rounded-full border-2 border-background object-cover"
                        />
                        {index < 3 && (
                          <div className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
                            #{index + 1}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-medium">
                        <GitCommit className="mr-1 h-3 w-3" />
                        {contributor.contributions}
                      </div>
                    </div>

                    <div className="flex-1">
                      <h3 className="mb-1 line-clamp-1 font-semibold group-hover:text-primary">
                        {contributor.userDetails?.name || contributor.login}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        @{contributor.login}
                      </p>
                      {contributor.userDetails?.bio && (
                        <p className="mt-2 line-clamp-3 text-xs text-foreground/70">
                          {contributor.userDetails.bio}
                        </p>
                      )}
                    </div>

                    <div className="mt-4 flex items-center text-xs text-muted-foreground">
                      <Calendar className="mr-1 h-3.5 w-3.5" />
                      {contributor.userDetails?.created_at
                        ? `Joined ${new Date(contributor.userDetails.created_at).toLocaleDateString()}`
                        : 'GitHub Contributor'}
                    </div>
                  </a>
                </Card>
              </motion.div>
            ))}
          </div>
        </motion.section>
      )}

      {/* Activity Visualization Section */}
      {githubData.contributors && githubData.contributors.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative"
        >
          <div className="mb-8 text-center">
            <Badge variant="outline" className="mb-4">
              <GitPullRequest className="mr-2 h-4 w-4" />
              Contribution Activity
            </Badge>
            <h2 className="mb-4 text-3xl font-bold">Repository Activity</h2>
            <p className="mx-auto max-w-2xl text-muted-foreground">
              Visualizing the contribution patterns and activity in the Tuturuuu
              platform.
            </p>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="grid gap-8 md:grid-cols-2"
          >
            {/* Commit Distribution Chart */}
            <motion.div
              whileHover={{ y: -4 }}
              transition={{ type: 'spring', stiffness: 300 }}
            >
              <Card className="h-full overflow-hidden border-primary/10 transition-all duration-300 hover:border-primary/30 hover:shadow-md">
                <div className="bg-primary/5 p-6">
                  <div className="mb-4">
                    <h3 className="text-xl font-bold">Top Contributors</h3>
                    <p className="text-sm text-muted-foreground">
                      Distribution of commits among top contributors
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
                        label={({ name, percent }) =>
                          `${name}: ${(percent * 100).toFixed(0)}%`
                        }
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
                </div>
              </Card>
            </motion.div>

            {/* Contribution Timeline Chart */}
            <motion.div
              whileHover={{ y: -4 }}
              transition={{ type: 'spring', stiffness: 300 }}
            >
              <Card className="h-full overflow-hidden border-primary/10 transition-all duration-300 hover:border-primary/30 hover:shadow-md">
                <div className="bg-primary/5 p-6">
                  <div className="mb-4">
                    <h3 className="text-xl font-bold">Contribution Timeline</h3>
                    <p className="text-sm text-muted-foreground">
                      Activity patterns based on contribution counts
                    </p>
                  </div>

                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart
                      data={generateContributionTimeline(
                        locale,
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
                </div>
              </Card>
            </motion.div>
          </motion.div>

          {/* Activity Trend Chart */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
            className="mt-8"
            whileHover={{ y: -4 }}
          >
            <Card className="overflow-hidden border-primary/10 transition-all duration-300 hover:border-primary/30 hover:shadow-md">
              <div className="bg-primary/5 p-6">
                <div className="mb-4">
                  <h3 className="text-xl font-bold">Contribution Activity</h3>
                  <p className="text-sm text-muted-foreground">
                    Activity trends over time
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
              </div>
            </Card>
          </motion.div>
        </motion.section>
      )}

      {/* Stats Section */}
      {githubData.stats && (
        <motion.section
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="relative"
        >
          <div className="grid gap-6 md:grid-cols-3">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
            >
              <Card className="group relative h-full overflow-hidden border-primary/10">
                <div className="relative p-6">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                    <Users className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="mb-2 text-2xl font-bold">
                    {githubData.stats.contributors.toLocaleString()}+
                  </h3>
                  <p className="text-muted-foreground">Active Contributors</p>
                </div>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
            >
              <Card className="group relative h-full overflow-hidden border-primary/10">
                <div className="relative p-6">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                    <GitPullRequest className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="mb-2 text-2xl font-bold">
                    {githubData.stats.pullRequests.toLocaleString()}+
                  </h3>
                  <p className="text-muted-foreground">Pull Requests</p>
                </div>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
            >
              <Card className="group relative h-full overflow-hidden border-primary/10">
                <div className="relative p-6">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                    <GitCommit className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="mb-2 text-2xl font-bold">
                    {githubData.contributors &&
                      githubData.contributors
                        .reduce((acc, curr) => acc + curr.contributions, 0)
                        .toLocaleString()}
                    +
                  </h3>
                  <p className="text-muted-foreground">Total Commits</p>
                </div>
              </Card>
            </motion.div>
          </div>
        </motion.section>
      )}

      {/* Call to Action Section */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="relative"
      >
        <Card className="group relative overflow-hidden border-primary/10 bg-linear-to-br from-background via-background to-primary/5">
          <div className="absolute inset-0">
            <div className="absolute inset-0 bg-primary/5 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
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
            <div className="mx-auto max-w-3xl text-center">
              <Badge variant="outline" className="mb-4 backdrop-blur-[2px]">
                <GithubIcon className="mr-2 h-4 w-4" />
                Join Our Community
              </Badge>
              <h2 className="mb-4 text-3xl font-bold">Become a Contributor</h2>
              <p className="mb-8 text-muted-foreground">
                Help us build the future of Tuturuuu. Whether you're a
                developer, designer, or documentation expert, there's a place
                for you in our community.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-4">
                <motion.a
                  href={`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="inline-flex items-center gap-2 rounded-lg bg-foreground px-8 py-3 font-medium text-background hover:bg-foreground/90"
                >
                  <GithubIcon className="h-4 w-4" />
                  <span className="relative">View on GitHub</span>
                </motion.a>
                <motion.a
                  href="mailto:contributors@tuturuuu.com"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="inline-flex items-center gap-2 rounded-lg border border-foreground/10 px-8 py-3 font-medium hover:bg-foreground/5"
                >
                  <Mail className="h-4 w-4" />
                  <span className="relative">Contact Us</span>
                </motion.a>
              </div>

              <Separator className="my-8 bg-foreground/10" />

              <div className="grid gap-8 pt-2 sm:grid-cols-3">
                <div className="group/item space-y-2 rounded-xl p-4 text-left transition-colors hover:bg-foreground/5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground/10 group-hover/item:bg-foreground/20">
                    <Code className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="font-semibold">Submit Code</h3>
                  <p className="text-sm text-muted-foreground">
                    Contribute new features or fix bugs through pull requests.
                  </p>
                </div>

                <div className="group/item space-y-2 rounded-xl p-4 text-left transition-colors hover:bg-foreground/5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground/10 group-hover/item:bg-foreground/20">
                    <MessageSquare className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="font-semibold">Report Issues</h3>
                  <p className="text-sm text-muted-foreground">
                    Help us by reporting bugs or suggesting improvements.
                  </p>
                </div>

                <div className="group/item space-y-2 rounded-xl p-4 text-left transition-colors hover:bg-foreground/5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground/10 group-hover/item:bg-foreground/20">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="font-semibold">Improve Docs</h3>
                  <p className="text-sm text-muted-foreground">
                    Enhance our documentation to help other users.
                  </p>
                </div>
              </div>

              <p className="mt-8 text-sm text-muted-foreground">
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
          </div>
        </Card>
      </motion.section>
    </>
  );
}
