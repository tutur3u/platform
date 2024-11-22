'use client';

import { cn } from '@/lib/utils';
import { Button } from '@repo/ui/components/ui/button';
import { Card } from '@repo/ui/components/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@repo/ui/components/ui/tooltip';
import { Check, HelpCircle } from 'lucide-react';

const plans = [
  {
    name: 'Free',
    description: 'For individuals and small teams getting started.',
    price: 'Coming Soon',
    features: [
      'Up to 3 team members',
      '5GB storage',
      'Basic AI features',
      'Email support',
      'Community access',
    ],
    limits: {
      storage: '5GB',
      users: '3',
      aiCredits: '100/month',
    },
    cta: 'Get Started',
    popular: false,
  },
  {
    name: 'Pro',
    description: 'For growing teams that need more.',
    price: 'Coming Soon',
    features: [
      'Up to 10 team members',
      '50GB storage',
      'Advanced AI features',
      'Priority support',
      'API access',
      'Custom integrations',
    ],
    limits: {
      storage: '50GB',
      users: '10',
      aiCredits: '1000/month',
    },
    cta: 'Start Trial',
    popular: true,
  },
  {
    name: 'Business',
    description: 'For organizations that need enhanced security.',
    price: 'Coming Soon',
    features: [
      'Up to 50 team members',
      '500GB storage',
      'Enterprise AI features',
      '24/7 support',
      'SSO & SAML',
      'Advanced analytics',
      'Custom training',
    ],
    limits: {
      storage: '500GB',
      users: '50',
      aiCredits: 'Unlimited',
    },
    cta: 'Contact Sales',
    popular: false,
  },
  {
    name: 'Enterprise',
    description: 'Custom solutions for large organizations.',
    price: 'Contact Us',
    features: [
      'Unlimited team members',
      'Custom storage',
      'Custom AI models',
      'Dedicated support',
      'Custom contracts',
      'On-premise options',
      'SLA guarantee',
    ],
    limits: {
      storage: 'Custom',
      users: 'Unlimited',
      aiCredits: 'Custom',
    },
    cta: 'Contact Sales',
    popular: false,
  },
];

export default function PricingPage() {
  return (
    <div className="container mx-auto mt-8 flex max-w-6xl flex-col gap-6 px-3 py-16 lg:gap-14 lg:py-24">
      <div className="mb-16 text-center">
        <h1 className="mb-4 text-4xl font-bold">Usage-Based Pricing</h1>
        <p className="text-muted-foreground mx-auto max-w-2xl text-lg">
          Pay only for what you use. All plans include core features with
          different usage limits.
        </p>
      </div>

      <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
        {plans.map((plan) => (
          <Card
            key={plan.name}
            className={cn('p-6', plan.popular && 'border-primary')}
          >
            <div className="mb-4 space-y-2">
              {plan.popular && (
                <span className="bg-primary text-primary-foreground inline-block rounded-full px-3 py-1 text-xs font-semibold">
                  Most Popular
                </span>
              )}
              <h2 className="text-2xl font-bold">{plan.name}</h2>
              <p className="text-muted-foreground min-h-[48px] text-sm">
                {plan.description}
              </p>
            </div>

            <div className="mb-6">
              <div className="mb-1 text-2xl font-bold">{plan.price}</div>
              <div className="text-muted-foreground text-sm">
                Usage-based pricing
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <div className="text-sm font-semibold">Usage Limits</div>
                <div className="text-muted-foreground grid gap-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span>Storage</span>
                    <span>{plan.limits.storage}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Team Members</span>
                    <span>{plan.limits.users}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      AI Credits
                      <Tooltip>
                        <TooltipTrigger>
                          <HelpCircle className="h-4 w-4" />
                        </TooltipTrigger>
                        <TooltipContent>
                          Credits used for AI features like document processing
                          and automation
                        </TooltipContent>
                      </Tooltip>
                    </span>
                    <span>{plan.limits.aiCredits}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-semibold">Features</div>
                <ul className="text-muted-foreground space-y-2 text-sm">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2">
                      <Check className="text-primary h-4 w-4" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>

              <Button
                className="w-full"
                variant={plan.popular ? 'default' : 'outline'}
                disabled
              >
                {/* {plan.cta} */}
                Coming Soon
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
