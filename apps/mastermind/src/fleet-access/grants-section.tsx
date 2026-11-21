import type {
  FleetOwnerGrant,
  FleetOwnerProject,
} from '@tuturuuu/internal-api/fleet';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { SettingsSectionMessage } from '@tuturuuu/ui/custom/settings-section';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import { useState } from 'react';
import { toneBadge } from '../components/tone';
import type { Locale } from '../i18n';
import { GrantForm } from './grant-form';
import {
  emptyGrantDraft,
  type GrantDraft,
  grantDraftOf,
  grantStatusTone,
} from './owner-model';
import {
  ChangeNotice,
  ConfirmDialog,
  changeState,
  OwnerSection,
} from './owner-parts';
import { useRevokeFleetAccess } from './owner-queries';
import { Panel } from './query-message';
import { fill, formatInstant, useFleetText } from './text';

type Editor =
  | { kind: 'closed'; saved?: string }
  | { kind: 'open'; key: string; draft: GrantDraft };

export function GrantsSection({
  grants,
  projects,
}: {
  grants: FleetOwnerGrant[];
  projects: FleetOwnerProject[];
}) {
  const { t } = useFleetText();
  const [editor, setEditor] = useState<Editor>({ kind: 'closed' });
  const [revoking, setRevoking] = useState<FleetOwnerGrant | null>(null);
  const revoke = useRevokeFleetAccess();
  const revoked = changeState(revoke, () => t.access.revoked);
  const open = (key: string, draft: GrantDraft) => {
    revoke.reset();
    setEditor({ kind: 'open', key, draft });
  };

  return (
    <OwnerSection
      id="fleet-grants"
      title={t.access.people}
      actions={
        editor.kind === 'closed' &&
        projects.length > 0 && (
          <Button size="sm" onClick={() => open('new', emptyGrantDraft())}>
            {t.access.grant}
          </Button>
        )
      }
    >
      {projects.length === 0 && (
        <SettingsSectionMessage>{t.access.noProjects}</SettingsSectionMessage>
      )}
      {editor.kind === 'open' && (
        <GrantForm
          key={editor.key}
          initial={editor.draft}
          projects={projects}
          onClose={(saved) => setEditor({ kind: 'closed', saved })}
        />
      )}
      {editor.kind === 'closed' && editor.saved && revoked.kind === 'idle' && (
        <output className="block text-muted-foreground text-sm">
          {editor.saved}
        </output>
      )}
      <ChangeNotice state={revoked} />
      {grants.length === 0 ? (
        <SettingsSectionMessage>{t.access.noGrants}</SettingsSectionMessage>
      ) : (
        <Panel>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.access.person}</TableHead>
                <TableHead>{t.access.tier}</TableHead>
                <TableHead>{t.access.projects}</TableHead>
                <TableHead>{t.access.expiry}</TableHead>
                <TableHead>{t.access.status}</TableHead>
                <TableHead>
                  <span className="sr-only">{t.access.edit}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grants.map((grant) => (
                <GrantRow
                  key={grant.userId}
                  grant={grant}
                  projects={projects}
                  busy={editor.kind === 'open' || revoked.kind === 'saving'}
                  onEdit={() => open(grant.userId, grantDraftOf(grant))}
                  onRevoke={() => setRevoking(grant)}
                />
              ))}
            </TableBody>
          </Table>
        </Panel>
      )}
      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(next) => !next && setRevoking(null)}
        title={fill(t.access.revokeTitle, {
          email: revoking?.email ?? t.access.deletedAccount,
        })}
        action={t.access.revoke}
        destructive
        onConfirm={() => {
          if (!revoking) return;
          setEditor({ kind: 'closed' });
          revoke.mutate({
            userId: revoking.userId,
            expectedGeneration: revoking.generation,
          });
        }}
      >
        <p>{t.access.revokeBody}</p>
      </ConfirmDialog>
    </OwnerSection>
  );
}

function projectLabel(
  projects: readonly FleetOwnerProject[],
  locale: Locale,
  key: string
) {
  const project = projects.find((entry) => entry.key === key);
  if (!project) return key;
  return locale === 'vi' ? project.nameVi : project.nameEn;
}

function GrantRow({
  grant,
  projects,
  busy,
  onEdit,
  onRevoke,
}: {
  grant: FleetOwnerGrant;
  projects: readonly FleetOwnerProject[];
  busy: boolean;
  onEdit: () => void;
  onRevoke: () => void;
}) {
  const { locale, t } = useFleetText();
  return (
    <TableRow>
      <TableCell className="max-w-56 break-all">
        {grant.email ?? t.access.deletedAccount}
      </TableCell>
      <TableCell>{t.tier[grant.tier]}</TableCell>
      <TableCell>
        {grant.projects
          .map((key) => projectLabel(projects, locale, key))
          .join(', ')}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        {grant.expiresAt
          ? formatInstant(locale, grant.expiresAt)
          : t.access.noExpiry}
      </TableCell>
      <TableCell>
        <Badge
          variant="outline"
          className={toneBadge(grantStatusTone[grant.status])}
        >
          {t.grantStatus[grant.status]}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            disabled={busy || grant.email === null}
            onClick={onEdit}
          >
            {t.access.edit}
          </Button>
          {grant.status !== 'revoked' && (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              disabled={busy}
              onClick={onRevoke}
            >
              {t.access.revoke}
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
