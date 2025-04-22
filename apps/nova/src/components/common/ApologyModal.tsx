'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import {
  AlertTriangle,
  Bug,
  CheckCircle,
  ExternalLink,
  Trophy,
} from '@tuturuuu/ui/icons';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { Separator } from '@tuturuuu/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const MotionCard = motion(Card);

export function ApologyModal() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('issues');

  useEffect(() => {
    // Check if we've shown the modal already
    // const hasShownModal = localStorage.getItem('nova_apology_modal_shown');
    const hasShownModal = false;

    if (!hasShownModal) {
      setOpen(true);
      // Set the flag so we don't show it again
      localStorage.setItem('nova_apology_modal_shown', 'true');
    }
  }, []);

  const handleCloseModal = () => {
    setOpen(false);
  };

  const handleOpenIssue = (e: React.MouseEvent) => {
    e.preventDefault();
    window.open('https://github.com/tutur3u/platform/issues', '_blank');
  };

  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      transition: {
        delay: i * 0.1,
        duration: 0.5,
        ease: 'easeOut',
      },
    }),
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md overflow-hidden p-0 md:max-w-2xl lg:max-w-4xl">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <DialogHeader className="border-b px-6 pt-6 pb-4">
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <DialogTitle className="flex items-center gap-2 text-center text-xl font-bold sm:text-left">
                <AlertTriangle className="h-6 w-6 text-dynamic-red" />
                Important Notice to NEO League Competition Participants
              </DialogTitle>
            </motion.div>
            <motion.div
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <DialogDescription className="mt-2 text-center text-base sm:text-left">
                The Nova development team wishes to address recent technical
                issues affecting the competition.
              </DialogDescription>
            </motion.div>
          </DialogHeader>

          <Tabs
            defaultValue={activeTab}
            onValueChange={setActiveTab}
            className="w-full"
          >
            <div className="sticky top-0 z-10 border-b bg-background px-6 pt-4">
              <TabsList className="mb-4 grid w-full grid-cols-2">
                <TabsTrigger
                  value="issues"
                  className="transition-all duration-200 data-[state=active]:bg-red-500/10"
                >
                  <AlertTriangle className="mr-2 h-4 w-4" /> Known Issues
                </TabsTrigger>
                <TabsTrigger
                  value="updates"
                  className="transition-all duration-200 data-[state=active]:bg-green-500/10"
                >
                  <CheckCircle className="mr-2 h-4 w-4" /> Resolution Status
                </TabsTrigger>
              </TabsList>
            </div>

            <ScrollArea className="h-[380px]">
              <div className="px-6 py-4">
                <TabsContent
                  value="issues"
                  className="mt-0 min-h-[300px] space-y-6 pt-1"
                >
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3 }}
                    className="flex flex-col space-y-5"
                  >
                    <p className="text-base">
                      We sincerely apologize to all Nova platform users and
                      contestants in the NEO League competition. Our team is
                      working diligently to resolve the following identified
                      issues:
                    </p>

                    <div className="mt-2 space-y-4">
                      <MotionCard
                        custom={0}
                        variants={cardVariants}
                        initial="hidden"
                        animate="visible"
                        className="overflow-hidden border-dynamic-red/30"
                      >
                        <CardContent className="space-y-3 p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-2">
                              <AlertTriangle className="h-5 w-5 shrink-0 text-dynamic-red" />
                              <h3 className="font-semibold text-dynamic-red">
                                AI-Powered Scoring System
                              </h3>
                            </div>
                            <Badge
                              variant="outline"
                              className="border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red"
                            >
                              Critical
                            </Badge>
                          </div>
                          <p>
                            The scoring system is currently misconfigured and
                            will result in giving most users a score of 0. We
                            have identified the root cause and are implementing
                            a fix.
                          </p>
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Bug className="h-4 w-4" />
                            <span>
                              Issue tracked in{' '}
                              <a
                                href="https://github.com/tutur3u/platform/issues/2429"
                                className="underline transition-colors hover:text-primary"
                                target="_blank"
                              >
                                Issue #2429
                              </a>
                            </span>
                          </div>
                        </CardContent>
                      </MotionCard>

                      <MotionCard
                        custom={2}
                        variants={cardVariants}
                        initial="hidden"
                        animate="visible"
                        className="border-dynamic-red/30"
                      >
                        <CardContent className="space-y-3 p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-2">
                              <Trophy className="h-5 w-5 shrink-0 text-dynamic-red" />
                              <h3 className="font-semibold text-dynamic-red">
                                Leaderboard Score Calculations
                              </h3>
                            </div>
                            <Badge
                              variant="outline"
                              className="border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red"
                            >
                              Critical
                            </Badge>
                          </div>
                          <p>
                            The leaderboard scores are not calculating
                            correctly, affecting the competitive ranking
                            display. Our team has identified the issue and is
                            implementing a comprehensive fix.
                          </p>
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Bug className="h-4 w-4" />
                            <span>
                              Issue tracked in{' '}
                              <a
                                href="https://github.com/tutur3u/platform/issues/2416"
                                className="underline transition-colors hover:text-primary"
                                target="_blank"
                              >
                                Issue #2416
                              </a>
                            </span>
                          </div>
                        </CardContent>
                      </MotionCard>

                      <MotionCard
                        custom={1}
                        variants={cardVariants}
                        initial="hidden"
                        animate="visible"
                      >
                        <CardContent className="space-y-3 p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-2">
                              <AlertTriangle className="h-5 w-5 shrink-0 text-dynamic-yellow" />
                              <h3 className="font-semibold">
                                Testcase & Criteria Handling
                              </h3>
                            </div>
                            <Badge
                              variant="outline"
                              className="border-border bg-background"
                            >
                              High
                            </Badge>
                          </div>
                          <p>
                            Non-admin users are currently unable to save
                            testcases and criteria evaluations. This affects
                            challenge submission validation and scoring.
                          </p>
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Bug className="h-4 w-4" />
                            <span>
                              Issues tracked in{' '}
                              <a
                                href="https://github.com/tutur3u/platform/issues/2428"
                                className="underline transition-colors hover:text-primary"
                                target="_blank"
                              >
                                Issue #2428
                              </a>{' '}
                              and{' '}
                              <a
                                href="https://github.com/tutur3u/platform/issues/2429"
                                className="underline transition-colors hover:text-primary"
                                target="_blank"
                              >
                                Issue #2429
                              </a>
                            </span>
                          </div>
                        </CardContent>
                      </MotionCard>
                    </div>
                  </motion.div>
                </TabsContent>

                <TabsContent
                  value="updates"
                  className="mt-0 min-h-[300px] space-y-5 pt-1"
                >
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3 }}
                    className="flex flex-col space-y-5"
                  >
                    <p className="text-base">
                      The Nova development team is working around the clock to
                      resolve these issues before the official start of round 1.
                      We're committed to providing you with the best competition
                      experience possible.
                    </p>

                    <div className="space-y-4">
                      <motion.div
                        className="flex flex-col gap-3"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.5, delay: 0.2 }}
                      >
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-5 w-5 text-green-500" />
                          <span className="font-medium">
                            All critical bugs have been identified and
                            prioritized
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-5 w-5 text-green-500" />
                          <span className="font-medium">
                            Fix for AI scoring system in active development
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-5 w-5 text-green-500" />
                          <span className="font-medium">
                            Fix for testcase handling in review phase
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-5 w-5 text-green-500" />
                          <span className="font-medium">
                            Leaderboard score calculation fix in progress (ETA:
                            before round 1)
                          </span>
                        </div>
                      </motion.div>

                      <Separator className="my-3" />

                      <div className="rounded-lg border bg-blue-50/30 p-4 dark:bg-blue-950/10">
                        <h3 className="mb-2 flex items-center gap-2 font-semibold">
                          <span className="inline-block h-2 w-2 rounded-full bg-blue-500"></span>
                          Our Commitment
                        </h3>
                        <p className="text-sm">
                          The Nova development team is fully committed to
                          resolving these issues before the competition begins.
                          We appreciate your patience and understanding as we
                          work to deliver the best possible platform for your
                          competitive experience.
                        </p>
                      </div>

                      <motion.div
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ duration: 0.5, delay: 0.4 }}
                      >
                        <p className="mb-2 font-medium">Next Steps:</p>
                        <ul className="ml-5 list-disc space-y-1">
                          <li>Deploy emergency hotfix for scoring system</li>
                          <li>Fix testcase handling for all users</li>
                          <li>Address leaderboard score calculation issues</li>
                          <li className="font-medium text-dynamic-blue">
                            Ensure all systems are ready before round 1 begins
                          </li>
                        </ul>
                      </motion.div>
                    </div>
                  </motion.div>
                </TabsContent>
              </div>
            </ScrollArea>

            <div className="flex flex-col items-center justify-between gap-4 border-t bg-muted/10 px-6 py-4 sm:flex-row">
              <motion.div
                className="flex items-center gap-1 text-sm text-muted-foreground"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
              >
                <span>For updates and latest information, visit </span>
                <a
                  href="https://github.com/tutur3u/platform/issues"
                  target="_blank"
                  className="inline-flex items-center gap-1 text-primary transition-colors hover:underline"
                  onClick={handleOpenIssue}
                >
                  GitHub Issues <ExternalLink className="h-3 w-3" />
                </a>
              </motion.div>
              <div className="flex gap-3">
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.7 }}
                >
                  <Button
                    variant="outline"
                    onClick={handleOpenIssue}
                    className="transition-all hover:bg-muted"
                  >
                    Report Issue
                  </Button>
                </motion.div>
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.8 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Button
                    onClick={handleCloseModal}
                    className="transition-all duration-200"
                  >
                    I Understand
                  </Button>
                </motion.div>
              </div>
            </div>
          </Tabs>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
