import { Blocks, Clock, Database, Mail, Users } from './navigation-cards';
import { createElement } from 'react';

const iconClassName = 'h-5 w-5 text-primary';

export async function getInfrastructureNavigationLinks({
  wsId,
}: {
  wsId: string;
  personalOrWsId: string;
  isPersonal: boolean;
  isTuturuuuUser: boolean;
}) {
  return [
    {
      description: 'Runtime telemetry, deploys, cron health, and logs.',
      href: `/${wsId}/monitoring`,
      icon: createElement(Clock, { className: iconClassName }),
      title: 'Monitoring',
    },
    {
      description: 'Migration tools for workspace and platform data.',
      href: `/${wsId}/migrations`,
      icon: createElement(Database, { className: iconClassName }),
      title: 'Migrations',
    },
    {
      description: 'AI models, agents, whitelists, and gateway controls.',
      href: `/${wsId}/ai-agents`,
      icon: createElement(Blocks, { className: iconClassName }),
      title: 'AI Operations',
    },
    {
      description: 'Email audit, templates, queues, and blacklist controls.',
      href: `/${wsId}/email-audit`,
      icon: createElement(Mail, { className: iconClassName }),
      title: 'Email',
    },
    {
      description: 'Users, workspaces, auth recovery, and platform limits.',
      href: `/${wsId}/users`,
      icon: createElement(Users, { className: iconClassName }),
      title: 'Platform Admin',
    },
  ];
}
