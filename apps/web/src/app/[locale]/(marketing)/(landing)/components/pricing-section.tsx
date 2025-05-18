'use client';

import { Button } from '@tuturuuu/ui/button';
import { ScrollTrigger, gsap } from '@tuturuuu/ui/gsap';
import {
  Building,
  Check,
  HelpCircle,
  Shield,
  Sparkles,
  X,
  Zap,
} from '@tuturuuu/ui/icons';
import { useEffect, useRef, useState } from 'react';

gsap.registerPlugin(ScrollTrigger);

const plans = [
  {
    name: 'Free',
    icon: <Zap className="h-5 w-5" />,
    price: 0,
    description:
      'Perfect for individuals just getting started with AI scheduling.',
    features: [
      { feature: 'Basic AI scheduling', included: true },
      { feature: 'Calendar integration', included: true },
      { feature: '5 meetings per day', included: true },
      { feature: 'Email notifications', included: true },
      { feature: 'Mobile app access', included: true },
      { feature: 'Focus time protection', included: false },
      { feature: 'Team availability view', included: false },
      { feature: 'Advanced AI features', included: false },
      { feature: 'Unlimited meetings', included: false },
      { feature: 'Priority support', included: false },
    ],
    cta: 'Get Started Free',
    popular: false,
    color: 'gray',
    borderColor: 'border-gray-200',
    buttonVariant: 'outline',
  },
  {
    name: 'Pro',
    icon: <Sparkles className="h-5 w-5" />,
    price: 6,
    monthlyPrice: 8,
    description: 'Advanced features for professionals who value their time.',
    features: [
      { feature: 'Basic AI scheduling', included: true },
      { feature: 'Calendar integration', included: true },
      { feature: 'Unlimited meetings', included: true },
      { feature: 'Email notifications', included: true },
      { feature: 'Mobile app access', included: true },
      { feature: 'Focus time protection', included: true },
      { feature: 'Team availability view', included: true },
      { feature: 'Advanced AI features', included: true },
      { feature: 'Tuturuuu meetings', included: true },
      { feature: 'Priority support', included: true },
    ],
    cta: 'Get Pro',
    popular: true,
    color: 'purple',
    borderColor: 'border-purple-200',
    buttonVariant: 'default',
    bgGradient: 'from-purple-600 to-blue-500',
  },
  {
    name: 'Enterprise',
    icon: <Building className="h-5 w-5" />,
    price: null,
    description:
      'Powerful tools for teams to coordinate and optimize schedules.',
    features: [
      { feature: 'Everything in Pro', included: true },
      { feature: 'Team calendar management', included: true },
      { feature: 'Admin controls', included: true },
      { feature: 'Analytics dashboard', included: true },
      { feature: 'API access', included: true },
      { feature: 'Custom integrations', included: true },
      { feature: 'Dedicated support', included: true },
      { feature: 'SSO & advanced security', included: true },
      { feature: 'Custom AI training', included: true },
      { feature: 'SLA guarantees', included: true },
    ],
    cta: 'Contact Sales',
    popular: false,
    color: 'blue',
    borderColor: 'border-blue-200',
    buttonVariant: 'default',
    bgGradient: 'from-blue-600 to-blue-700',
  },
];

export function PricingSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [isAnnual, setIsAnnual] = useState(true);
  const [hoveredFeature, setHoveredFeature] = useState<string | null>(null);

  useEffect(() => {
    if (!sectionRef.current) return;

    gsap.from('.pricing-title-wrapper', {
      y: 50,
      opacity: 0,
      duration: 0.8,
      scrollTrigger: {
        trigger: '.pricing-title-wrapper',
        start: 'top bottom-=100',
        toggleActions: 'play none none none',
      },
    });

    // Animate toggle
    gsap.from('.pricing-toggle', {
      scale: 0.9,
      opacity: 0,
      duration: 0.5,
      delay: 0.3,
      scrollTrigger: {
        trigger: '.pricing-title-wrapper',
        start: 'top bottom-=100',
      },
    });

    // Cards staggered animation
    const pricingCards = gsap.utils.toArray('.pricing-card') as Element[];
    gsap.from(pricingCards, {
      y: 40,
      opacity: 0,
      scale: 0.95,
      duration: 0.8,
      stagger: 0.15,
      ease: 'back.out(1.2)',
      scrollTrigger: {
        trigger: '.pricing-cards-container',
        start: 'top bottom-=50',
      },
    });

    return () => {
      ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
    };
  }, []);

  const featureDescriptions: Record<string, string> = {
    'Basic AI scheduling': 'Schedule tasks and meetings with AI assistance',
    'Calendar integration':
      'Connect with Google Calendar, Outlook, and Apple Calendar',
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
      className="relative w-full overflow-hidden py-24 md:py-40"
    >
      {/* Background decorations */}
      <div className="bg-dynamic-light-blue/10 absolute -top-40 right-0 h-96 w-96 rounded-full blur-3xl filter"></div>
      <div className="bg-dynamic-light-purple/10 absolute -bottom-40 -left-20 h-96 w-96 rounded-full blur-3xl filter"></div>
      <div className="container mx-auto px-4">
        <div className="pricing-title-wrapper mb-16 text-center">
          <h2 className="pricing-title mb-6 text-4xl font-bold md:text-5xl">
            <span className="bg-gradient-to-r from-purple-600 to-blue-500 bg-clip-text text-transparent">
              Simple, Transparent Pricing
            </span>
          </h2>
          <p className="text-muted-foreground mx-auto max-w-3xl text-xl leading-relaxed">
            Choose the plan that works best for you and your team.
          </p>

          <div className="pricing-toggle mt-10 flex items-center justify-center">
            <div className="dark:bg-foreground/5 inline-flex rounded-full bg-white/90 p-1.5 shadow-md backdrop-blur-sm">
              <button
                className={`relative rounded-full px-6 py-2.5 text-sm font-medium transition-all duration-300 ${
                  !isAnnual
                    ? 'bg-gradient-to-r from-purple-600 to-blue-500 text-white'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setIsAnnual(false)}
              >
                Monthly
                {!isAnnual && (
                  <div className="absolute inset-0 -z-10 animate-pulse rounded-full bg-gradient-to-r from-purple-600/80 to-blue-500/80 blur-sm"></div>
                )}
              </button>
              <button
                className={`relative rounded-full px-6 py-2.5 text-sm font-medium transition-all duration-300 ${
                  isAnnual
                    ? 'bg-gradient-to-r from-purple-600 to-blue-500 text-white'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setIsAnnual(true)}
              >
                Annual
                {isAnnual && (
                  <div className="absolute inset-0 -z-10 animate-pulse rounded-full bg-gradient-to-r from-purple-600/80 to-blue-500/80 blur-sm"></div>
                )}
                <span className="ml-1 rounded-full bg-green-500/20 px-2 py-0.5 text-xs font-semibold text-green-600">
                  Save 25%
                </span>
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
                className={`pricing-card dark:bg-foreground/5 group relative overflow-hidden rounded-2xl bg-white/90 shadow-lg transition-all duration-500 hover:shadow-xl ${
                  plan.popular
                    ? 'transform ring-2 ring-purple-500 md:-translate-y-4'
                    : ''
                }`}
              >
                {plan.popular && (
                  <div className="bg-gradient-to-r from-purple-600 to-blue-500 py-2 text-center text-sm font-medium text-white">
                    Most Popular
                  </div>
                )}
                <div className="p-8">
                  <div className="mb-8 flex items-center gap-3">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                        plan.name === 'Pro'
                          ? 'bg-gradient-to-r from-purple-600 to-blue-500 text-white'
                          : plan.name === 'Enterprise'
                            ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white'
                            : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200'
                      }`}
                    >
                      {plan.icon}
                    </div>
                    <h3 className="text-2xl font-bold">{plan.name}</h3>
                  </div>

                  <p className="text-muted-foreground mb-8">
                    {plan.description}
                  </p>
                  <div className="mb-8">
                    {price === null ? (
                      <span className="text-4xl font-bold">Custom</span>
                    ) : (
                      <div className="flex items-baseline">
                        <span className="text-5xl font-bold">${price}</span>
                        <span className="ml-2 text-gray-500">
                          {isAnnual ? '/year' : '/month'}
                        </span>
                      </div>
                    )}
                    {plan.name === 'Pro' && isAnnual && (
                      <div className="mt-2 inline-block rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-600 dark:bg-green-900/30 dark:text-green-400">
                        ${plan.monthlyPrice! * 12 - price!} savings annually
                      </div>
                    )}
                  </div>
                  <Button
                    className={`mb-8 w-full transition-all duration-300 ${
                      plan.popular
                        ? `bg-gradient-to-r ${plan.bgGradient} text-white hover:shadow-lg hover:shadow-purple-500/20`
                        : plan.name === 'Enterprise'
                          ? `bg-gradient-to-r ${plan.bgGradient} text-white hover:shadow-lg hover:shadow-blue-500/20`
                          : 'hover:shadow-lg hover:shadow-gray-200/50'
                    }`}
                    variant={plan.buttonVariant as any}
                    size="lg"
                  >
                    {plan.cta}
                  </Button>
                  <div className="space-y-4">
                    <div className="text-muted-foreground mb-4 font-medium">
                      Features include:
                    </div>
                    {plan.features.map((feature, i) => (
                      <div
                        key={i}
                        className="group/feature relative flex items-start gap-3"
                        onMouseEnter={() => setHoveredFeature(feature.feature)}
                        onMouseLeave={() => setHoveredFeature(null)}
                      >
                        {feature.included ? (
                          <div
                            className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full ${
                              plan.name === 'Pro'
                                ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400'
                                : plan.name === 'Enterprise'
                                  ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                                  : 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                            }`}
                          >
                            <Check className="h-3 w-3" />
                          </div>
                        ) : (
                          <div className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-400 dark:bg-gray-800">
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
                            {hoveredFeature === feature.feature && (
                              <div className="absolute bottom-full left-1/2 z-10 mb-2 w-64 -translate-x-1/2 transform rounded-lg bg-gray-800 p-3 text-xs leading-relaxed text-white shadow-lg">
                                {featureDescriptions[feature.feature]}
                                <div className="absolute left-1/2 top-full -translate-x-1/2 transform border-4 border-transparent border-t-gray-800"></div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="dark:bg-foreground/5 mt-16 flex flex-col items-center justify-center rounded-xl bg-white/80 p-8 shadow-lg backdrop-blur-sm">
          <Shield className="mb-4 h-12 w-12 text-blue-500" />
          <h3 className="mb-2 text-2xl font-bold">
            Enterprise Security & Compliance
          </h3>
          <p className="text-muted-foreground max-w-2xl text-center">
            All plans include industry-standard security measures. Enterprise
            customers receive additional compliance features, dedicated support,
            and custom security configurations.
          </p>
        </div>
      </div>
    </section>
  );
}
