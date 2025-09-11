import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  checkIfUserExists,
  generateRandomPassword,
  validateEmail,
  validateOtp,
} from '@tuturuuu/utils/email';
import { z } from 'zod';
import { baseProcedure, createTRPCRouter } from '../init';

export const appRouter = createTRPCRouter({
  sendOtp: baseProcedure
    .input(z.object({ email: z.string(), locale: z.string() }))
    .mutation(async ({ input }) => {
      const { email, locale } = input;
      const validatedEmail = await validateEmail(email);

      const userId = await checkIfUserExists({ email: validatedEmail });

      const sbAdmin = await createAdminClient();
      const supabase = await createClient();

      if (userId) {
        const { error: updateError } = await sbAdmin.auth.admin.updateUserById(
          userId,
          {
            user_metadata: { locale, origin: 'TUTURUUU' },
          }
        );

        if (updateError) {
          return { error: updateError.message };
        }

        const { error } = await supabase.auth.signInWithOtp({
          email: validatedEmail,
          options: { data: { locale, origin: 'TUTURUUU' } },
        });

        if (error) {
          return { error: error.message };
        }
      } else {
        const randomPassword = generateRandomPassword();

        const { error } = await supabase.auth.signUp({
          email: validatedEmail,
          password: randomPassword,
          options: {
            data: { locale, origin: 'TUTURUUU' },
          },
        });

        if (error) {
          return { error: error.message };
        }
      }
    }),

  verifyOtp: baseProcedure
    .input(z.object({ email: z.string(), otp: z.string(), locale: z.string() }))
    .mutation(async ({ input }) => {
      const { email, otp, locale } = input;

      const validatedEmail = await validateEmail(email);
      const validatedOtp = await validateOtp(otp);

      const sbAdmin = await createAdminClient();
      const supabase = await createClient();

      const { error } = await supabase.auth.verifyOtp({
        email: validatedEmail,
        token: validatedOtp,
        type: 'email',
      });

      if (error) {
        return { error: error.message };
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return { error: 'User not found' };
      }

      const { error: updateError } = await sbAdmin.auth.admin.updateUserById(
        user.id,
        {
          user_metadata: { locale, origin: 'TUTURUUU' },
        }
      );

      if (updateError) {
        return { error: updateError.message };
      }

      return { success: true };
    }),
});

// export type definition of API
export type AppRouter = typeof appRouter;
