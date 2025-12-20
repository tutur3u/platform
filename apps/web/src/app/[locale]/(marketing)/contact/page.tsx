'use client';

import {
  Brain,
  Check,
  Clock,
  Github,
  Globe,
  LogIn,
  Mail,
  MessageCircle,
  Rocket,
  Send,
  Shield,
  Sparkles,
  Star,
  Zap,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import { Badge } from '@tuturuuu/ui/badge';
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
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import * as z from 'zod';
import { GITHUB_OWNER } from '@/constants/common';

const formSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.email('Please enter a valid email'),
  type: z.enum(['bug', 'feature-request', 'support', 'job-application'], {
    error: 'Please select an inquiry type',
  }),
  product: z.enum([
    'web',
    'nova',
    'rewise',
    'calendar',
    'finance',
    'tudo',
    'tumeet',
    'shortener',
    'qr',
    'drive',
    'mail',
    'other',
  ]),
  subject: z.string().min(5, 'Subject must be at least 5 characters'),
  message: z.string().min(10, 'Message must be at least 10 characters'),
});

export default function ContactPage() {
  const t = useTranslations('contact');
  const supabase = createClient();
  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState<SupabaseUser | null>(null);

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      email: '',
      type: 'support' as const,
      product: 'other' as const,
      subject: '',
      message: '',
    },
  });

  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser();
      setUser(currentUser);

      if (currentUser) {
        // Set email from auth user
        if (currentUser.email) {
          form.setValue('email', currentUser.email);
        }

        // Get user profile data for name
        const { data: profile } = await supabase
          .from('users')
          .select('display_name')
          .eq('id', currentUser.id)
          .single();

        // Use display_name, fall back to email username
        const name =
          profile?.display_name || currentUser.email?.split('@')[0] || '';

        if (name) {
          form.setValue('name', name);
        }
      }
    };

    getUser();
  }, [form.setValue, supabase, form]);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!user) {
      toast.error('Authentication required', {
        description: 'Please log in to submit an inquiry.',
      });
      return;
    }

    setIsLoading(true);

    const { error } = await supabase.from('support_inquiries').insert({
      name: values.name,
      email: values.email,
      type: values.type,
      product: values.product,
      subject: values.subject,
      message: values.message,
      creator_id: user.id,
    });

    if (error) {
      console.error('Error submitting inquiry:', error);
      toast.error('Something went wrong', {
        description: 'Please try again later or contact us directly.',
      });
    } else {
      form.reset();
      toast.success('Message sent successfully!', {
        description: "We'll get back to you as soon as possible.",
      });
    }
    setIsLoading(false);
  }

  const contactMethods = [
    {
      icon: Mail,
      title: t('methods.email.title'),
      value: 'contact@tuturuuu.com',
      href: 'mailto:contact@tuturuuu.com',
      description: t('methods.email.description'),
      color: 'blue',
    },
    {
      icon: Github,
      title: t('methods.github.title'),
      value: 'github.com/tutur3u',
      href: `https://github.com/${GITHUB_OWNER}`,
      description: t('methods.github.description'),
      color: 'purple',
    },
    {
      icon: Globe,
      title: t('methods.support.title'),
      value: t('methods.support.value'),
      description: t('methods.support.description'),
      color: 'green',
    },
    {
      icon: Clock,
      title: t('methods.response.title'),
      value: t('methods.response.value'),
      description: t('methods.response.description'),
      color: 'orange',
    },
  ];

  const highlights = [
    {
      icon: Brain,
      title: t('highlights.technical.title'),
      description: t('highlights.technical.description'),
      color: 'cyan',
    },
    {
      icon: Star,
      title: t('highlights.premium.title'),
      description: t('highlights.premium.description'),
      color: 'yellow',
    },
    {
      icon: Zap,
      title: t('highlights.beta.title'),
      description: t('highlights.beta.description'),
      color: 'pink',
    },
  ];

  return (
    <main className="relative mx-auto w-full overflow-x-hidden text-balance">
      {/* Dynamic Floating Orbs */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.2, 0.3, 0.2],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="absolute top-0 -left-32 h-96 w-96 rounded-full bg-linear-to-br from-dynamic-purple/40 via-dynamic-pink/30 to-transparent blur-3xl sm:-left-64 sm:h-[40rem] sm:w-[40rem]"
        />
        <motion.div
          animate={{
            scale: [1, 1.15, 1],
            opacity: [0.15, 0.25, 0.15],
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="absolute top-[40%] -right-32 h-80 w-80 rounded-full bg-linear-to-br from-dynamic-blue/40 via-dynamic-cyan/30 to-transparent blur-3xl sm:-right-64 sm:h-[35rem] sm:w-[35rem]"
        />
        <motion.div
          animate={{
            scale: [1, 1.3, 1],
            opacity: [0.2, 0.3, 0.2],
          }}
          transition={{
            duration: 12,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="absolute -bottom-32 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-linear-to-br from-dynamic-green/30 via-dynamic-emerald/20 to-transparent blur-3xl sm:-bottom-64 sm:h-[45rem] sm:w-[45rem]"
        />
      </div>

      {/* Grid Pattern Overlay */}
      <div className="pointer-events-none fixed inset-0 -z-10 opacity-30">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(var(--primary-rgb),0.08)_1px,transparent_1px)] bg-[size:32px_32px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(var(--primary-rgb),0.04)_1px,transparent_1px)] bg-[size:120px]" />
      </div>

      {/* Hero Section */}
      <section className="relative px-4 pt-24 pb-16 sm:px-6 sm:pt-32 sm:pb-20 lg:px-8 lg:pt-40 lg:pb-24">
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="text-center"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1, duration: 0.5 }}
            >
              <Badge
                variant="secondary"
                className="mb-6 border-dynamic-purple/30 bg-dynamic-purple/10 text-dynamic-purple transition-all hover:scale-105 hover:bg-dynamic-purple/20 hover:shadow-dynamic-purple/20 hover:shadow-lg"
              >
                <MessageCircle className="mr-1.5 h-3.5 w-3.5" />
                {t('hero.badge')}
              </Badge>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.8 }}
              className="mb-6 text-balance font-bold text-4xl tracking-tight sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl"
            >
              {t('hero.title.part1')}{' '}
              <span className="animate-gradient bg-linear-to-r from-dynamic-purple via-dynamic-pink to-dynamic-orange bg-clip-text text-transparent">
                {t('hero.title.highlight')}
              </span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.8 }}
              className="mx-auto mb-8 max-w-3xl text-balance text-base text-foreground/70 leading-relaxed sm:text-lg md:text-xl lg:text-2xl"
            >
              {t('hero.description')}
            </motion.p>
          </motion.div>
        </div>
      </section>

      {/* Contact Methods Section */}
      <section className="relative px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-12 text-center"
          >
            <h2 className="mb-4 font-bold text-3xl sm:text-4xl">
              {t('methods.title')}
            </h2>
            <p className="mx-auto max-w-2xl text-foreground/60 text-lg">
              {t('methods.subtitle')}
            </p>
          </motion.div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {contactMethods.map((method, index) => (
              <motion.div
                key={method.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <Card
                  className={cn(
                    'group h-full p-6 transition-all hover:shadow-lg',
                    `border-dynamic-${method.color}/30 bg-linear-to-br from-dynamic-${method.color}/5 via-background to-background hover:border-dynamic-${method.color}/50 hover:shadow-dynamic-${method.color}/10`
                  )}
                >
                  <div
                    className={cn(
                      'mb-4 flex h-12 w-12 items-center justify-center rounded-xl transition-transform group-hover:rotate-12 group-hover:scale-110',
                      `bg-dynamic-${method.color}/10`
                    )}
                  >
                    <method.icon
                      className={cn('h-6 w-6', `text-dynamic-${method.color}`)}
                    />
                  </div>
                  <h3 className="mb-2 font-semibold text-lg">{method.title}</h3>
                  {method.href ? (
                    <a
                      href={method.href}
                      className={cn(
                        'mb-2 block text-sm transition-colors',
                        `text-dynamic-${method.color} hover:text-dynamic-${method.color}/80`
                      )}
                    >
                      {method.value}
                    </a>
                  ) : (
                    <p className="mb-2 text-foreground/60 text-sm">
                      {method.value}
                    </p>
                  )}
                  <p className="text-foreground/60 text-sm">
                    {method.description}
                  </p>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Main Content Grid */}
      <section className="relative px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-12 lg:grid-cols-2">
            {/* Contact Form */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="mb-6 font-bold text-3xl">
                <span className="bg-linear-to-r from-dynamic-purple via-dynamic-pink to-dynamic-orange bg-clip-text text-transparent">
                  {t('form.title')}
                </span>
              </h2>
              <p className="mb-8 text-foreground/70 leading-relaxed">
                {t('form.description')}
              </p>

              <Card className="border-dynamic-purple/30 bg-linear-to-br from-dynamic-purple/5 via-background to-background p-6">
                {!user && (
                  <div className="mb-6 rounded-lg border border-dynamic-orange/30 bg-dynamic-orange/5 p-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-dynamic-orange/10">
                        <Shield className="h-5 w-5 text-dynamic-orange" />
                      </div>
                      <div className="flex-1">
                        <h4 className="mb-1 font-semibold text-sm">
                          {t('form.authRequired.title')}
                        </h4>
                        <p className="mb-3 text-foreground/70 text-xs leading-relaxed">
                          {t('form.authRequired.description')}
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-dynamic-orange/30 text-dynamic-orange hover:bg-dynamic-orange/10 hover:text-dynamic-orange"
                          asChild
                        >
                          <Link href="/login">
                            <LogIn className="mr-1.5 h-4 w-4" />
                            {t('form.authRequired.loginButton')}
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

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
                          <FormLabel>{t('form.fields.name.label')}</FormLabel>
                          <FormControl>
                            <Input
                              placeholder={t('form.fields.name.placeholder')}
                              disabled
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
                          <FormLabel>{t('form.fields.email.label')}</FormLabel>
                          <FormControl>
                            <Input
                              type="email"
                              placeholder={t('form.fields.email.placeholder')}
                              disabled
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid gap-6 sm:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="type"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('form.fields.type.label')}</FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              defaultValue={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue
                                    placeholder={t(
                                      'form.fields.type.placeholder'
                                    )}
                                  />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="support">
                                  {t('form.fields.type.options.support')}
                                </SelectItem>
                                <SelectItem value="bug">
                                  {t('form.fields.type.options.bug')}
                                </SelectItem>
                                <SelectItem value="feature-request">
                                  {t('form.fields.type.options.featureRequest')}
                                </SelectItem>
                                <SelectItem value="job-application">
                                  {t('form.fields.type.options.jobApplication')}
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="product"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              {t('form.fields.product.label')}
                            </FormLabel>
                            <Select
                              onValueChange={field.onChange}
                              defaultValue={field.value}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue
                                    placeholder={t(
                                      'form.fields.product.placeholder'
                                    )}
                                  />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="web">
                                  {t('form.fields.product.options.web')}
                                </SelectItem>
                                <SelectItem value="nova">
                                  {t('form.fields.product.options.nova')}
                                </SelectItem>
                                <SelectItem value="rewise">
                                  {t('form.fields.product.options.rewise')}
                                </SelectItem>
                                <SelectItem value="calendar">
                                  {t('form.fields.product.options.calendar')}
                                </SelectItem>
                                <SelectItem value="finance">
                                  {t('form.fields.product.options.finance')}
                                </SelectItem>
                                <SelectItem value="tudo">
                                  {t('form.fields.product.options.tudo')}
                                </SelectItem>
                                <SelectItem value="tumeet">
                                  {t('form.fields.product.options.tumeet')}
                                </SelectItem>
                                <SelectItem value="other">
                                  {t('form.fields.product.options.other')}
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="subject"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {t('form.fields.subject.label')}
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder={t('form.fields.subject.placeholder')}
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
                          <FormLabel>
                            {t('form.fields.message.label')}
                          </FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder={t('form.fields.message.placeholder')}
                              className="min-h-[150px] resize-none"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button
                      type="submit"
                      className="w-full"
                      size="lg"
                      disabled={isLoading || !user}
                    >
                      {isLoading ? (
                        t('form.button.sending')
                      ) : (
                        <>
                          <Send className="mr-2 h-5 w-5" />
                          {t('form.button.send')}
                        </>
                      )}
                    </Button>
                  </form>
                </Form>
              </Card>
            </motion.div>

            {/* Right Column - Highlights & Founder */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="space-y-8"
            >
              {/* Why Choose Us */}
              <div>
                <h2 className="mb-6 font-bold text-3xl">
                  <span className="bg-linear-to-r from-dynamic-blue via-dynamic-cyan to-dynamic-green bg-clip-text text-transparent">
                    {t('highlights.title')}
                  </span>
                </h2>
                <div className="space-y-4">
                  {highlights.map((highlight, index) => (
                    <motion.div
                      key={highlight.title}
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: index * 0.1 }}
                    >
                      <Card
                        className={cn(
                          'group p-6 transition-all hover:shadow-lg',
                          `border-dynamic-${highlight.color}/30 bg-linear-to-br from-dynamic-${highlight.color}/5 via-background to-background hover:border-dynamic-${highlight.color}/50 hover:shadow-dynamic-${highlight.color}/10`
                        )}
                      >
                        <div className="flex items-start gap-4">
                          <div
                            className={cn(
                              'flex h-12 w-12 items-center justify-center rounded-xl transition-transform group-hover:rotate-12 group-hover:scale-110',
                              `bg-dynamic-${highlight.color}/10`
                            )}
                          >
                            <highlight.icon
                              className={cn(
                                'h-6 w-6',
                                `text-dynamic-${highlight.color}`
                              )}
                            />
                          </div>
                          <div className="flex-1">
                            <h3 className="mb-1 font-semibold text-lg">
                              {highlight.title}
                            </h3>
                            <p className="text-foreground/60 text-sm">
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
              <div>
                <h2 className="mb-6 font-bold text-3xl">
                  <span className="bg-linear-to-r from-dynamic-pink via-dynamic-purple to-dynamic-blue bg-clip-text text-transparent">
                    {t('founder.title')}
                  </span>
                </h2>
                <Card className="group border-dynamic-pink/30 bg-linear-to-br from-dynamic-pink/5 via-background to-background p-6">
                  <div className="mb-4 flex items-start gap-4">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-dynamic-pink/10">
                      <Rocket className="h-8 w-8 text-dynamic-pink" />
                    </div>
                    <div>
                      <h3 className="mb-1 font-bold text-xl">
                        {t('founder.name')}
                      </h3>
                      <p className="text-foreground/60 text-sm">
                        {t('founder.role')}
                      </p>
                    </div>
                  </div>

                  <p className="mb-6 text-foreground/70 text-sm leading-relaxed">
                    {t('founder.description')}
                  </p>

                  <div className="space-y-3">
                    <a
                      href="mailto:phucvo@tuturuuu.com"
                      className="flex items-center gap-3 rounded-lg border border-dynamic-pink/20 bg-dynamic-pink/5 p-3 transition-all hover:border-dynamic-pink/40 hover:bg-dynamic-pink/10"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-dynamic-pink/10">
                        <Mail className="h-5 w-5 text-dynamic-pink" />
                      </div>
                      <div>
                        <div className="font-medium text-sm">
                          {t('founder.contact.email')}
                        </div>
                        <div className="text-dynamic-pink text-xs">
                          phucvo@tuturuuu.com
                        </div>
                      </div>
                    </a>

                    <a
                      href="https://github.com/vhpx"
                      target="_blank"
                      className="flex items-center gap-3 rounded-lg border border-dynamic-purple/20 bg-dynamic-purple/5 p-3 transition-all hover:border-dynamic-purple/40 hover:bg-dynamic-purple/10"
                      rel="noopener"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-dynamic-purple/10">
                        <Github className="h-5 w-5 text-dynamic-purple" />
                      </div>
                      <div>
                        <div className="font-medium text-sm">
                          {t('founder.contact.github')}
                        </div>
                        <div className="text-dynamic-purple text-xs">@vhpx</div>
                      </div>
                    </a>
                  </div>
                </Card>
              </div>

              {/* Quick Links */}
              <Card className="border-dynamic-blue/30 bg-linear-to-br from-dynamic-blue/5 via-background to-background p-6">
                <h3 className="mb-4 font-semibold text-lg">
                  {t('quickLinks.title')}
                </h3>
                <div className="space-y-2">
                  <Link
                    href="/about"
                    className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-dynamic-blue/10"
                  >
                    <Check className="h-4 w-4 text-dynamic-blue" />
                    <span className="text-sm">{t('quickLinks.about')}</span>
                  </Link>
                  <Link
                    href="/#pricing"
                    className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-dynamic-blue/10"
                  >
                    <Check className="h-4 w-4 text-dynamic-blue" />
                    <span className="text-sm">{t('quickLinks.pricing')}</span>
                  </Link>
                  <Link
                    href="https://github.com/tutur3u/platform"
                    target="_blank"
                    className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-dynamic-blue/10"
                  >
                    <Check className="h-4 w-4 text-dynamic-blue" />
                    <span className="text-sm">{t('quickLinks.github')}</span>
                  </Link>
                </div>
              </Card>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Response Time Banner */}
      <section className="relative px-4 py-16 pb-32 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <Card className="overflow-hidden border-dynamic-green/30 bg-linear-to-br from-dynamic-green/10 via-dynamic-emerald/5 to-background p-8 text-center md:p-12">
              <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-dynamic-green/10">
                <Sparkles className="h-8 w-8 text-dynamic-green" />
              </div>
              <h2 className="mb-4 font-bold text-3xl sm:text-4xl">
                {t('banner.title')}
              </h2>
              <p className="mx-auto mb-8 max-w-2xl text-foreground/70 text-lg">
                {t('banner.description')}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-6 text-foreground/60 text-sm">
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-dynamic-green" />
                  {t('banner.features.response')}
                </div>
                <div className="flex items-center gap-2">
                  <Brain className="h-5 w-5 text-dynamic-blue" />
                  {t('banner.features.expert')}
                </div>
                <div className="flex items-center gap-2">
                  <Star className="h-5 w-5 text-dynamic-yellow" />
                  {t('banner.features.dedicated')}
                </div>
              </div>
            </Card>
          </motion.div>
        </div>
      </section>
    </main>
  );
}
