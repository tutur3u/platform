import { KeyRound, ShieldCheck } from '@tuturuuu/icons';
import { Alert, AlertDescription, AlertTitle } from '@tuturuuu/ui/alert';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Switch } from '@tuturuuu/ui/switch';
import { Textarea } from '@tuturuuu/ui/textarea';
import { connection } from 'next/server';
import { getGitAppConfigurationStatus } from '@/lib/github/credentials';
import {
  saveConfigurationAction,
  validateConfigurationAction,
} from '../admin-actions';

export default async function GitHubAppPage({
  params,
  searchParams,
}: {
  params: Promise<{ wsId: string }>;
  searchParams: Promise<{ error?: string; saved?: string; validated?: string }>;
}) {
  await connection();
  const [{ wsId }, query, configuration] = await Promise.all([
    params,
    searchParams,
    getGitAppConfigurationStatus(),
  ]);

  return (
    <div className="space-y-6 p-1">
      <header className="space-y-2">
        <p className="font-mono text-muted-foreground text-xs uppercase tracking-[0.2em]">
          Tuturuuu Git
        </p>
        <h1 className="font-semibold text-2xl tracking-tight">
          GitHub App credentials
        </h1>
        <p className="max-w-2xl text-muted-foreground text-sm">
          The private key is envelope encrypted and is never returned after
          saving.
        </p>
      </header>
      {query.error && (
        <Alert variant="destructive">
          <AlertTitle>Configuration failed</AlertTitle>
          <AlertDescription>{query.error}</AlertDescription>
        </Alert>
      )}
      {(query.saved || query.validated) && (
        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>
            {query.validated ? 'Connection verified' : 'Configuration saved'}
          </AlertTitle>
          <AlertDescription>
            {query.validated
              ? 'The GitHub App can read tutur3u/platform.'
              : 'Run validation before enabling public installation-backed requests.'}
          </AlertDescription>
        </Alert>
      )}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              Dedicated Tuturuuu Git App
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form
              action={saveConfigurationAction.bind(null, wsId)}
              className="space-y-5"
            >
              <div className="grid gap-5 md:grid-cols-2">
                <Field label="GitHub App ID" name="appId">
                  <Input
                    defaultValue={configuration.appId}
                    inputMode="numeric"
                    name="appId"
                    required
                  />
                </Field>
                <Field label="Installation ID" name="installationId">
                  <Input
                    defaultValue={configuration.installationId}
                    inputMode="numeric"
                    name="installationId"
                    required
                  />
                </Field>
              </div>
              <Field
                label={
                  configuration.privateKeyConfigured
                    ? 'Replace private key'
                    : 'Private key'
                }
                name="privateKey"
              >
                <Textarea
                  autoComplete="off"
                  className="min-h-40 font-mono text-xs"
                  name="privateKey"
                  placeholder="-----BEGIN PRIVATE KEY-----"
                  required={!configuration.privateKeyConfigured}
                  spellCheck={false}
                />
              </Field>
              <div className="flex items-center gap-3 rounded-lg border p-4">
                <Switch
                  defaultChecked={configuration.enabled}
                  id="enabled"
                  name="enabled"
                />
                <div>
                  <Label htmlFor="enabled">
                    Use installation authentication
                  </Label>
                  <p className="text-muted-foreground text-xs">
                    Falls back to public GitHub access while disabled.
                  </p>
                </div>
              </div>
              <Button type="submit">Save encrypted configuration</Button>
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <StatusRow
              label="Enabled"
              value={configuration.enabled ? 'Yes' : 'No'}
            />
            <StatusRow
              label="Private key"
              value={
                configuration.privateKeyConfigured ? 'Configured' : 'Missing'
              }
            />
            <StatusRow
              label="Fingerprint"
              value={configuration.privateKeyFingerprint?.slice(0, 12) ?? '—'}
            />
            <StatusRow
              label="Last validated"
              value={
                configuration.lastValidatedAt
                  ? new Date(configuration.lastValidatedAt).toLocaleString()
                  : 'Never'
              }
            />
            <form action={validateConfigurationAction.bind(null, wsId)}>
              <Button className="w-full" type="submit" variant="outline">
                Validate against tutur3u/platform
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({
  children,
  label,
  name,
}: {
  children: React.ReactNode;
  label: string;
  name: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      {children}
    </div>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b pb-3 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <code className="text-xs">{value}</code>
    </div>
  );
}
