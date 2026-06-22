import { Calendar, UserIcon, Users, Video, Zap } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { GradientHeadline } from '@tuturuuu/ui/custom/gradient-headline';
import { Separator } from '@tuturuuu/ui/separator';
import type { Locale } from '../../lib/platform/locale';
import {
  getMeetTogetherContent,
  type MeetTogetherContent,
} from './meet-together-content';
import { MeetTogetherForm } from './meet-together-form';

const featureIcons = {
  blue: Calendar,
  green: Zap,
  purple: Users,
} as const;

const featureToneClassNames = {
  blue: {
    icon: 'text-dynamic-blue',
    surface: 'bg-dynamic-blue/5',
    symbol: 'bg-dynamic-blue/10',
  },
  green: {
    icon: 'text-dynamic-green',
    surface: 'bg-dynamic-green/5',
    symbol: 'bg-dynamic-green/10',
  },
  purple: {
    icon: 'text-dynamic-purple',
    surface: 'bg-dynamic-purple/5',
    symbol: 'bg-dynamic-purple/10',
  },
} as const;

export function MeetTogetherPage({ locale }: { locale: Locale }) {
  const content = getMeetTogetherContent(locale);

  return (
    <main className="flex w-full flex-col items-center overflow-hidden bg-background">
      <section className="container mx-auto mt-8 flex max-w-6xl flex-col gap-8 px-4 py-10 lg:flex-row lg:items-center lg:gap-12">
        <div className="flex flex-1 flex-col items-center text-center lg:items-start lg:text-left">
          <Badge className="mb-6 px-4 py-2" variant="secondary">
            <Video className="mr-2 h-4 w-4" />
            {content.hero.badge}
          </Badge>

          <h1 className="mb-6 text-balance text-center font-bold text-4xl text-foreground leading-tight tracking-tight md:text-5xl lg:text-left lg:text-6xl">
            {content.hero.headlineStart}{' '}
            <GradientHeadline className="bg-linear-to-r from-dynamic-blue via-dynamic-purple to-dynamic-green bg-clip-text">
              {content.hero.headlineHighlight}
            </GradientHeadline>
          </h1>

          <p className="mb-8 max-w-2xl text-center text-foreground/70 text-lg leading-relaxed md:text-xl lg:text-left">
            {content.hero.description}
          </p>

          <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
            {content.features.map((feature) => (
              <FeatureCard feature={feature} key={feature.title} />
            ))}
          </div>
        </div>

        <div className="mx-auto w-full max-w-2xl flex-1 lg:mx-0">
          <Card className="border-border/50 bg-accent/50 backdrop-blur-sm">
            <CardContent className="p-6 md:p-8">
              <MeetTogetherForm content={content.form} locale={locale} />
            </CardContent>
          </Card>
        </div>
      </section>

      <Separator className="my-8 md:my-16" />

      <section className="flex w-full flex-col items-center justify-center px-4 pb-16">
        <div className="w-full max-w-6xl">
          <div className="mb-8 flex flex-col gap-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2 text-center sm:text-left">
                <h2 className="font-bold text-2xl text-foreground md:text-3xl">
                  {content.plans.title}
                </h2>
              </div>
            </div>
          </div>

          <Card className="border-border/50 bg-linear-to-br from-dynamic-blue/5 to-dynamic-purple/5">
            <CardContent className="flex flex-col items-center justify-center p-16">
              <div className="mb-8 rounded-full bg-dynamic-blue/10 p-8 shadow-sm">
                <UserIcon className="h-8 w-8 text-dynamic-blue" />
              </div>
              <h3 className="mb-4 font-semibold text-foreground text-xl">
                {content.plans.loginRequired}
              </h3>
              <p className="mb-6 max-w-md text-center text-foreground/70 text-sm leading-relaxed">
                {content.plans.loginRequiredDescription}
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild>
                  <a href="/login">{content.plans.signIn}</a>
                </Button>
                <Button asChild variant="outline">
                  <a href="/register">{content.plans.createAccount}</a>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}

function FeatureCard({
  feature,
}: {
  feature: MeetTogetherContent['features'][number];
}) {
  const Icon = featureIcons[feature.tone];
  const tone = featureToneClassNames[feature.tone];

  return (
    <div className={`flex items-center gap-3 rounded-lg p-4 ${tone.surface}`}>
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-full ${tone.symbol}`}
      >
        <Icon className={`h-5 w-5 ${tone.icon}`} />
      </div>
      <div className="text-left">
        <p className="font-medium text-foreground text-sm">{feature.title}</p>
        <p className="text-foreground/60 text-xs">{feature.description}</p>
      </div>
    </div>
  );
}
