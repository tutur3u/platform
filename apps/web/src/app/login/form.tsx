'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/use-toast';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const FormSchema = z.object({
  email: z.string().email(),
  otp: z.string().min(1).max(6).optional(),
});

export default function LoginForm() {
  const router = useRouter();

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
  });

  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const sendOtp = async (data: { email: string }) => {
    setLoading(true);

    const res = await fetch('/api/auth/otp/send', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    if (res.ok) {
      setOtpSent(true);
    } else {
      toast({
        title: 'Error',
        description: 'Failed to send OTP.',
      });
    }

    setLoading(false);
  };

  const verifyOtp = async (data: { email: string; otp: string }) => {
    setLoading(true);

    const res = await fetch('/api/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    if (res.ok) {
      router.push('/onboarding');
      toast({
        title: 'Success',
        description: 'You have successfully logged in.',
      });
    } else {
      setLoading(false);
      toast({
        title: 'Error',
        description: 'Failed to verify OTP.',
      });
    }
  };

  function onSubmit(data: z.infer<typeof FormSchema>) {
    try {
      const { email, otp } = data;

      if (!otpSent) sendOtp({ email });
      else if (otp) verifyOtp({ email, otp });
      else throw new Error('OTP is required.');
    } catch (e) {
      setLoading(false);
      toast({
        title: 'Error',
        description:
          e instanceof Error ? e.message : 'An unknown error occurred.',
      });
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  placeholder="rewise@tuturuuu.com"
                  disabled={otpSent}
                  {...field}
                />
              </FormControl>

              {otpSent || (
                <FormDescription>
                  Enter your email address to get started with Rewise.
                </FormDescription>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        {otpSent && (
          <FormField
            control={form.control}
            name="otp"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Verification Code</FormLabel>
                <FormControl>
                  <Input placeholder="••••••" {...field} />
                </FormControl>
                <FormDescription>
                  Enter the verification code sent to your email address.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <Button
          type="submit"
          className="w-full"
          disabled={
            loading ||
            form.formState.isSubmitting ||
            !form.formState.isValid ||
            (otpSent && !form.formState.dirtyFields.otp)
          }
        >
          {loading ? 'Loading...' : 'Continue'}
        </Button>
      </form>
    </Form>
  );
}
