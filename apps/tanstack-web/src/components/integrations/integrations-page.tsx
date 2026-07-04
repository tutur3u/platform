import {
  Bot,
  ExternalLink,
  type LucideIcon,
  Settings,
} from '@tuturuuu/icons/lucide';
import { Alert, AlertDescription, AlertTitle } from '@tuturuuu/ui/alert';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import type { AppMessages } from '../../lib/platform/messages';

type IntegrationsSearch = {
  reason?: string;
  sepay?: 'connected' | 'error';
};

type IntegrationTone = 'blue' | 'green' | 'purple';

type IntegrationCard = {
  description: string;
  features: string[];
  href: string;
  icon: LucideIcon;
  id: string;
  name: string;
  status: 'available' | 'coming_soon';
  tone: IntegrationTone;
};

const cardToneClasses: Record<IntegrationTone, string> = {
  blue: 'border-dynamic-blue/20 bg-linear-to-r from-dynamic-blue/5 to-dynamic-purple/5',
  green:
    'border-dynamic-green/20 bg-linear-to-r from-dynamic-green/5 to-dynamic-blue/5',
  purple:
    'border-dynamic-purple/20 bg-linear-to-r from-dynamic-purple/5 to-dynamic-pink/5',
};

const iconToneClasses: Record<IntegrationTone, string> = {
  blue: 'bg-dynamic-blue/10 text-dynamic-blue',
  green: 'bg-dynamic-green/10 text-dynamic-green',
  purple: 'bg-dynamic-purple/10 text-dynamic-purple',
};

export function IntegrationsPage({
  messages,
  search,
  workspaceId,
}: {
  messages: Pick<AppMessages, 'integrations-page'>;
  search: IntegrationsSearch;
  workspaceId: string;
}) {
  const copy = messages['integrations-page'];
  const integrations: IntegrationCard[] = [
    {
      description: copy.cards.discord.description,
      features: copy.cards.discord.features,
      href: `/${workspaceId}/integrations/discord`,
      icon: Bot,
      id: 'discord',
      name: copy.cards.discord.name,
      status: 'available',
      tone: 'blue',
    },
    {
      description: copy.cards.slack.description,
      features: copy.cards.slack.features,
      href: '#',
      icon: Settings,
      id: 'slack',
      name: copy.cards.slack.name,
      status: 'coming_soon',
      tone: 'green',
    },
    {
      description: copy.cards.github.description,
      features: copy.cards.github.features,
      href: '#',
      icon: ExternalLink,
      id: 'github',
      name: copy.cards.github.name,
      status: 'coming_soon',
      tone: 'purple',
    },
  ];

  return (
    <div className="space-y-6">
      <SepayConnectionAlert copy={copy} search={search} />

      <div className="space-y-6 rounded-xl border border-dynamic-border/20 bg-linear-to-r from-dynamic-blue/5 via-dynamic-purple/5 to-dynamic-green/5 p-8">
        <div className="flex items-center justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <div className="rounded-lg bg-linear-to-br from-dynamic-blue/20 to-dynamic-purple/20 p-3 ring-2 ring-dynamic-blue/10">
                <Settings className="size-8 text-dynamic-blue" />
              </div>
              <div>
                <h1 className="bg-linear-to-r from-dynamic-blue to-dynamic-purple bg-clip-text font-bold text-3xl text-transparent">
                  {copy.title}
                </h1>
                <p className="mt-1 text-base text-dynamic-muted">
                  {copy.description}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {integrations.map((integration) => (
          <IntegrationCard
            copy={copy}
            integration={integration}
            key={integration.id}
          />
        ))}
      </div>

      {integrations.length === 0 ? (
        <EmptyIntegrationsState copy={copy} />
      ) : null}
    </div>
  );
}

function SepayConnectionAlert({
  copy,
  search,
}: {
  copy: AppMessages['integrations-page'];
  search: IntegrationsSearch;
}) {
  if (search.sepay === 'connected') {
    return (
      <Alert>
        <AlertTitle>{copy['sepay-connected-title']}</AlertTitle>
        <AlertDescription>
          {copy['sepay-connected-description']}
        </AlertDescription>
      </Alert>
    );
  }

  if (search.sepay !== 'error') {
    return null;
  }

  return (
    <Alert>
      <AlertTitle>{copy['sepay-error-title']}</AlertTitle>
      <AlertDescription>
        {search.reason === 'post_connect_provisioning_failed'
          ? copy['sepay-error-provisioning-description']
          : copy['sepay-error-description']}
      </AlertDescription>
    </Alert>
  );
}

function IntegrationCard({
  copy,
  integration,
}: {
  copy: AppMessages['integrations-page'];
  integration: IntegrationCard;
}) {
  const Icon = integration.icon;

  return (
    <Card
      className={`overflow-hidden transition-all duration-300 hover:shadow-lg ${cardToneClasses[integration.tone]}`}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 border-dynamic-border/20 border-b p-4">
        <CardTitle className="flex items-center gap-2 font-semibold text-base">
          <div
            className={`rounded-lg p-1.5 ${iconToneClasses[integration.tone]}`}
          >
            <Icon className="h-8 w-8" />
          </div>
          <div className="line-clamp-1">{integration.name}</div>
        </CardTitle>
        <Badge
          className="ml-2"
          variant={integration.status === 'available' ? 'default' : 'secondary'}
        >
          {integration.status === 'available'
            ? copy.status.available
            : copy.status.comingSoon}
        </Badge>
      </CardHeader>
      <CardContent className="h-full space-y-6 p-6">
        <div className="space-y-4">
          <p className="text-dynamic-muted-foreground text-sm leading-relaxed">
            {integration.description}
          </p>

          <div>
            <h4 className="mb-3 font-semibold text-dynamic-foreground text-sm">
              {copy.features}
            </h4>
            <div className="space-y-2">
              {integration.features.map((feature) => (
                <div
                  className="flex items-center gap-2 rounded-md border border-dynamic-border/10 bg-dynamic-muted/5 p-2"
                  key={feature}
                >
                  <div className="size-1.5 rounded-full bg-dynamic-blue" />
                  <span className="text-dynamic-muted-foreground text-sm">
                    {feature}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="pt-2">
          {integration.status === 'available' ? (
            <Button
              asChild
              className="w-full transition-all duration-200 hover:scale-[1.02]"
            >
              <a href={integration.href}>
                <Settings className="mr-2 h-4 w-4" />
                {copy.actions.configure}
              </a>
            </Button>
          ) : (
            <Button className="w-full" disabled>
              <Settings className="mr-2 h-4 w-4" />
              {copy.actions.comingSoon}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyIntegrationsState({
  copy,
}: {
  copy: AppMessages['integrations-page'];
}) {
  return (
    <div className="py-12 text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-dynamic-gray/20 bg-linear-to-br from-dynamic-gray/10 to-dynamic-slate/10">
        <Bot className="h-8 w-8 text-dynamic-gray/60" />
      </div>
      <div className="space-y-2">
        <h3 className="font-semibold text-base text-dynamic-gray">
          {copy.empty.title}
        </h3>
        <p className="mx-auto max-w-xs text-dynamic-gray/60 text-sm">
          {copy.empty.description}
        </p>
      </div>
    </div>
  );
}
