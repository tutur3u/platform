'use client';

import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import {
  BookText,
  CheckCircle,
  Clock,
  HelpCircle,
  Loader2,
  Send,
  Sparkles,
  Trophy,
  XCircle,
} from '@tuturuuu/ui/icons';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

interface RequestFeatureAccessDialogProps {
  workspaceName: string | null;
  wsId: string;
  children: React.ReactNode;
  enabledFeatures?: {
    ENABLE_AI: boolean;
    ENABLE_EDUCATION: boolean;
    ENABLE_QUIZZES: boolean;
    ENABLE_CHALLENGES: boolean;
  };
}

interface FeatureAccessRequest {
  id: string;
  feature: string;
  status: 'pending' | 'approved' | 'rejected';
  message: string;
  admin_notes?: string;
  created_at: string;
}

const featureConfig = {
  education: {
    name: 'Education',
    icon: BookText,
    details: [
      'Course creation and management with multimedia content',
      'Interactive quiz and assessment tools with detailed analytics',
      'Student progress tracking and performance insights',
      'Automated certificate generation upon course completion',
      'AI-powered teaching studio and content assistance',
    ],
  },
  ai: {
    name: 'AI',
    icon: Sparkles,
    details: [
      'Advanced AI models for text and image generation',
      'AI-powered data analysis and insights',
      'Automated content summarization and tagging',
      'Personalized recommendations powered by AI',
    ],
  },
  challenges: {
    name: 'Challenges',
    icon: Trophy,
    details: [
      'Create and manage coding or skill-based challenges',
      'Leaderboards and points system',
      'Team-based and individual competitions',
      'Automated judging and scoring',
    ],
  },
  quizzes: {
    name: 'Quizzes',
    icon: HelpCircle,
    details: [
      'Multiple question types (multiple choice, open-ended, etc.)',
      'Timed quizzes and proctoring features',
      'Detailed analytics and performance reports',
      'Question banks and randomization',
    ],
  },
};

type FeatureKey = keyof typeof featureConfig;

export function RequestFeatureAccessDialog({
  workspaceName,
  wsId,
  children,
  enabledFeatures = {
    ENABLE_AI: false,
    ENABLE_EDUCATION: false,
    ENABLE_QUIZZES: false,
    ENABLE_CHALLENGES: false,
  },
}: RequestFeatureAccessDialogProps) {
  const t = useTranslations('ws-settings.feature-request');

  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(true);
  const [message, setMessage] = useState('');
  const [existingRequests, setExistingRequests] = useState<
    FeatureAccessRequest[]
  >([]);
  const [selectedFeature, setSelectedFeature] = useState<FeatureKey | null>(
    null
  );

  const availableFeatures = useMemo(() => {
    const requestedOrApprovedFeatures = new Set(
      existingRequests
        .filter((r) => r.status === 'pending' || r.status === 'approved')
        .map((r) => r.feature)
    );

    // Also exclude features that are already enabled
    const enabledFeaturesSet = new Set();
    if (enabledFeatures?.ENABLE_AI) enabledFeaturesSet.add('ai');
    if (enabledFeatures?.ENABLE_EDUCATION) enabledFeaturesSet.add('education');
    if (enabledFeatures?.ENABLE_QUIZZES) enabledFeaturesSet.add('quizzes');
    if (enabledFeatures?.ENABLE_CHALLENGES)
      enabledFeaturesSet.add('challenges');

    // Debug logging
    console.log('Debug - enabledFeatures:', enabledFeatures);
    console.log('Debug - enabledFeaturesSet:', enabledFeaturesSet);
    console.log(
      'Debug - requestedOrApprovedFeatures:',
      requestedOrApprovedFeatures
    );
    console.log('Debug - all feature keys:', Object.keys(featureConfig));

    const available = Object.keys(featureConfig).filter(
      (f) => !requestedOrApprovedFeatures.has(f) && !enabledFeaturesSet.has(f)
    ) as FeatureKey[];

    console.log('Debug - availableFeatures:', available);

    return available;
  }, [existingRequests, enabledFeatures]);

  useEffect(() => {
    const firstFeature = availableFeatures[0];
    if (availableFeatures.length > 0 && !selectedFeature) {
      if (firstFeature) {
        setSelectedFeature(firstFeature);
      }
    } else if (availableFeatures.length === 0) {
      setSelectedFeature(null);
    }
  }, [availableFeatures, selectedFeature]);

  // Check for existing request when component mounts
  useEffect(() => {
    if (!wsId) return;
    checkExistingRequests();
  }, [wsId]);

  const checkExistingRequests = async () => {
    try {
      setIsCheckingStatus(true);
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/education-access-request`
      );

      if (response.ok) {
        const data = await response.json();
        setExistingRequests(data.requests || []);
      }
    } catch (error) {
      console.error('Error checking existing requests:', error);
      // Don't show toast on initial check
    } finally {
      setIsCheckingStatus(false);
    }
  };

  const handleSubmitRequest = async () => {
    if (!message.trim()) {
      toast.error(t('toasts.error.reason-required'));
      return;
    }

    if (!selectedFeature) {
      toast.error(t('toasts.error.feature-required'));
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/education-access-request`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            workspaceName: workspaceName || 'Unknown Workspace',
            message: message.trim(),
            feature: selectedFeature,
          }),
        }
      );

      const data = await response.json();

      if (response.ok) {
        toast.success(t('toasts.success.request-submitted'));
        await checkExistingRequests(); // Refresh requests list
        setOpen(false);
        setMessage('');
        setSelectedFeature(null);
      } else {
        toast.error(data.error || t('toasts.error.request-failed'));
      }
    } catch (error) {
      console.error('Error submitting request:', error);
      toast.error(t('toasts.error.request-failed'));
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'text-yellow-600 dark:text-yellow-400';
      case 'approved':
        return 'text-green-600 dark:text-green-400';
      case 'rejected':
        return 'text-red-600 dark:text-red-400';
      default:
        return 'text-muted-foreground';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4" />;
      case 'approved':
        return <CheckCircle className="h-4 w-4" />;
      case 'rejected':
        return <XCircle className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const selectedFeatureConfig = selectedFeature
    ? featureConfig[selectedFeature]
    : null;
  const SelectedFeatureIcon = selectedFeatureConfig?.icon;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {SelectedFeatureIcon ? (
              <SelectedFeatureIcon className="h-5 w-5 text-dynamic-blue" />
            ) : null}
            {t('title')}
          </DialogTitle>
          <DialogDescription>
            {t('description', { ws: workspaceName || 'Unknown Workspace' })}
            <br />
            {t('description-2')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="feature">{t('feature-label')}</Label>
              {isCheckingStatus ? (
                <div className="h-10 w-full animate-pulse rounded-lg bg-dynamic-blue/10" />
              ) : (
                <Select
                  value={selectedFeature ?? ''}
                  onValueChange={(v) => setSelectedFeature(v as FeatureKey)}
                  disabled={availableFeatures.length === 0}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t('feature-placeholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableFeatures.map((key) => {
                      const Icon = featureConfig[key].icon;
                      return (
                        <SelectItem key={key} value={key}>
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4" />
                            <span>{featureConfig[key].name}</span>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              )}
            </div>
            {availableFeatures.length === 0 && !isCheckingStatus && (
              <div className="col-span-1 flex items-center justify-center rounded-lg border border-dashed border-dynamic-blue/20 bg-dynamic-blue/5 p-4 text-center text-sm text-muted-foreground">
                {t('no-features')}
              </div>
            )}
          </div>

          {selectedFeatureConfig && (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="message">{t('reason-label')}</Label>
                <Textarea
                  id="message"
                  placeholder={t('reason-placeholder', {
                    feature: selectedFeatureConfig.name.toLowerCase(),
                  })}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                  className="resize-none focus:border-dynamic-blue/60 focus:ring-dynamic-blue/20"
                />
                <p className="text-xs text-muted-foreground">
                  {t('reason-description')}
                </p>
              </div>
              <div className="rounded-lg border border-dynamic-blue/20 bg-dynamic-blue/5 p-4 text-sm">
                <h4 className="mb-2 font-semibold text-dynamic-blue">
                  {t('feature-details-title', {
                    feature: selectedFeatureConfig.name,
                  })}
                </h4>
                <ul className="space-y-1 text-muted-foreground">
                  {selectedFeatureConfig.details.map((detail, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-dynamic-blue/60"></span>
                      <span>{detail}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          {existingRequests.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-medium text-foreground">
                {t('existing-requests-title')}
              </h4>
              <div className="space-y-2 rounded-lg border p-3">
                {existingRequests.map((req) => {
                  const Icon = featureConfig[req.feature as FeatureKey]?.icon;
                  return (
                    <div
                      key={req.id}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        {Icon && <Icon className="h-4 w-4" />}
                        <span className="font-medium">
                          {featureConfig[req.feature as FeatureKey]?.name}
                        </span>
                      </div>
                      <div
                        className={`flex items-center gap-2 rounded-lg px-2 py-1 text-xs ${getStatusColor(
                          req.status
                        )}`}
                      >
                        {getStatusIcon(req.status)}
                        <span className="font-medium capitalize">
                          {req.status}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isLoading}
          >
            {t('cancel')}
          </Button>
          <Button
            onClick={handleSubmitRequest}
            disabled={
              isLoading ||
              !message.trim() ||
              message.trim().length < 20 ||
              !selectedFeature
            }
            className="bg-dynamic-blue text-white hover:bg-dynamic-blue/90"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('submitting')}
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                {t('submit')}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
