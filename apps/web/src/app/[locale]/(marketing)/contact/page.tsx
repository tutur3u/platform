'use client';

import { GITHUB_OWNER } from '@/constants/common';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import {
  Brain,
  Github,
  Globe,
  Mail,
  MessageCircle,
  Star,
} from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { Textarea } from '@tuturuuu/ui/textarea';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import * as z from 'zod';

const formSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email'),
  subject: z.string().min(5, 'Subject must be at least 5 characters'),
  message: z.string().min(10, 'Message must be at least 10 characters'),
});

const contactMethods = [
  {
    icon: <Mail className="h-6 w-6" />,
    title: 'Email',
    value: 'contact@tuturuuu.com',
    href: 'mailto:contact@tuturuuu.com',
    description: 'For general inquiries and support',
  },
  {
    icon: <Github className="h-6 w-6" />,
    title: 'GitHub',
    value: 'github.com/tutur3u',
    href: `https://github.com/${GITHUB_OWNER}`,
    description: 'Explore our open source projects',
  },
  {
    icon: <Globe className="h-6 w-6" />,
    title: 'Global Support',
    value: '24/7 Availability',
    description: 'We are here to help, anytime',
  },
  {
    icon: <MessageCircle className="h-6 w-6" />,
    title: 'Response Time',
    value: 'Within 24 Hours',
    description: 'Quick and helpful responses',
  },
];

const highlights = [
  {
    icon: <Brain className="h-6 w-6" />,
    title: 'Technical Excellence',
    description: 'Expert support from our engineering team',
  },
  {
    icon: <Star className="h-6 w-6" />,
    title: 'Premium Service',
    description: 'Dedicated attention to your needs',
  },
];

export default function ContactPage() {
  const supabase = createClient();
  const [isLoading, setIsLoading] = useState(false);

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      email: '',
      subject: '',
      message: '',
    },
  });

  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.email) {
        form.setValue('email', user.email);
      }
    };

    getUser();
  }, []);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setIsLoading(true);
    const { error } = await supabase.from('support_inquiries').insert({
      name: values.name,
      email: values.email,
      subject: values.subject,
      message: values.message,
    });

    if (error) {
      toast({
        title: 'Error',
        description: 'Something went wrong',
        variant: 'destructive',
      });
    } else {
      form.reset();
      toast({
        title: 'Success',
        description: 'Your message has been sent',
      });
    }
    setIsLoading(false);
  }

  return (
    <main className="relative mx-auto overflow-x-clip pb-12">
      {/* Enhanced Floating Orbs */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: 'linear',
          }}
          className="absolute top-0 -left-[8rem] h-[20rem] w-[20rem] rounded-full bg-gradient-to-br from-purple-500/30 via-pink-500/20 to-transparent blur-3xl sm:-left-64 sm:h-[40rem] sm:w-[40rem]"
        />
        <motion.div
          animate={{
            scale: [1, 1.1, 1],
            opacity: [0.2, 0.4, 0.2],
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: 'linear',
          }}
          className="absolute top-[30%] -right-[8rem] h-[17.5rem] w-[17.5rem] rounded-full bg-gradient-to-br from-blue-500/30 via-cyan-500/20 to-transparent blur-3xl sm:-right-64 sm:h-[35rem] sm:w-[35rem]"
        />
        <motion.div
          animate={{
            scale: [1, 1.3, 1],
            opacity: [0.2, 0.3, 0.2],
          }}
          transition={{
            duration: 12,
            repeat: Infinity,
            ease: 'linear',
          }}
          className="absolute -bottom-32 left-1/2 h-[22.5rem] w-[22.5rem] -translate-x-1/2 rounded-full bg-gradient-to-br from-green-500/20 via-emerald-500/15 to-transparent blur-3xl sm:-bottom-64 sm:h-[45rem] sm:w-[45rem]"
        />
      </div>

      {/* Enhanced Background Patterns */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(var(--primary-rgb),0.05)_1px,transparent_1px)] bg-[size:24px_24px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(var(--primary-rgb),0.02)_1px,transparent_1px)] bg-[size:120px] opacity-20" />
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

      <div className="container mx-auto mt-8 flex max-w-6xl flex-col gap-6 px-4 py-16 lg:gap-14 lg:py-24">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative mb-16 text-center"
        >
          {/* Enhanced background effects */}
          <div className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute inset-0 bg-[radial-gradient(circle_500px_at_50%_50%,rgba(var(--primary-rgb),0.15),transparent)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_700px_at_30%_50%,rgba(var(--primary-rgb),0.1),transparent)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_600px_at_70%_50%,rgba(var(--primary-rgb),0.1),transparent)]" />
            <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(var(--primary-rgb),0.05)_1px,transparent_1px)] bg-[size:40px] opacity-20" />
            <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(var(--primary-rgb),0.05)_1px,transparent_1px)] bg-[size:40px] opacity-20" />
          </div>

          <motion.div
            whileHover={{
              scale: 1.1,
              rotate: [0, 10, -10, 0],
            }}
            transition={{
              rotate: {
                duration: 0.5,
                ease: 'easeInOut',
              },
            }}
            className="group relative mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10"
          >
            <div className="animate-spin-slow absolute -inset-1 rounded-2xl bg-gradient-to-r from-purple-500/20 via-pink-500/20 to-purple-500/20" />
            <div className="absolute inset-[2px] rounded-xl bg-background/80 backdrop-blur-sm" />
            <MessageCircle className="relative h-8 w-8 text-primary transition-transform duration-300 group-hover:scale-110" />
          </motion.div>

          <motion.h1 className="mb-4 text-4xl font-bold text-foreground md:text-5xl">
            <motion.span
              animate={{
                backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
              }}
              transition={{
                duration: 5,
                repeat: Infinity,
                ease: 'linear',
              }}
              className="relative bg-gradient-to-r from-primary via-purple-500 to-pink-500 bg-[length:200%_auto] bg-clip-text text-transparent"
            >
              Let&apos;s Build Together
            </motion.span>
          </motion.h1>

          <motion.p className="mx-auto max-w-2xl text-lg leading-relaxed text-foreground/60">
            Whether you&apos;re looking to innovate, collaborate, or simply
            learn more about our technology, we&apos;re here to help. Join us in
            our mission to create the world&apos;s best technology solutions.
          </motion.p>
        </motion.div>

        <div className="grid gap-12 lg:grid-cols-2">
          {/* Contact Methods */}
          <motion.div
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="space-y-12"
          >
            <div className="space-y-8">
              <motion.h2 className="text-3xl font-bold text-foreground">
                <motion.span
                  animate={{
                    backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
                  }}
                  transition={{
                    duration: 5,
                    repeat: Infinity,
                    ease: 'linear',
                  }}
                  className="relative bg-gradient-to-r from-primary via-blue-500 to-cyan-500 bg-[length:200%_auto] bg-clip-text text-transparent"
                >
                  Get in Touch
                </motion.span>
              </motion.h2>

              <div className="grid gap-4 sm:grid-cols-2">
                {contactMethods.map((method, index) => (
                  <motion.div
                    key={method.title}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.1 * index }}
                  >
                    <Card className="group relative h-full overflow-hidden p-6 transition-all duration-300 hover:shadow-lg">
                      <motion.div
                        initial={{ opacity: 0 }}
                        whileHover={{ opacity: 1 }}
                        className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-pink-500/5 to-transparent transition-opacity duration-300"
                      />
                      <motion.div
                        animate={{
                          rotate: [0, 360],
                          scale: [1, 1.1, 1],
                        }}
                        transition={{
                          duration: 20,
                          repeat: Infinity,
                          ease: 'linear',
                        }}
                        className="absolute -top-8 -right-8 h-24 w-24 rounded-xl bg-gradient-to-br from-purple-500/20 via-pink-500/10 to-transparent blur-2xl"
                      />
                      <div className="relative flex flex-col gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 transition-all duration-300 group-hover:rotate-12 group-hover:bg-primary/20">
                          <motion.div
                            animate={{
                              scale: [1, 1.1, 1],
                            }}
                            transition={{
                              duration: 2,
                              repeat: Infinity,
                              ease: 'easeInOut',
                            }}
                            className="text-primary"
                          >
                            {method.icon}
                          </motion.div>
                        </div>
                        <div>
                          <h3 className="mb-1 font-semibold">{method.title}</h3>
                          {method.href ? (
                            <a
                              href={method.href}
                              className="mb-2 block text-sm text-foreground/60 transition-colors hover:text-primary"
                            >
                              {method.value}
                            </a>
                          ) : (
                            <p className="mb-2 text-sm text-foreground/60">
                              {method.value}
                            </p>
                          )}
                          <p className="text-sm text-foreground/60">
                            {method.description}
                          </p>
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Service Highlights */}
            <div className="space-y-6">
              <motion.h2 className="text-2xl font-bold text-foreground">
                <motion.span
                  animate={{
                    backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
                  }}
                  transition={{
                    duration: 5,
                    repeat: Infinity,
                    ease: 'linear',
                  }}
                  className="relative bg-gradient-to-r from-primary via-orange-500 to-red-500 bg-[length:200%_auto] bg-clip-text text-transparent"
                >
                  Why Choose Us
                </motion.span>
              </motion.h2>

              <div className="grid gap-4">
                {highlights.map((highlight, index) => (
                  <motion.div
                    key={highlight.title}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.4, delay: 0.3 + 0.1 * index }}
                  >
                    <Card className="group relative overflow-hidden p-4 transition-all duration-300 hover:bg-foreground/5">
                      <motion.div
                        initial={{ opacity: 0 }}
                        whileHover={{ opacity: 1 }}
                        className="absolute inset-0 bg-gradient-to-br from-orange-500/10 via-red-500/5 to-transparent transition-opacity duration-300"
                      />
                      <motion.div
                        animate={{
                          rotate: [0, 360],
                          scale: [1, 1.1, 1],
                        }}
                        transition={{
                          duration: 20,
                          repeat: Infinity,
                          ease: 'linear',
                        }}
                        className="absolute -top-8 -right-8 h-24 w-24 rounded-xl bg-gradient-to-br from-orange-500/20 via-red-500/10 to-transparent blur-2xl"
                      />
                      <div className="relative flex items-start gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 transition-all duration-300 group-hover:rotate-12 group-hover:bg-primary/20">
                          <motion.div
                            animate={{
                              scale: [1, 1.1, 1],
                            }}
                            transition={{
                              duration: 2,
                              repeat: Infinity,
                              ease: 'easeInOut',
                            }}
                            className="text-primary"
                          >
                            {highlight.icon}
                          </motion.div>
                        </div>
                        <div>
                          <h3 className="font-semibold">{highlight.title}</h3>
                          <p className="text-sm text-foreground/60">
                            {highlight.description}
                          </p>
                        </div>
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Founder Contact */}
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="space-y-6"
            >
              <motion.h2 className="text-2xl font-bold text-foreground">
                <motion.span
                  animate={{
                    backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
                  }}
                  transition={{
                    duration: 5,
                    repeat: Infinity,
                    ease: 'linear',
                  }}
                  className="relative bg-gradient-to-r from-primary via-green-500 to-emerald-500 bg-[length:200%_auto] bg-clip-text text-transparent"
                >
                  Connect with Our Founder
                </motion.span>
              </motion.h2>

              <Card className="group relative overflow-hidden p-6">
                <motion.div
                  initial={{ opacity: 0 }}
                  whileHover={{ opacity: 1 }}
                  className="absolute inset-0 bg-gradient-to-br from-green-500/10 via-emerald-500/5 to-transparent transition-opacity duration-300"
                />
                <motion.div
                  animate={{
                    rotate: [0, 360],
                    scale: [1, 1.1, 1],
                  }}
                  transition={{
                    duration: 20,
                    repeat: Infinity,
                    ease: 'linear',
                  }}
                  className="absolute -top-8 -right-8 h-24 w-24 rounded-xl bg-gradient-to-br from-green-500/20 via-emerald-500/10 to-transparent blur-2xl"
                />
                <div className="relative flex flex-col gap-4">
                  <div>
                    <h3 className="text-xl font-bold">Võ Hoàng Phúc</h3>
                    <p className="text-sm text-foreground/60">
                      Founder & CEO, driving innovation and excellence in
                      technology
                    </p>
                  </div>

                  <div className="flex flex-col gap-3">
                    <a
                      href="mailto:phucvo@tuturuuu.com"
                      className="flex items-center gap-2 text-sm text-foreground/60 transition-colors hover:text-primary"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 transition-all duration-300 group-hover:rotate-12 group-hover:bg-primary/20">
                        <Mail className="h-4 w-4 text-primary" />
                      </div>
                      phucvo@tuturuuu.com
                    </a>
                    <a
                      href="https://github.com/vhpx"
                      className="flex items-center gap-2 text-sm text-foreground/60 transition-colors hover:text-primary"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 transition-all duration-300 group-hover:rotate-12 group-hover:bg-primary/20">
                        <Github className="h-4 w-4 text-primary" />
                      </div>
                      @vhpx on GitHub
                    </a>
                  </div>
                </div>
              </Card>
            </motion.div>
          </motion.div>

          {/* Contact Form */}
          <motion.div
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <motion.h2 className="mb-8 text-3xl font-bold text-foreground">
              <motion.span
                animate={{
                  backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
                }}
                transition={{
                  duration: 5,
                  repeat: Infinity,
                  ease: 'linear',
                }}
                className="relative bg-gradient-to-r from-primary via-purple-500 to-pink-500 bg-[length:200%_auto] bg-clip-text text-transparent"
              >
                Send Us a Message
              </motion.span>
            </motion.h2>

            <Card className="group relative overflow-hidden">
              <motion.div
                initial={{ opacity: 0 }}
                whileHover={{ opacity: 1 }}
                className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-pink-500/5 to-transparent transition-opacity duration-300"
              />
              <motion.div
                animate={{
                  rotate: [0, 360],
                  scale: [1, 1.1, 1],
                }}
                transition={{
                  duration: 20,
                  repeat: Infinity,
                  ease: 'linear',
                }}
                className="absolute -top-8 -right-8 h-24 w-24 rounded-xl bg-gradient-to-br from-purple-500/20 via-pink-500/10 to-transparent blur-2xl"
              />
              <div className="bg-primary/5 p-6">
                <p className="text-foreground/80">
                  We&apos;re excited to hear from you. Share your ideas,
                  questions, or thoughts, and we&apos;ll get back to you as soon
                  as possible.
                </p>
              </div>
              <div className="relative p-6">
                <Form {...form}>
                  <form
                    onSubmit={form.handleSubmit(onSubmit)}
                    className="space-y-6"
                  >
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Name</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Your name"
                              className="bg-background/50 backdrop-blur-sm"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input
                              type="email"
                              placeholder="you@example.com"
                              className="bg-background/50 backdrop-blur-sm"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="subject"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Subject</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="What's this about?"
                              className="bg-background/50 backdrop-blur-sm"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="message"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Message</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Tell us more about your ideas..."
                              className="min-h-[150px] resize-none bg-background/50 backdrop-blur-sm"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button
                      type="submit"
                      className="w-full transition-all duration-300 hover:scale-[1.02]"
                      size="lg"
                      disabled={isLoading}
                    >
                      {isLoading ? 'Sending...' : 'Send Message'}
                    </Button>
                  </form>
                </Form>
              </div>
            </Card>
          </motion.div>
        </div>
      </div>

      {/* Enhanced Animation Styles */}
      <style jsx global>{`
        @keyframes float {
          0%,
          100% {
            transform: translateY(0px) rotate(0deg);
          }
          50% {
            transform: translateY(-10px) rotate(2deg);
          }
        }
        .animate-float {
          animation: float 4s ease-in-out infinite;
        }
        @keyframes spin-slow {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        .animate-spin-slow {
          animation: spin-slow 12s linear infinite;
        }
        @keyframes pulse-glow {
          0%,
          100% {
            opacity: 0.5;
            transform: scale(1);
          }
          50% {
            opacity: 1;
            transform: scale(1.05);
          }
        }
        .animate-pulse-glow {
          animation: pulse-glow 4s ease-in-out infinite;
        }
        @keyframes gradient-shift {
          0% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
          100% {
            background-position: 0% 50%;
          }
        }
        .animate-gradient {
          animation: gradient-shift 8s ease infinite;
          background-size: 200% 200%;
        }
      `}</style>
    </main>
  );
}
