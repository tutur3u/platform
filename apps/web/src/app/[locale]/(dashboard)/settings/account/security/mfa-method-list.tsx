'use client';

import TOTPDialog from './totp-dialog';
import { Badge } from '@tuturuuu/ui/badge';
import { FileText, KeyRound, Phone, Smartphone } from '@tuturuuu/ui/icons';

const mfaMethods = [
  {
    id: 'authenticator',
    title: 'Authenticator app',
    description:
      'Use an app like Google Authenticator or Authy to generate codes',
    icon: Smartphone,
    status: 'disabled',
    dialog: <TOTPDialog />,
  },
  {
    id: 'phone',
    title: 'Phone number',
    description: 'Receive verification codes via SMS or voice call',
    icon: Phone,
    status: 'coming-soon',
    dialog: null,
  },
  {
    id: 'security-keys',
    title: 'Security keys',
    description: 'Use hardware security keys for authentication',
    icon: KeyRound,
    status: 'coming-soon',
    dialog: null,
  },
  {
    id: 'recovery-codes',
    title: 'Recovery codes',
    description: 'One-time use backup codes for account recovery',
    icon: FileText,
    status: 'coming-soon',
    dialog: null,
  },
];

export default function MFAMethodList() {
  return (
    <div className="flex flex-col gap-4">
      {mfaMethods.map((method) => {
        const IconComponent = method.icon;

        return (
          <div
            key={method.id}
            className="flex items-start gap-3 rounded-lg border border-gray-200 p-4 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800/50"
          >
            <div className="rounded-full bg-gray-100 p-2 dark:bg-gray-800">
              <IconComponent className="h-4 w-4 text-gray-600 dark:text-gray-400" />
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium">{method.title}</h3>
                  {method.status === 'enabled' ? (
                    <Badge
                      variant="secondary"
                      className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    >
                      Enabled
                    </Badge>
                  ) : method.status === 'disabled' ? (
                    <Badge
                      variant="secondary"
                      className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                    >
                      Disabled
                    </Badge>
                  ) : (
                    <Badge
                      variant="secondary"
                      className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                    >
                      Coming soon
                    </Badge>
                  )}
                </div>

                {method.status !== 'coming-soon' && method.dialog}
              </div>
              <p className="text-xs text-muted-foreground">
                {method.description}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
