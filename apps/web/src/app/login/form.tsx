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
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const FormSchema = z.object({
  email: z.string().email(),
  otp: z.string().optional(),
});

export default function LoginForm() {
  const router = useRouter();

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
  });

  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);

  // Resend cooldown
  const cooldown = 60;
  const [resendCooldown, setResendCooldown] = useState(0);

  // Update resend cooldown OTP is sent
  useEffect(() => {
    if (otpSent) setResendCooldown(cooldown);
  }, [otpSent]);

  // Reduce cooldown by 1 every second
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => {
        setResendCooldown((prev) => prev - 1);
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const sendOtp = async (data: { email: string }) => {
    setLoading(true);

    const res = await fetch('/api/auth/otp/send', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    if (res.ok) {
      // Reset form state
      form.reset({
        email: data.email,
        otp: '',
      });

      // Notify user
      toast({
        title: 'Success',
        description: 'An OTP has been sent to your email address.',
      });

      // OTP has been sent
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
      router.refresh();
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
                  <div className="flex flex-col gap-2 md:flex-row">
                    <Input placeholder="••••••" {...field} disabled={loading} />
                    <Button
                      onClick={() =>
                        sendOtp({ email: form.getValues('email') })
                      }
                      disabled={loading || resendCooldown > 0}
                      className="md:w-40"
                      variant="secondary"
                      type="button"
                    >
                      {resendCooldown > 0
                        ? `Resend (${resendCooldown})`
                        : 'Resend'}
                    </Button>
                  </div>
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
