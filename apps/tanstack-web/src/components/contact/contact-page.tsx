import { queryOptions, useQuery } from '@tanstack/react-query';
import {
  Brain,
  Clock,
  MessageCircle,
  Sparkles,
  Star,
} from '@tuturuuu/icons/lucide';
import {
  getCurrentUserProfile,
  InternalApiError,
} from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { Card } from '@tuturuuu/ui/card';
import {
  type ContactMessages,
  getContactHighlights,
  getContactMethods,
} from '../../data/contact/contact-content';
import type { ContactProfile } from '../../data/contact/contact-form';
import type { Locale } from '../../lib/platform/locale';
import { getMessages } from '../../lib/platform/messages';
import {
  ContactHighlightCard,
  ContactMethodCard,
  FounderCard,
  QuickLinksCard,
} from './contact-card';
import { ContactForm } from './contact-form';

const currentUserContactProfileQuery = queryOptions({
  queryFn: async (): Promise<ContactProfile | null> => {
    try {
      const profile = await getCurrentUserProfile();
      return {
        display_name: profile.display_name,
        email: profile.email,
        id: profile.id,
      };
    } catch (error) {
      if (error instanceof InternalApiError && error.status === 401) {
        return null;
      }

      throw error;
    }
  },
  queryKey: ['contact', 'current-user-profile'],
  retry: false,
});

export function ContactPage({ locale }: { locale: Locale }) {
  const messages = getMessages(locale).contact;
  const profileQuery = useQuery(currentUserContactProfileQuery);
  const profile = profileQuery.data ?? null;

  return (
    <main className="relative mx-auto w-full overflow-x-hidden text-balance">
      <ContactBackground />
      <ContactHero messages={messages} />
      <ContactMethods messages={messages} />
      <section className="relative px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-12 lg:grid-cols-2">
            <div>
              <h2 className="mb-6 font-bold text-3xl">
                <span className="bg-linear-to-r from-dynamic-purple via-dynamic-pink to-dynamic-orange bg-clip-text text-transparent">
                  {messages.form.title}
                </span>
              </h2>
              <p className="mb-8 text-foreground/70 leading-relaxed">
                {messages.form.description}
              </p>
              <ContactForm
                isProfilePending={profileQuery.isPending}
                key={profile?.id ?? 'anonymous'}
                locale={locale}
                messages={messages}
                profile={profile}
              />
            </div>
            <div className="space-y-8">
              <ContactHighlights messages={messages} />
              <div>
                <h2 className="mb-6 font-bold text-3xl">
                  <span className="bg-linear-to-r from-dynamic-pink via-dynamic-purple to-dynamic-blue bg-clip-text text-transparent">
                    {messages.founder.title}
                  </span>
                </h2>
                <FounderCard messages={messages} />
              </div>
              <QuickLinksCard locale={locale} messages={messages} />
            </div>
          </div>
        </div>
      </section>
      <ResponseBanner messages={messages} />
    </main>
  );
}

function ContactBackground() {
  return (
    <>
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute top-0 -left-32 h-96 w-96 rounded-full bg-linear-to-br from-dynamic-purple/25 via-dynamic-pink/15 to-transparent blur-3xl sm:-left-64 sm:h-160 sm:w-160" />
        <div className="absolute top-[40%] -right-32 h-80 w-80 rounded-full bg-linear-to-br from-dynamic-blue/25 via-dynamic-cyan/15 to-transparent blur-3xl sm:-right-64 sm:h-140 sm:w-140" />
        <div className="absolute -bottom-32 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-linear-to-br from-dynamic-green/20 via-dynamic-emerald/10 to-transparent blur-3xl sm:-bottom-64 sm:h-180 sm:w-180" />
      </div>
      <div className="pointer-events-none fixed inset-0 -z-10 opacity-30">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(var(--primary-rgb),0.08)_1px,transparent_1px)] bg-size-[32px_32px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(var(--primary-rgb),0.04)_1px,transparent_1px)] bg-size-[120px]" />
      </div>
    </>
  );
}

function ContactHero({ messages }: { messages: ContactMessages }) {
  return (
    <section className="relative px-4 pt-24 pb-16 sm:px-6 sm:pt-32 sm:pb-20 lg:px-8 lg:pt-40 lg:pb-24">
      <div className="mx-auto max-w-7xl text-center">
        <Badge
          className="mb-6 border-dynamic-purple/30 bg-dynamic-purple/10 text-dynamic-purple transition-all hover:scale-105 hover:bg-dynamic-purple/20 hover:shadow-dynamic-purple/20 hover:shadow-lg"
          variant="secondary"
        >
          <MessageCircle className="mr-1.5 h-3.5 w-3.5" />
          {messages.hero.badge}
        </Badge>
        <h1 className="mb-6 text-balance font-bold text-4xl tracking-normal sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl">
          {messages.hero.title.part1}{' '}
          <span className="bg-linear-to-r from-dynamic-purple via-dynamic-pink to-dynamic-orange bg-clip-text text-transparent">
            {messages.hero.title.highlight}
          </span>
        </h1>
        <p className="mx-auto mb-8 max-w-3xl text-balance text-base text-foreground/70 leading-relaxed sm:text-lg md:text-xl lg:text-2xl">
          {messages.hero.description}
        </p>
      </div>
    </section>
  );
}

function ContactMethods({ messages }: { messages: ContactMessages }) {
  return (
    <section className="relative px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-10 text-center">
          <h2 className="mb-3 font-bold text-3xl">{messages.methods.title}</h2>
          <p className="text-foreground/70">{messages.methods.subtitle}</p>
        </div>
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {getContactMethods(messages).map((item) => (
            <ContactMethodCard item={item} key={item.title} />
          ))}
        </div>
      </div>
    </section>
  );
}

function ContactHighlights({ messages }: { messages: ContactMessages }) {
  return (
    <div>
      <h2 className="mb-6 font-bold text-3xl">
        <span className="bg-linear-to-r from-dynamic-cyan via-dynamic-purple to-dynamic-pink bg-clip-text text-transparent">
          {messages.highlights.title}
        </span>
      </h2>
      <div className="space-y-4">
        {getContactHighlights(messages).map((item) => (
          <ContactHighlightCard item={item} key={item.title} />
        ))}
      </div>
    </div>
  );
}

function ResponseBanner({ messages }: { messages: ContactMessages }) {
  const features = [
    { icon: Sparkles, label: messages.banner.features.dedicated },
    { icon: Brain, label: messages.banner.features.expert },
    { icon: Clock, label: messages.banner.features.response },
  ];

  return (
    <section className="relative px-4 pb-24 sm:px-6 lg:px-8">
      <Card className="mx-auto max-w-7xl border-dynamic-green/30 bg-linear-to-br from-dynamic-green/5 via-background to-dynamic-cyan/5 p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-dynamic-green/10">
          <Star className="h-7 w-7 text-dynamic-green" />
        </div>
        <h2 className="mb-3 font-bold text-2xl">{messages.banner.title}</h2>
        <p className="mx-auto mb-6 max-w-2xl text-foreground/70">
          {messages.banner.description}
        </p>
        <div className="mx-auto grid max-w-3xl gap-3 sm:grid-cols-3">
          {features.map((feature) => (
            <div
              className="flex items-center justify-center gap-2 rounded-lg border border-border/60 bg-background/70 px-3 py-2 text-sm"
              key={feature.label}
            >
              <feature.icon className="h-4 w-4 text-dynamic-green" />
              <span>{feature.label}</span>
            </div>
          ))}
        </div>
      </Card>
    </section>
  );
}
