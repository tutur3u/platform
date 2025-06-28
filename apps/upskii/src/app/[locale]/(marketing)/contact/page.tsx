'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import {
  ArrowRight,
  AtSign,
  FileQuestion,
  Headphones,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  SendHorizontal,
  User,
} from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Separator } from '@tuturuuu/ui/separator';
import { Textarea } from '@tuturuuu/ui/textarea';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import * as z from 'zod';

export default function ContactPage() {
  const t = useTranslations('boarding-pages.contact');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  // Form validation schema
  const contactFormSchema = useMemo(
    () =>
      z.object({
        name: z.string().min(2, { message: t('form.fields.name.error') }),
        email: z.string().email({ message: t('form.fields.email.error') }),
        subject: z.string().min(1, { message: t('form.fields.subject.error') }),
        message: z
          .string()
          .min(10, { message: t('form.fields.message.error') }),
      }),
    []
  );

  const form = useForm<z.infer<typeof contactFormSchema>>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: {
      name: '',
      email: '',
      subject: '',
      message: '',
    },
  });

  // Contact form submission handler
  function onSubmit(data: z.infer<typeof contactFormSchema>) {
    setIsSubmitting(true);

    // Simulate API call
    setTimeout(() => {
      console.log('Form submitted:', data);
      setIsSubmitting(false);
      setIsSubmitted(true);
    }, 1500);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
      <div className="mb-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8 text-center"
        >
          <Badge variant="outline" className="mb-4">
            <MessageSquare className="mr-2 h-4 w-4" />
            {t('page.badge')}
          </Badge>
          <h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl">
            {t('page.title')}
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
            {t('page.description')}
          </p>
        </motion.div>
      </div>

      <div className="grid gap-8 md:grid-cols-3">
        {/* Contact Information */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="md:col-span-1"
        >
          <div className="space-y-6">
            <Card className="overflow-hidden p-6">
              <h2 className="mb-4 text-xl font-bold">{t('info.title')}</h2>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-full text-primary">
                    <Mail className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium">{t('info.email.label')}</p>
                    <p className="text-muted-foreground">
                      {t('info.email.value')}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-full text-primary">
                    <Phone className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium">{t('info.phone.label')}</p>
                    <p className="text-muted-foreground">+1 (123) 456-7890</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-full text-primary">
                    <MapPin className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium">{t('info.address.label')}</p>
                    <p>{t('info.address.value')}</p>
                    {/* <p className="text-muted-foreground">
                      123 Education Street
                      <br />
                      San Francisco, CA 94103
                      <br />
                      United States
                    </p> */}
                  </div>
                </div>
              </div>

              <Separator className="my-6" />

              <h3 className="mb-4 text-lg font-semibold">
                {t('info.hours.title')}
              </h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span>{t('info.hours.weekdays.days')}</span>
                  <span>{t('info.hours.weekdays.hours')}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>{t('info.hours.saturday.days')}</span>
                  <span>{t('info.hours.saturday.hours')}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>{t('info.hours.sunday.days')}</span>
                  <span>{t('info.hours.sunday.hours')}</span>
                </div>
              </div>
            </Card>

            <Card className="overflow-hidden bg-primary/5 p-6">
              <h3 className="mb-4 text-lg font-semibold">
                {t('quick_links.title')}
              </h3>
              <div className="grid grid-cols-1 gap-2">
                <Link href="/faq">
                  <Button variant="outline" className="w-full justify-start">
                    <FileQuestion className="mr-2 h-4 w-4" />
                    {t('quick_links.faq')}
                    <ArrowRight className="ml-auto h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/guide">
                  <Button variant="outline" className="w-full justify-start">
                    <Headphones className="mr-2 h-4 w-4" />
                    {t('quick_links.guide')}
                    <ArrowRight className="ml-auto h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </Card>
          </div>
        </motion.div>

        {/* Contact Form */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="md:col-span-2"
        >
          <Card className="p-6 md:p-8">
            {isSubmitted ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="mb-4 rounded-full bg-primary/10 p-3 text-primary">
                  <SendHorizontal className="h-8 w-8" />
                </div>
                <h2 className="mb-2 text-2xl font-bold">
                  {t('form.success.title')}
                </h2>
                <p className="mb-6 max-w-md text-muted-foreground">
                  {t('form.success.description')}
                </p>
                <Button onClick={() => setIsSubmitted(false)}>
                  {t('form.buttons.send_another')}
                </Button>
              </div>
            ) : (
              <>
                <h2 className="mb-6 text-xl font-bold">{t('form.title')}</h2>
                <Form {...form}>
                  <form
                    onSubmit={form.handleSubmit(onSubmit)}
                    className="space-y-6"
                  >
                    <div className="grid gap-6 md:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('form.fields.name.label')}</FormLabel>
                            <FormControl>
                              <div className="relative">
                                <User className="absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" />
                                <Input
                                  placeholder={t(
                                    'form.fields.name.placeholder'
                                  )}
                                  className="pl-10"
                                  {...field}
                                />
                              </div>
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
                            <FormLabel>
                              {t('form.fields.email.label')}
                            </FormLabel>
                            <FormControl>
                              <div className="relative">
                                <AtSign className="absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" />
                                <Input
                                  placeholder={t(
                                    'form.fields.email.placeholder'
                                  )}
                                  className="pl-10"
                                  {...field}
                                />
                              </div>
                            </FormControl>
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
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue
                                  placeholder={t(
                                    'form.fields.subject.placeholder'
                                  )}
                                />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="general_inquiry">
                                {t(
                                  'form.fields.subject.options.general_inquiry'
                                )}
                              </SelectItem>
                              <SelectItem value="technical_support">
                                {t(
                                  'form.fields.subject.options.technical_support'
                                )}
                              </SelectItem>
                              <SelectItem value="billing">
                                {t('form.fields.subject.options.billing')}
                              </SelectItem>
                              <SelectItem value="teacher_verification">
                                {t(
                                  'form.fields.subject.options.teacher_verification'
                                )}
                              </SelectItem>
                              <SelectItem value="course_issue">
                                {t('form.fields.subject.options.course_issue')}
                              </SelectItem>
                              <SelectItem value="partnership">
                                {t('form.fields.subject.options.partnership')}
                              </SelectItem>
                              <SelectItem value="feedback">
                                {t('form.fields.subject.options.feedback')}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            {t('form.fields.subject.description')}
                          </FormDescription>
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
                              className="min-h-32"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button
                      type="submit"
                      size="lg"
                      className="w-full"
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? (
                        <>{t('form.buttons.submitting')}</>
                      ) : (
                        <>
                          {t('form.buttons.submit')}
                          <SendHorizontal className="ml-2 h-4 w-4" />
                        </>
                      )}
                    </Button>
                  </form>
                </Form>
              </>
            )}
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
