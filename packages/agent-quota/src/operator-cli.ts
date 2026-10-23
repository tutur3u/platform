import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { collapseAccounts } from './accounts';
import { updateBlockLedger } from './block-ledger';
import { collectAll } from './collectors';
import { collectPoolReceipts } from './collectors/children';
import { HookError, readLedger } from './hook-ledger';
import { SIGNAL_TTL_MS } from './policy';
import { settingsFor, validatePoolSettings } from './pool-settings';
import { gateDecision } from './positional-admit';
import { applyDescendantReceipts } from './recovery';
import {
  applyImportedUsage,
  mergeUsageImport,
  parseManualUsage,
} from './usage-import';
import {
  windowFreshnessTtlMs,
  windowObservationIsFresh,
} from './window-freshness';

function input(): Record<string, unknown> {
  const text = readFileSync(0, 'utf8');
  if (Buffer.byteLength(text) > 1_000_000)
    throw new HookError('input-too-large');
  const value = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new HookError('input-invalid');
  return value;
}
// Import only a deliberately narrow app-side export, never a full settings/auth document.
export function validateUsageImport(value: Record<string, unknown>) {
  if (
    Object.keys(value).some(
      (k) =>
        ![
          'providers',
          'settings',
          'observations',
          'provenance',
          'catalog',
        ].includes(k)
    ) ||
    typeof value.provenance !== 'string' ||
    !value.provenance.trim()
  )
    throw new HookError('usage-import-invalid');
  const settings = value.settings as
    | {
        providerInstances?: Record<
          string,
          { driver: string; config?: Record<string, unknown> }
        >;
      }
    | undefined;
  if (settings) {
    if (Object.keys(settings).some((k) => k !== 'providerInstances'))
      throw new HookError('usage-import-settings-not-narrow');
    for (const instance of Object.values(settings.providerInstances ?? {})) {
      if (
        Object.keys(instance).some((k) => !['driver', 'config'].includes(k)) ||
        Object.keys(instance.config ?? {}).some(
          (k) => !['homePath', 'shadowHomePath'].includes(k)
        )
      )
        throw new HookError('usage-import-settings-not-narrow');
    }
  }
  if (value.providers !== undefined && !Array.isArray(value.providers))
    throw new HookError('usage-import-invalid');
  for (const provider of (value.providers ?? []) as Record<string, unknown>[]) {
    if (
      !provider ||
      Object.keys(provider).some(
        (k) => !['instanceId', 'driver', 'usageLimits'].includes(k)
      ) ||
      typeof provider.instanceId !== 'string'
    )
      throw new HookError('usage-import-provider-invalid');
    const limits = provider.usageLimits as Record<string, unknown> | undefined;
    if (
      limits &&
      (Object.keys(limits).some(
        (k) => !['checkedAt', 'windows', 'unavailable'].includes(k)
      ) ||
        !Array.isArray(limits.windows))
    )
      throw new HookError('usage-import-limits-not-narrow');
    for (const w of (limits?.windows ?? []) as Record<string, unknown>[])
      if (
        Object.keys(w).some(
          (k) =>
            ![
              'id',
              'kind',
              'label',
              'usedPercent',
              'resetsAt',
              'windowDurationMins',
            ].includes(k)
        )
      )
        throw new HookError('usage-import-window-not-narrow');
  }
  if (value.observations !== undefined && !Array.isArray(value.observations))
    throw new HookError('manual-usage-invalid');
  const parsed = parseManualUsage(
    (value.observations as unknown[] | undefined) ?? []
  );
  return {
    providers: value.providers ?? [],
    settings,
    observations: parsed.observations,
    invalidObservations: parsed.invalid,
    provenance: value.provenance,
  };
}
export async function runOperator(command: string, args: string[]) {
  try {
    if (command === 'import-usage' || command === 'configure') {
      const value = input();
      const collected = await collectAll({
        snapshotsOnly: true,
        catalog: value.catalog,
      });
      const ids = new Set(
        collected.accounts
          .filter((a) => a.available !== undefined)
          .map((a) => a.instanceId)
      );
      if (!ids.size) throw new HookError('catalog-unverified');
      const at = new Date().toISOString();
      if (command === 'configure') {
        if (
          typeof value.pool !== 'string' ||
          !ids.has(value.pool) ||
          typeof value.evidence !== 'string' ||
          !value.evidence.trim()
        )
          throw new HookError('configuration-evidence-invalid');
        const pool = value.pool;
        const policy = validatePoolSettings(value.policy);
        const receipt = {
          pool,
          at,
          policy,
          evidenceHash: createHash('sha256')
            .update(value.evidence)
            .digest('hex'),
        };
        await updateBlockLedger((ledger) => {
          ledger.poolSettings = {
            ...((ledger.poolSettings as object) ?? {}),
            [pool]: policy,
          };
          ledger.configurationReceipts = [
            ...(Array.isArray(ledger.configurationReceipts)
              ? ledger.configurationReceipts
              : []
            ).slice(-99),
            receipt,
          ];
        });
        console.log(
          JSON.stringify({
            status: 'configured',
            ...receipt,
            activeWriterChanged: false,
          })
        );
      } else {
        const imported = validateUsageImport(value);
        const providers = imported.providers as { instanceId: string }[];
        if (
          [
            ...providers.map((p) => p.instanceId),
            ...imported.observations.map((o) => o.pool),
            ...Object.keys(imported.settings?.providerInstances ?? {}),
          ].some((id) => !ids.has(id))
        )
          throw new HookError('import-pool-not-in-catalog');
        applyImportedUsage(collected.accounts, imported); // Validate window semantics before writing.
        await updateBlockLedger((ledger) => {
          ledger.usageImport = mergeUsageImport(ledger.usageImport, imported);
          const existing = Array.isArray(ledger.observations)
            ? ledger.observations
            : [];
          ledger.observations = [
            ...new Map(
              [...existing, ...imported.observations].map((o) => [
                JSON.stringify(o),
                o,
              ])
            ).values(),
          ];
        });
        console.log(
          JSON.stringify({
            status: 'imported',
            at,
            providers: providers.map((p) => p.instanceId),
            observations: imported.observations.length,
            invalidObservations: imported.invalidObservations,
          })
        );
      }
      return;
    }
    if (command === 'dry-run' && args.shift() !== 'route')
      throw new HookError('expected-dry-run-route');
    const valueFlags = new Set([
      '--pool',
      '--model',
      '--provider',
      '--task-kind',
      '--author-pool',
    ]);
    const seen = new Set<string>();
    for (let i = 0; i < args.length; i++) {
      const flag = args[i]!;
      if (seen.has(flag)) throw new HookError('operator-options-invalid');
      seen.add(flag);
      if (['--catalog-stdin', '--json', '--snapshots-only'].includes(flag))
        continue;
      if (
        !valueFlags.has(flag) ||
        !args[i + 1] ||
        args[i + 1]!.startsWith('--')
      )
        throw new HookError('operator-options-invalid');
      i++;
    }
    const get = (flag: string) =>
      args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;
    const kind = get('--task-kind') ?? 'implementation';
    if (
      !['implementation', 'analysis', 'review', 'research'].includes(kind) ||
      (kind === 'review' && !get('--author-pool'))
    )
      throw new HookError('task-requirements-missing-or-invalid');
    const collected = await collectAll({
      snapshotsOnly: true,
      catalog: args.includes('--catalog-stdin') ? input() : undefined,
    });
    if (collected.active === undefined)
      throw new HookError('reservation-state-unavailable');
    const active = collected.active;
    const context = {
      ...collected,
      active,
      ledger: await readLedger(),
      now: new Date(),
    };
    applyDescendantReceipts(
      collectPoolReceipts(
        collected.accounts.map((a) => a.instanceId),
        context.now
      ),
      context,
      Intl.DateTimeFormat().resolvedOptions().timeZone
    );
    const rows = collapseAccounts(collected.accounts)
      .filter((a) => !get('--pool') || a.instanceIds?.includes(get('--pool')!))
      .map((account) => {
        const model = get('--model') ?? account.models?.[0];
        const decision = model
          ? gateDecision(
              account.instanceId,
              model,
              context,
              process.env.AGENT_QUOTA_OWNER_POOL !== undefined &&
                account.instanceIds?.includes(
                  process.env.AGENT_QUOTA_OWNER_POOL
                )
            )
          : {
              status: 'BLOCKED',
              exitCode: 2,
              reasons: ['model-unavailable-or-unverified'],
            };
        const author = collected.accounts.find(
          (item) => item.instanceId === get('--author-pool')
        );
        if (
          kind === 'review' &&
          (!author ||
            account.instanceIds?.includes(author.instanceId) ||
            (author.provider === account.provider &&
              (!author.accountIdentityHash ||
                !account.accountIdentityHash ||
                author.accountIdentityHash === account.accountIdentityHash)))
        ) {
          decision.status = 'BLOCKED';
          decision.exitCode = 3;
          decision.reasons.push('reviewer-independence');
        }
        return {
          pool: account.instanceId,
          aliases: account.instanceIds,
          model,
          ...decision,
          preference:
            settingsFor(account, context)?.preference ??
            (account.provider === 'codex' ? 4 : 1),
          identity: account.accountIdentityHash ? 'established' : 'UNKNOWN',
          windows: account.windows.map((w) => ({
            id: w.id,
            label: w.label,
            providerWindowKind: w.providerWindowKind ?? 'unknown',
            routingKind: w.kind,
            windowDurationMins: w.windowDurationMins ?? null,
            scope: w.scope,
            remainingPercent:
              w.usedPercent === undefined ? null : 100 - w.usedPercent,
            usedPercent: w.usedPercent ?? null,
            units: 'percent',
            observedAt: w.observedAt,
            ageMs: context.now.getTime() - Date.parse(w.observedAt),
            ttlMs: windowFreshnessTtlMs(w, SIGNAL_TTL_MS[account.provider]),
            freshness: windowObservationIsFresh(
              w,
              context.now,
              SIGNAL_TTL_MS[account.provider]
            )
              ? 'FRESH'
              : 'STALE',
            resetAt: w.resetsAt ?? null,
            source: w.source,
            confidence: w.confidence ?? 'provider',
          })),
        };
      });
    const ranked = [...rows].sort(
      (a, b) =>
        Number(b.exitCode === 0) - Number(a.exitCode === 0) ||
        Number('state' in b && b.state === 'healthy') -
          Number('state' in a && a.state === 'healthy') ||
        b.preference - a.preference ||
        a.pool.localeCompare(b.pool)
    );
    console.log(
      JSON.stringify(
        {
          readOnly: true,
          observedAt: context.now.toISOString(),
          invalidObservations: collected.invalidObservations ?? [],
          pools: command === 'dry-run' ? ranked : rows,
          ...(command === 'dry-run'
            ? { chosen: ranked.find((r) => r.exitCode === 0) ?? null }
            : {}),
        },
        null,
        2
      )
    );
  } catch (error) {
    console.log(
      JSON.stringify({
        status: 'BLOCKED',
        reasons: [
          error instanceof HookError
            ? error.message
            : 'operator-state-unavailable',
        ],
      })
    );
    process.exitCode = 2;
  }
}
