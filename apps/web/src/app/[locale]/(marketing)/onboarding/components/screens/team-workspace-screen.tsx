'use client';

import { Building2, Lightbulb } from '@tuturuuu/icons';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import type { TeamWorkspaceData } from '../../types';
import { NavigationButtons } from '../shared/navigation-buttons';
import {
  OnboardingCard,
  OnboardingHeader,
  OnboardingLayout,
} from '../shared/onboarding-card';

const FormSchema = z.object({
  name: z.string().min(1, 'Workspace name is required').max(100),
});

interface TeamWorkspaceScreenProps {
  onContinue: (data: TeamWorkspaceData) => void;
  onBack: () => void;
  initialData?: Partial<TeamWorkspaceData>;
  loading?: boolean;
}

export function TeamWorkspaceScreen({
  onContinue,
  onBack,
  initialData,
  loading = false,
}: TeamWorkspaceScreenProps) {
  const t = useTranslations('onboarding.team-workspace');

  const form = useForm({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      name: initialData?.name || '',
    },
  });

  const handleSubmit = (data: z.infer<typeof FormSchema>) => {
    onContinue({
      name: data.name,
    });
  };

  return (
    <OnboardingLayout>
      <OnboardingCard direction="forward">
        <OnboardingHeader
          icon={<Building2 className="h-8 w-8 text-primary" />}
          title={t('title')}
          subtitle={t('subtitle')}
        />

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-6"
          >
            {/* Workspace Name */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.4 }}
            >
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-medium text-base">
                      {t('name-label')}
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t('name-placeholder')}
                        {...field}
                        disabled={loading}
                        className="h-12 text-base"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </motion.div>

            {/* Tips */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.4 }}
              className="flex gap-3 rounded-xl bg-dynamic-blue/5 p-4"
            >
              <Lightbulb className="h-5 w-5 shrink-0 text-dynamic-blue" />
              <div className="text-sm">
                <p className="mb-1 font-medium text-foreground">
                  {t('tip-title')}
                </p>
                <p className="text-muted-foreground">{t('tip-description')}</p>
              </div>
            </motion.div>

            {/* Navigation */}
            <NavigationButtons
              onBack={onBack}
              backLabel={t('back')}
              loading={loading}
              showBack={true}
            />

            {/* Submit button integrated into navigation */}
            <div className="-mt-6 flex justify-end">
              <motion.button
                type="submit"
                disabled={loading || !form.formState.isValid}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-2.5 font-medium text-primary-foreground text-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {loading ? t('creating') : t('continue')}
              </motion.button>
            </div>
          </form>
        </Form>
      </OnboardingCard>
    </OnboardingLayout>
  );
}
