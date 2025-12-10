'use client';

import { Lightbulb, User } from '@tuturuuu/icons';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
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
import { Textarea } from '@tuturuuu/ui/textarea';
import { motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { z } from 'zod';
import type { ProfileData } from '../../types';
import { NavigationButtons } from '../shared/navigation-buttons';
import {
  OnboardingCard,
  OnboardingHeader,
  OnboardingLayout,
} from '../shared/onboarding-card';

const FormSchema = z.object({
  displayName: z.string().min(1, 'Display name is required').max(100),
  bio: z.string().max(500).optional(),
  avatarUrl: z.string().url().optional().or(z.literal('')),
});

interface ProfileScreenProps {
  user: WorkspaceUser;
  onContinue: (data: ProfileData) => void;
  onBack: () => void;
  initialData?: Partial<ProfileData>;
  loading?: boolean;
}

export function ProfileScreen({
  user,
  onContinue,
  onBack,
  initialData,
  loading = false,
}: ProfileScreenProps) {
  const t = useTranslations('onboarding.profile');

  const form = useForm({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      displayName:
        initialData?.displayName || user.display_name || user.full_name || '',
      bio: initialData?.bio || user.bio || '',
      avatarUrl: initialData?.avatarUrl || user.avatar_url || '',
    },
  });

  const handleSubmit = (data: z.infer<typeof FormSchema>) => {
    onContinue({
      displayName: data.displayName,
      bio: data.bio || undefined,
      avatarUrl: data.avatarUrl || undefined,
    });
  };

  return (
    <OnboardingLayout>
      <OnboardingCard direction="forward">
        <OnboardingHeader
          icon={<User className="h-8 w-8 text-primary" />}
          title={t('title')}
          subtitle={t('subtitle')}
        />

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-6"
          >
            {/* Display Name */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.4 }}
            >
              <FormField
                control={form.control}
                name="displayName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-medium text-base">
                      {t('display-name')}
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t('display-name-placeholder')}
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

            {/* Bio */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.4 }}
            >
              <FormField
                control={form.control}
                name="bio"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-medium text-base">
                      {t('bio')}
                      <span className="ml-2 font-normal text-muted-foreground text-sm">
                        ({t('optional')})
                      </span>
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder={t('bio-placeholder')}
                        rows={3}
                        {...field}
                        disabled={loading}
                        className="resize-none text-base"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </motion.div>

            {/* Tip */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.4 }}
              className="flex gap-3 rounded-xl bg-dynamic-blue/5 p-4"
            >
              <Lightbulb className="h-5 w-5 shrink-0 text-dynamic-blue" />
              <p className="text-muted-foreground text-sm">
                {t('profile-tip')}
              </p>
            </motion.div>

            {/* Navigation */}
            <NavigationButtons
              onBack={onBack}
              backLabel={t('back')}
              loading={loading}
              showBack={true}
            />

            {/* Submit button integrated into navigation */}
            <div className="flex justify-end -mt-6">
              <motion.button
                type="submit"
                disabled={loading || !form.formState.isValid}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-2.5 font-medium text-primary-foreground text-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {loading ? t('saving') : t('continue')}
              </motion.button>
            </div>
          </form>
        </Form>
      </OnboardingCard>
    </OnboardingLayout>
  );
}
