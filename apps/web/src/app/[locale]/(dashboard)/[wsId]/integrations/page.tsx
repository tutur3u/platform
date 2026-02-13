import { Bot, ExternalLink, Settings } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Integrations',
  description: 'Manage Integrations in your Tuturuuu workspace.',
};

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function IntegrationsPage({ params }: Props) {
  const { wsId: id } = await params;

  const workspace = await getWorkspace(id);
if (!workspace) notFound();
  const wsId = workspace?.id;

  const integrations = [
    {
      id: 'discord',
      name: 'Discord',
      description:
        'Connect your Discord server to enable bot commands and notifications',
      icon: <Bot className="h-8 w-8 text-dynamic-blue" />,
      status: 'available',
      href: `/${wsId}/integrations/discord`,
      features: [
        'Slash commands',
        'Link shortening',
        'Server notifications',
        'Member management',
      ],
      color: 'blue',
    },
    {
      id: 'slack',
      name: 'Slack',
      description:
        'Integrate with Slack for team communication and notifications',
      icon: <Settings className="h-8 w-8 text-dynamic-green" />,
      status: 'coming_soon',
      href: '#',
      features: [
        'Channel notifications',
        'Message forwarding',
        'User synchronization',
        'Custom commands',
      ],
      color: 'green',
    },
    {
      id: 'github',
      name: 'GitHub',
      description:
        'Connect GitHub repositories for automated workflows and updates',
      icon: <ExternalLink className="h-8 w-8 text-dynamic-purple" />,
      status: 'coming_soon',
      href: '#',
      features: [
        'Repository monitoring',
        'Pull request tracking',
        'Issue management',
        'Automated deployments',
      ],
      color: 'purple',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-6 rounded-xl border border-dynamic-border/20 bg-linear-to-r from-dynamic-blue/5 via-dynamic-purple/5 to-dynamic-green/5 p-8">
        <div className="flex items-center justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <div className="rounded-lg bg-linear-to-br from-dynamic-blue/20 to-dynamic-purple/20 p-3 ring-2 ring-dynamic-blue/10">
                <Settings className="size-8 text-dynamic-blue" />
              </div>
              <div>
                <h1 className="bg-linear-to-r from-dynamic-blue to-dynamic-purple bg-clip-text font-bold text-3xl text-transparent">
                  Integrations
                </h1>
                <p className="mt-1 text-base text-dynamic-muted">
                  Connect external services and platforms to extend your
                  workspace capabilities
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Integrations Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {integrations.map((integration) => {
          const colorClasses = {
            blue: 'border-dynamic-blue/20 bg-linear-to-r from-dynamic-blue/5 to-dynamic-purple/5',
            green:
              'border-dynamic-green/20 bg-linear-to-r from-dynamic-green/5 to-dynamic-blue/5',
            purple:
              'border-dynamic-purple/20 bg-linear-to-r from-dynamic-purple/5 to-dynamic-pink/5',
          };

          const iconBgClasses = {
            blue: 'bg-dynamic-blue/10 text-dynamic-blue',
            green: 'bg-dynamic-green/10 text-dynamic-green',
            purple: 'bg-dynamic-purple/10 text-dynamic-purple',
          };

          return (
            <Card
              key={integration.id}
              className={`overflow-hidden transition-all duration-300 hover:shadow-lg ${colorClasses[integration.color as keyof typeof colorClasses]}`}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 border-dynamic-border/20 border-b p-4">
                <CardTitle className="flex items-center gap-2 font-semibold text-base">
                  <div
                    className={`rounded-lg p-1.5 ${iconBgClasses[integration.color as keyof typeof iconBgClasses]}`}
                  >
                    {integration.icon}
                  </div>
                  <div className="line-clamp-1">{integration.name}</div>
                </CardTitle>
                <Badge
                  variant={
                    integration.status === 'available' ? 'default' : 'secondary'
                  }
                  className="ml-2"
                >
                  {integration.status === 'available'
                    ? 'Available'
                    : 'Coming Soon'}
                </Badge>
              </CardHeader>
              <CardContent className="h-full space-y-6 p-6">
                <div className="space-y-4">
                  <p className="text-dynamic-muted-foreground text-sm leading-relaxed">
                    {integration.description}
                  </p>

                  <div>
                    <h4 className="mb-3 font-semibold text-dynamic-foreground text-sm">
                      Features
                    </h4>
                    <div className="space-y-2">
                      {integration.features.map((feature, index) => (
                        <div
                          key={index}
                          className="flex items-center gap-2 rounded-md border border-dynamic-border/10 bg-dynamic-muted/5 p-2"
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
                      <Link href={integration.href}>
                        <Settings className="mr-2 h-4 w-4" />
                        Configure Integration
                      </Link>
                    </Button>
                  ) : (
                    <Button disabled className="w-full">
                      <Settings className="mr-2 h-4 w-4" />
                      Coming Soon
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {integrations.length === 0 && (
        <div className="py-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-dynamic-gray/20 bg-linear-to-br from-dynamic-gray/10 to-dynamic-slate/10">
            <Bot className="h-8 w-8 text-dynamic-gray/60" />
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold text-base text-dynamic-gray">
              No integrations available
            </h3>
            <p className="mx-auto max-w-xs text-dynamic-gray/60 text-sm">
              Check back later for new integration options.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
