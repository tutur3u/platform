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
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

const MotionCard = motion(Card);

export function ApologyModal() {
  const t = useTranslations('nova-apology-modal');
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
                {t('title')}
              </DialogTitle>
            </motion.div>
            <motion.div
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <DialogDescription className="mt-2 text-center text-base sm:text-left">
                {t('description')}
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
                  <AlertTriangle className="mr-2 h-4 w-4" /> {t('known_issues')}
                </TabsTrigger>
                <TabsTrigger
                  value="updates"
                  className="transition-all duration-200 data-[state=active]:bg-dynamic-green/10"
                >
                  <CheckCircle className="mr-2 h-4 w-4" />{' '}
                  {t('resolution_status')}
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
                    <p className="text-base">{t('apology_message')}</p>

                    <div className="mt-2 space-y-4">
                      <MotionCard
                        custom={0}
                        variants={cardVariants}
                        initial="hidden"
                        animate="visible"
                        className="border-dynamic-green/30 bg-dynamic-green/10"
                      >
                        <CardContent className="space-y-3 p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-2">
                              <CheckCircle className="h-5 w-5 shrink-0 text-dynamic-green" />
                              <h3 className="font-semibold text-dynamic-green">
                                {t('ai_scoring_system')}
                              </h3>
                            </div>
                            <Badge
                              variant="outline"
                              className="border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green"
                            >
                              {t('fixed')}
                            </Badge>
                          </div>
                          <p>{t('ai_scoring_description')}</p>
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Bug className="h-4 w-4" />
                            <span>
                              {t('issue_tracked')}{' '}
                              <a
                                href="https://github.com/tutur3u/platform/issues/2429"
                                className="inline-flex items-center gap-1 transition-colors hover:text-primary"
                                target="_blank"
                              >
                                <span className="font-semibold line-through decoration-1">
                                  {t('issue')} #2429
                                </span>
                                <Badge
                                  variant="outline"
                                  className="ml-1 h-5 border-dynamic-green/30 bg-dynamic-green/10 px-1.5 py-0 text-xs font-normal text-green-600 dark:text-dynamic-green"
                                >
                                  <CheckCircle className="mr-1 h-3 w-3" />
                                  {t('fixed')}
                                </Badge>
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
                        className="border-dynamic-green/30 bg-dynamic-green/10"
                      >
                        <CardContent className="space-y-3 p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center gap-2">
                              <div className="relative">
                                <Trophy className="h-5 w-5 shrink-0 text-dynamic-green" />
                              </div>
                              <h3 className="font-semibold text-dynamic-green">
                                {t('leaderboard_scores')}
                              </h3>
                            </div>
                            <Badge
                              variant="outline"
                              className="border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green"
                            >
                              {t('fixed')}
                            </Badge>
                          </div>
                          <p>{t('leaderboard_description')}</p>
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <CheckCircle className="h-4 w-4 text-dynamic-green" />
                            <span>
                              {t('issue_tracked')}{' '}
                              <a
                                href="https://github.com/tutur3u/platform/issues/2416"
                                className="inline-flex items-center gap-1 transition-colors hover:text-primary"
                                target="_blank"
                              >
                                <span className="font-semibold line-through decoration-1">
                                  {t('issue')} #2416
                                </span>
                                <Badge
                                  variant="outline"
                                  className="ml-1 h-5 border-dynamic-green/30 bg-dynamic-green/10 px-1.5 py-0 text-xs font-normal text-green-600 dark:text-dynamic-green"
                                >
                                  <CheckCircle className="mr-1 h-3 w-3" />
                                  {t('fixed')}
                                </Badge>
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
                    <p className="text-base">{t('resolution_message')}</p>

                    <div className="space-y-4">
                      <motion.div
                        className="flex flex-col gap-3"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.5, delay: 0.2 }}
                      >
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-5 w-5 text-dynamic-green" />
                          <span className="font-medium">
                            {t('bugs_identified')}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-5 w-5 text-dynamic-green" />
                          <span className="font-medium">{t('ai_fix')}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-5 w-5 text-dynamic-green" />
                          <span className="font-medium">
                            {t('testcase_fix')}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-5 w-5 text-dynamic-green" />
                          <span className="font-medium">
                            {t('leaderboard_fix')}
                          </span>
                        </div>
                      </motion.div>

                      <Separator className="my-3" />

                      <div className="rounded-lg border bg-blue-50/30 p-4 dark:bg-blue-950/10">
                        <h3 className="mb-2 flex items-center gap-2 font-semibold">
                          <span className="inline-block h-2 w-2 rounded-full bg-blue-500"></span>
                          {t('our_commitment')}
                        </h3>
                        <p className="text-sm">{t('commitment_description')}</p>
                      </div>

                      <motion.div
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ duration: 0.5, delay: 0.4 }}
                      >
                        <p className="mb-2 font-medium">{t('next_steps')}</p>
                        <ul className="ml-5 list-disc space-y-1">
                          <li>{t('step_1')}</li>
                          <li>{t('step_2')}</li>
                          <li>{t('step_3')}</li>
                          <li className="font-medium text-dynamic-blue">
                            {t('step_4')}
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
                <span>{t('updates_info')} </span>
                <a
                  href="https://github.com/tutur3u/platform/issues"
                  target="_blank"
                  className="inline-flex items-center gap-1 text-primary transition-colors hover:underline"
                  onClick={handleOpenIssue}
                >
                  {t('github_issues')} <ExternalLink className="h-3 w-3" />
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
                    {t('report_issue')}
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
                    {t('understand')}
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
