import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Bot } from '@tuturuuu/ui/icons';
import { Separator } from '@tuturuuu/ui/separator';
import Link from 'next/link';

interface Props {
  params: Promise<{
    wsId: string;
  }>;
}

export default async function IntegrationsPage({ params }: Props) {
  const { wsId } = await params;

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
    },
  ];

  return (
    <div className="container mx-auto max-w-7xl space-y-6">
      <FeatureSummary
        title="Integrations"
        description="Connect external services and platforms to extend your workspace capabilities"
      />

      <Separator className="my-6" />

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {integrations.map((integration) => (
          <Card key={integration.id} className="relative">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {integration.icon}
                  <div>
                    <CardTitle className="text-lg">
                      {integration.name}
                    </CardTitle>
                    <Badge
                      variant={
                        integration.status === 'available'
                          ? 'default'
                          : 'secondary'
                      }
                      className="mt-1"
                    >
                      {integration.status === 'available'
                        ? 'Available'
                        : 'Coming Soon'}
                    </Badge>
                  </div>
                </div>
              </div>
              <CardDescription className="mt-2">
                {integration.description}
              </CardDescription>
            </CardHeader>

            <CardContent>
              <div className="space-y-3">
                <div>
                  <h4 className="mb-2 font-medium text-dynamic-muted-foreground text-sm">
                    Features
                  </h4>
                  <ul className="space-y-1">
                    {integration.features.map((feature, index) => (
                      <li
                        key={index}
                        className="text-dynamic-muted-foreground text-sm"
                      >
                        • {feature}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex gap-2 pt-2">
                  {integration.status === 'available' ? (
                    <Button asChild className="flex-1">
                      <Link href={integration.href}>Configure</Link>
                    </Button>
                  ) : (
                    <Button disabled className="flex-1">
                      Coming Soon
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {integrations.length === 0 && (
        <div className="py-12 text-center">
          <Bot className="mx-auto mb-4 h-12 w-12 text-dynamic-muted-foreground" />
          <h3 className="mb-2 font-medium text-dynamic-muted-foreground text-lg">
            No integrations available
          </h3>
          <p className="text-dynamic-muted-foreground">
            Check back later for new integration options.
          </p>
        </div>
      )}
    </div>
  );
}
