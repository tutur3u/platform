'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@repo/ui/components/ui/button';
import { Card } from '@repo/ui/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@repo/ui/components/ui/form';
import { Input } from '@repo/ui/components/ui/input';
import { Textarea } from '@repo/ui/components/ui/textarea';
import { Github, Mail } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
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
  },
  {
    icon: <Github className="h-6 w-6" />,
    title: 'GitHub',
    value: 'github.com/tutur3u',
    href: 'https://github.com/tutur3u',
  },
  {
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 320 512"
        className="h-6 w-6 fill-current"
      >
        <path d="M279.14 288l14.22-92.66h-88.91v-60.13c0-25.35 12.42-50.06 52.24-50.06h40.42V6.26S260.43 0 225.36 0c-73.22 0-121.08 44.38-121.08 124.72v70.62H22.89V288h81.39v224h100.17V288z" />
      </svg>
    ),
    title: 'Facebook',
    value: 'facebook.com/tuturuuu',
    href: 'https://facebook.com/tuturuuu',
  },
  {
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 42 42"
        className="h-6 w-6 fill-current"
      >
        <polygon points="41,6 9.929,42 6.215,42 37.287,6" />
        <polygon
          className="fill-background"
          fillRule="evenodd"
          points="31.143,41 7.82,7 16.777,7 40.1,41"
          clipRule="evenodd"
        />
        <path d="M15.724,9l20.578,30h-4.106L11.618,9H15.724 M17.304,6H5.922l24.694,36h11.382L17.304,6L17.304,6z" />
      </svg>
    ),
    title: 'X (Twitter)',
    value: '@tutur3u',
    href: 'https://twitter.com/tutur3u',
  },
];

export default function ContactPage() {
  const t = useTranslations();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      email: '',
      subject: '',
      message: '',
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    // Implement form submission logic here
    console.log(values);
  }

  return (
    <div className="container mx-auto mt-8 flex max-w-6xl flex-col gap-6 px-3 py-16 lg:gap-14 lg:py-24">
      <div className="mb-16 text-center">
        <h1 className="mb-4 text-4xl font-bold">{t('contact.title')}</h1>
        <p className="text-muted-foreground mx-auto max-w-2xl text-lg">
          {t('contact.description')}
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Contact Methods */}
        <div className="space-y-8">
          <h2 className="text-2xl font-bold">{t('contact.get_in_touch')}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {contactMethods.map((method) => (
              <Card key={method.title} className="p-4">
                <div className="flex items-start gap-4">
                  <div className="text-primary">{method.icon}</div>
                  <div>
                    <h3 className="font-semibold">{method.title}</h3>
                    {method.href ? (
                      <a
                        href={method.href}
                        className="text-muted-foreground hover:text-primary text-sm"
                      >
                        {method.value}
                      </a>
                    ) : (
                      <p className="text-muted-foreground text-sm">
                        {method.value}
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <div className="space-y-4">
            <h2 className="text-2xl font-bold">
              {t('contact.founder_contact')}
            </h2>
            <Card className="p-4">
              <div className="flex flex-col gap-4">
                <div>
                  <h3 className="font-semibold">Võ Hoàng Phúc</h3>
                  <p className="text-muted-foreground text-sm">
                    {t('contact.founder_description')}
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <a
                    href="mailto:phucvo@tuturuuu.com"
                    className="text-muted-foreground hover:text-primary flex items-center gap-2 text-sm"
                  >
                    <Mail className="h-4 w-4" />
                    phucvo@tuturuuu.com
                  </a>
                  <a
                    href="https://github.com/vhpx"
                    className="text-muted-foreground hover:text-primary flex items-center gap-2 text-sm"
                  >
                    <Github className="h-4 w-4" />
                    @vhpx {t('contact.on_github')}
                  </a>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* Contact Form */}
        <div>
          <h2 className="mb-8 text-2xl font-bold">
            {t('contact.send_us_a_message')}
          </h2>
          <Card className="p-6">
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
                      <FormLabel>{t('contact.form.name_label')}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t('contact.form.name_placeholder')}
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
                          placeholder="username@example.com"
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
                      <FormLabel>{t('contact.form.subject_label')}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={t('contact.form.subject_placeholder')}
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
                      <FormLabel>{t('contact.form.message_label')}</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder={t('contact.form.message_placeholder')}
                          className="min-h-[120px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" className="w-full" disabled>
                  {t('contact.form.submit_button')}
                </Button>
              </form>
            </Form>
          </Card>
        </div>
      </div>
    </div>
  );
}
