'use client';

import TOTPDialog from './totp-dialog';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Badge } from '@tuturuuu/ui/badge';
import { FileText, KeyRound, Phone, Smartphone } from '@tuturuuu/ui/icons';
import { useEffect, useState } from 'react';

type MFAStatus = 'enabled' | 'disabled' | 'coming-soon';

interface MFAMethod {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<any>;
  status: MFAStatus;
  dialog: React.ReactNode;
}

const defaultMfaMethods: MFAMethod[] = [
  {
    id: 'authenticator',
    title: 'Authenticator app',
    description:
      'Use an app like Google Authenticator or Authy to generate codes',
    icon: Smartphone,
    status: 'coming-soon',
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
  const [mfaMethods, setMfaMethods] = useState<MFAMethod[]>(defaultMfaMethods);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const fetchMFAFactors = async () => {
      try {
        const { data: factors, error } = await supabase.auth.mfa.listFactors();

        if (error) {
          console.error('Error fetching MFA factors:', error);
          setLoading(false);
          return;
        }

        // Update the authenticator method status based on enrolled factors
        const totpFactor = factors?.totp?.find(
          (factor) => factor.status === 'verified'
        );

        setMfaMethods((prev) =>
          prev.map((method) => {
            if (method.id === 'authenticator') {
              return {
                ...method,
                status: totpFactor ? 'enabled' : ('disabled' as MFAStatus),
              };
            }
            return method;
          })
        );
      } catch (error) {
        console.error('Error fetching MFA factors:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMFAFactors();
  }, [supabase.auth]);

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="flex animate-pulse items-start gap-3 rounded-lg border border-gray-200 p-4 dark:border-gray-700"
          >
            <div className="h-8 w-8 rounded-full bg-gray-200 p-2 dark:bg-gray-700" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/3 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="h-3 w-2/3 rounded bg-gray-200 dark:bg-gray-700" />
            </div>
          </div>
        ))}
      </div>
    );
  }

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
