'use client';

import { KeyRound } from '@tuturuuu/icons';
import type { MobileDeploymentState } from '@tuturuuu/internal-api/infrastructure/mobile';
import { Alert, AlertDescription, AlertTitle } from '@tuturuuu/ui/alert';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { useTranslations } from 'next-intl';
import { MobileDeploymentFieldHelp } from './mobile-deployment-field-help';

export function MobileDeploymentTokensPanel({
  issuedToken,
  issuePending,
  onIssueToken,
  onRevokeToken,
  onTokenNameChange,
  revokePending,
  tokenName,
  tokens,
}: {
  issuedToken: string | null;
  issuePending: boolean;
  onIssueToken: () => void;
  onRevokeToken: (tokenId: string) => void;
  onTokenNameChange: (value: string) => void;
  revokePending: boolean;
  tokenName: string;
  tokens: MobileDeploymentState['tokens'];
}) {
  const t = useTranslations('mobile-deployment-settings');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('tokensTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {issuedToken && (
          <Alert>
            <KeyRound className="h-4 w-4" />
            <AlertTitle>{t('tokenIssued')}</AlertTitle>
            <AlertDescription className="break-all font-mono text-xs">
              {issuedToken}
            </AlertDescription>
          </Alert>
        )}
        <div className="flex flex-col gap-2 md:flex-row md:items-end">
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="mobile-deployment-token-name">{t('name')}</Label>
              <MobileDeploymentFieldHelp field="CI_TOKEN_NAME" />
            </div>
            <Input
              id="mobile-deployment-token-name"
              onChange={(event) => onTokenNameChange(event.target.value)}
              value={tokenName}
            />
          </div>
          <Button
            disabled={!tokenName.trim() || issuePending}
            onClick={onIssueToken}
          >
            <KeyRound className="mr-2 h-4 w-4" />
            {t('issueToken')}
          </Button>
        </div>

        <div className="grid gap-2">
          {tokens.map((token) => (
            <div
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm"
              key={token.id}
            >
              <div>
                <div className="font-medium">{token.name}</div>
                <div className="text-muted-foreground text-xs">
                  {token.prefix}...{token.lastFour}
                </div>
              </div>
              <Button
                disabled={Boolean(token.revokedAt) || revokePending}
                onClick={() => onRevokeToken(token.id)}
                size="sm"
                variant="outline"
              >
                {t('revoke')}
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
