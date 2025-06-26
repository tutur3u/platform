'use client';

import { Button } from '@tuturuuu/ui/button';
import {
  Building,
  Check,
  HelpCircle,
  Sparkles,
  X,
  Zap,
} from '@tuturuuu/ui/icons';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

export function PricingSection() {
  const t = useTranslations('landing');

  const plans = [
    {
      name: t('free'),
      icon: <Zap className="h-5 w-5" />,
      price: 0,
      description: t(
        'perfect_for_individuals_just_getting_started_with_ai_scheduling'
      ),
      features: [
        { feature: t('basic_ai_scheduling'), included: true },
        { feature: t('calendar_integration'), included: true },
        { feature: t('3_meetings_per_day'), included: true },
        { feature: t('email_notifications'), included: true },
        { feature: t('focus_time_protection'), included: false },
        { feature: t('team_availability_view'), included: false },
        { feature: t('advanced_ai_features'), included: false },
        { feature: t('unlimited_meetings'), included: false },
        { feature: t('priority_support'), included: false },
      ],
      cta: t('get_started_free'),
      popular: false,
      color: 'gray',
      borderColor: '',
      buttonVariant: 'outline',
    },
    {
      name: t('pro'),
      icon: <Sparkles className="h-5 w-5" />,
      price: 6,
      monthlyPrice: 8,
      description: t(
        'advanced_features_for_professionals_who_value_their_time'
      ),
      features: [
        { feature: t('basic_ai_scheduling'), included: true },
        { feature: t('calendar_integration'), included: true },
        { feature: t('unlimited_meetings'), included: true },
        { feature: t('email_notifications'), included: true },
        { feature: t('focus_time_protection'), included: true },
        { feature: t('team_availability_view'), included: true },
        { feature: t('advanced_ai_features'), included: true },
        { feature: t('unlimited_meetings'), included: true },
        { feature: t('priority_support'), included: true },
      ],
      cta: t('coming_soon'),
      popular: true,
      color: 'purple',
      borderColor: 'border-foreground',
      buttonVariant: 'default',
      bgGradient: 'from-dynamic-light-purple to-dynamic-light-blue',
    },
    {
      name: t('enterprise'),
      icon: <Building className="h-5 w-5" />,
      price: null,
      description: t(
        'powerful_tools_for_teams_to_coordinate_and_optimize_schedules'
      ),
      features: [
        { feature: t('everything_in_pro'), included: true },
        { feature: t('team_calendar_management'), included: true },
        { feature: t('admin_controls'), included: true },
        { feature: t('analytics_dashboard'), included: true },
        { feature: t('api_access'), included: true },
        { feature: t('custom_integrations'), included: true },
        { feature: t('dedicated_support'), included: true },
        { feature: t('sso_advanced_security'), included: true },
        { feature: t('sla_guarantees'), included: true },
      ],
      cta: t('coming_soon'),
      popular: false,
      color: 'blue',
      borderColor: 'border-blue-200',
      buttonVariant: 'default',
      bgGradient: 'from-blue-600 to-blue-700',
    },
  ];

  const sectionRef = useRef<HTMLDivElement>(null);
  const [isAnnual, setIsAnnual] = useState(true);
  const [hoveredFeature, setHoveredFeature] = useState<{
    planName: string;
    featureName: string;
  } | null>(null);

  const featureDescriptions: Record<string, string> = {
    'Basic AI scheduling': 'Schedule tasks and meetings with AI assistance',
    'Calendar integration': 'Connect with Google Calendar',
    'Focus time protection':
      'AI blocks out time for deep work based on your productivity patterns',
    'Team availability view':
      'See when team members are available for meetings',
    'Advanced AI features':
      'Includes workload balancing, priority detection, and smart rescheduling',
    'Tuturuuu meetings':
      'Integrated video conferencing with AI-powered features',
    'Custom AI training':
      "Train the AI on your organization's specific workflows and preferences",
    'SSO & advanced security':
      'Single sign-on and enterprise-grade security features',
    'SLA guarantees':
      'Service level agreements for uptime and support response times',
  };

  return (
    <section
      id="pricing"
      ref={sectionRef}
      className="relative container w-full px-0 py-40"
    >
      <div className="pricing-title-wrapper mb-16 text-center">
        <h2 className="pricing-title mb-6 text-4xl font-bold md:text-5xl">
          <span className="bg-gradient-to-r from-dynamic-light-purple to-dynamic-light-blue bg-clip-text text-transparent">
            {t('simple_transparent_pricing')}
          </span>
        </h2>
        <p className="mx-auto max-w-3xl text-xl leading-relaxed text-muted-foreground">
          {t('choose_the_plan_that_works_best_for_you_and_your_team')}
        </p>

        <div className="pricing-toggle mt-10 flex items-center justify-center">
          <div className="inline-flex rounded-full bg-white/90 p-1.5 shadow-md backdrop-blur-sm dark:bg-foreground/5">
            <button
              type="button"
              className={`relative rounded-full px-6 py-2.5 text-sm font-medium transition-all duration-300 ${
                !isAnnual
                  ? 'bg-gradient-to-r from-dynamic-light-purple to-dynamic-light-blue text-white'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setIsAnnual(false)}
            >
              {t('monthly')}
              {!isAnnual && (
                <div className="absolute inset-0 -z-10 animate-pulse rounded-full bg-gradient-to-r from-dynamic-light-purple/80 to-dynamic-light-blue/80 blur-sm"></div>
              )}
            </button>
            <button
              type="button"
              className={`relative rounded-full px-6 py-2.5 text-sm font-medium transition-all duration-300 ${
                isAnnual
                  ? 'bg-gradient-to-r from-dynamic-light-purple to-dynamic-light-blue text-white'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setIsAnnual(true)}
            >
              {t('annual')}
              {isAnnual && (
                <div className="absolute inset-0 -z-10 animate-pulse rounded-full bg-gradient-to-r from-dynamic-light-purple/80 to-dynamic-light-blue/80 blur-sm"></div>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="pricing-cards-container mx-auto grid max-w-6xl grid-cols-1 gap-8 md:grid-cols-3">
        {plans.map((plan, index) => {
          const price =
            plan.price === null
              ? null
              : isAnnual
                ? plan.price * 12
                : plan.monthlyPrice || plan.price;

          return (
            <div
              key={index}
              className={`pricing-card group relative overflow-hidden rounded-2xl bg-white/90 shadow-lg transition-all duration-500 hover:shadow-xl dark:bg-foreground/5 ${
                plan.popular
                  ? 'transform ring-2 ring-purple-500 md:-translate-y-4'
                  : ''
              }`}
            >
              {plan.popular && (
                <div className="bg-gradient-to-r from-dynamic-light-purple to-dynamic-light-blue py-2 text-center text-sm font-medium text-white">
                  {t('most_popular')}
                </div>
              )}
              <div className="p-8">
                <div className="mb-8 flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                      plan.name === 'Pro'
                        ? 'bg-gradient-to-r from-dynamic-light-purple to-dynamic-light-blue text-white'
                        : plan.name === 'Enterprise'
                          ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white'
                          : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200'
                    }`}
                  >
                    {plan.icon}
                  </div>
                  <h3 className="text-2xl font-bold">{plan.name}</h3>
                </div>

                <p className="mb-8 text-muted-foreground">{plan.description}</p>
                <div className="mb-8">
                  {price === null ? (
                    <span className="text-4xl font-bold">{t('custom')}</span>
                  ) : (
                    <div className="flex items-baseline">
                      <span className="text-5xl font-bold">${price}</span>
                      <span className="ml-2 text-gray-500 lowercase">
                        {isAnnual ? `/${t('year')}` : `/${t('month')}`}
                      </span>
                    </div>
                  )}
                  {plan.name === 'Pro' && isAnnual && (
                    <div className="mt-2 inline-block rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-600 dark:bg-green-900/30 dark:text-green-400">
                      ${(plan.monthlyPrice ?? 0) * 12 - (price ?? 0)}{' '}
                      {t('savings_annually')}
                    </div>
                  )}
                </div>
                <Link
                  href={plan.cta === t('coming_soon') ? '#' : '/onboarding'}
                >
                  <Button
                    className={`mb-8 w-full transition-all duration-300 ${
                      plan.popular
                        ? `bg-gradient-to-r ${plan.bgGradient} text-white hover:shadow-lg hover:shadow-purple-500/20`
                        : plan.name === 'Enterprise'
                          ? `bg-gradient-to-r ${plan.bgGradient} text-white hover:shadow-lg hover:shadow-blue-500/20`
                          : 'hover:shadow-lg hover:shadow-gray-200/50'
                    }`}
                    variant={
                      plan.buttonVariant as
                        | 'default'
                        | 'outline'
                        | 'secondary'
                        | 'ghost'
                        | 'link'
                        | undefined
                    }
                    size="lg"
                    disabled={plan.cta === t('coming_soon')}
                  >
                    {plan.cta}
                  </Button>
                </Link>
                <div className="space-y-4">
                  <div className="mb-4 font-medium text-muted-foreground">
                    {t('features_include')}:
                  </div>
                  {plan.features.map((feature, i) => (
                    <button
                      type="button"
                      key={i}
                      className="flex items-center gap-4 py-2 transition-all duration-300"
                      onMouseEnter={() =>
                        setHoveredFeature({
                          planName: plan.name,
                          featureName: feature.feature,
                        })
                      }
                      onMouseLeave={() => setHoveredFeature(null)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setHoveredFeature({
                            planName: plan.name,
                            featureName: feature.feature,
                          });
                        }
                      }}
                    >
                      {feature.included ? (
                        <div
                          className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full ${
                            plan.name === 'Pro'
                              ? 'bg-purple-100 text-dynamic-light-purple dark:bg-purple-900/30 dark:text-purple-400'
                              : plan.name === 'Enterprise'
                                ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                                : 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                          }`}
                        >
                          <Check className="h-3 w-3" />
                        </div>
                      ) : (
                        <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-400 dark:bg-gray-800">
                          <X className="h-3 w-3" />
                        </div>
                      )}
                      <span
                        className={`text-sm ${feature.included ? 'text-foreground' : 'text-gray-400'}`}
                      >
                        {feature.feature}
                      </span>
                      {featureDescriptions[feature.feature] && (
                        <div className="relative ml-1">
                          <HelpCircle className="h-3.5 w-3.5 cursor-help text-gray-400 transition-colors duration-200 group-hover/feature:text-gray-600" />
                          {hoveredFeature &&
                            hoveredFeature.planName === plan.name &&
                            hoveredFeature.featureName === feature.feature && (
                              <div className="absolute bottom-full left-1/2 z-10 mb-2 w-64 -translate-x-1/2 transform rounded-lg bg-gray-800 p-3 text-xs leading-relaxed text-white shadow-lg">
                                {featureDescriptions[feature.feature]}
                                <div className="absolute top-full left-1/2 -translate-x-1/2 transform border-4 border-transparent border-t-gray-800"></div>
                              </div>
                            )}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
