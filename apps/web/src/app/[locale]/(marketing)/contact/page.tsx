'use client';

import { createClient } from '@/utils/supabase/client';
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
import { toast } from '@repo/ui/hooks/use-toast';
import { motion } from 'framer-motion';
import { Brain, Github, Globe, Mail, MessageCircle, Star } from 'lucide-react';
import { useState } from 'react';
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
    description: 'For general inquiries and support',
  },
  {
    icon: <Github className="h-6 w-6" />,
    title: 'GitHub',
    value: 'github.com/tutur3u',
    href: 'https://github.com/tutur3u',
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
    <div className="container relative mx-auto mt-8 flex max-w-6xl flex-col gap-6 px-3 py-16 lg:gap-14 lg:py-24">
      {/* Background Elements */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute left-[10%] top-[20%]"
          animate={{
            y: [0, -20, 0],
            rotate: [0, 5, 0],
          }}
          transition={{
            duration: 5,
            repeat: -1,
            ease: 'easeInOut',
          }}
        >
          <Star className="text-foreground/5 h-24 w-24" />
        </motion.div>
      </div>

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="mb-16 text-center"
      >
        <h1 className="mb-4 text-5xl font-bold">Let&apos;s Build Together</h1>
        <p className="text-foreground/80 mx-auto max-w-2xl text-lg leading-relaxed">
          Whether you&apos;re looking to innovate, collaborate, or simply learn
          more about our technology, we&apos;re here to help. Join us in our
          mission to create the world&apos;s best technology solutions.
        </p>
      </motion.div>

      <div className="grid gap-12 lg:grid-cols-2">
        {/* Contact Methods */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="space-y-12"
        >
          <div className="space-y-8">
            <h2 className="text-3xl font-bold">Get in Touch</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {contactMethods.map((method, index) => (
                <motion.div
                  key={method.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.1 * index }}
                >
                  <Card className="group relative overflow-hidden p-6 transition-all duration-300 hover:shadow-lg">
                    <div className="from-primary/5 absolute inset-0 bg-gradient-to-br to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                    <div className="relative flex flex-col gap-4">
                      <div className="text-primary">{method.icon}</div>
                      <div>
                        <h3 className="mb-1 font-semibold">{method.title}</h3>
                        {method.href ? (
                          <a
                            href={method.href}
                            className="text-foreground/60 hover:text-primary mb-2 block text-sm transition-colors"
                          >
                            {method.value}
                          </a>
                        ) : (
                          <p className="text-foreground/60 mb-2 text-sm">
                            {method.value}
                          </p>
                        )}
                        <p className="text-foreground/60 text-sm">
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
            <h2 className="text-2xl font-bold">Why Choose Us</h2>
            <div className="grid gap-4">
              {highlights.map((highlight, index) => (
                <motion.div
                  key={highlight.title}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: 0.3 + 0.1 * index }}
                >
                  <Card className="hover:bg-foreground/5 group p-4 transition-all duration-300">
                    <div className="flex items-start gap-4">
                      <div className="text-primary">{highlight.icon}</div>
                      <div>
                        <h3 className="font-semibold">{highlight.title}</h3>
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
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="space-y-6"
          >
            <h2 className="text-2xl font-bold">Connect with Our Founder</h2>
            <Card className="group overflow-hidden p-6">
              <div className="flex flex-col gap-4">
                <div>
                  <h3 className="text-xl font-bold">Võ Hoàng Phúc</h3>
                  <p className="text-foreground/60 text-sm">
                    Founder & CEO, driving innovation and excellence in
                    technology
                  </p>
                </div>

                <div className="flex flex-col gap-3">
                  <a
                    href="mailto:phucvo@tuturuuu.com"
                    className="text-foreground/60 hover:text-primary flex items-center gap-2 text-sm transition-colors"
                  >
                    <Mail className="h-4 w-4" />
                    phucvo@tuturuuu.com
                  </a>
                  <a
                    href="https://github.com/vhpx"
                    className="text-foreground/60 hover:text-primary flex items-center gap-2 text-sm transition-colors"
                  >
                    <Github className="h-4 w-4" />
                    @vhpx on GitHub
                  </a>
                </div>
              </div>
            </Card>
          </motion.div>
        </motion.div>

        {/* Contact Form */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <h2 className="mb-8 text-3xl font-bold">Send Us a Message</h2>
          <Card className="overflow-hidden">
            <div className="bg-primary/5 p-6">
              <p className="text-foreground/80">
                We&apos;re excited to hear from you. Share your ideas,
                questions, or thoughts, and we&apos;ll get back to you as soon
                as possible.
              </p>
            </div>
            <div className="p-6">
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
                            className="bg-background"
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
                            className="bg-background"
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
                            className="bg-background"
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
                            className="bg-background min-h-[150px]"
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
  );
}
