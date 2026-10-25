import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_cache_inventory.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/settings/view/offline_stored_items.dart';
import 'package:mobile/features/settings/view/settings_row_layout.dart';
import 'package:mobile/features/settings/view/settings_widgets.dart';
import 'package:mobile/l10n/l10n.dart';

/// What an app keeps on this device, as friendly grouped rows.
///
/// Each collection reads "50 items · 48 KB · Updated …" and opens the stored
/// item browser. Snapshot counts, server totals and the measurement caveats
/// stay available under a collapsed "Technical details" disclosure.
class OfflineModuleStorageSection extends StatelessWidget {
  const OfflineModuleStorageSection({
    required this.moduleId,
    required this.inventory,
    required this.rows,
    required this.store,
    required this.userId,
    required this.workspaceId,
    required this.canEvict,
    required this.onEvict,
    super.key,
  });

  final String moduleId;
  final OfflineCacheInventory inventory;
  final List<OfflineNamespaceInventory> rows;
  final CacheStore store;
  final String userId;
  final String workspaceId;
  final bool canEvict;
  final VoidCallback onEvict;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final locale = Localizations.localeOf(context).toString();
    String updated(DateTime time) =>
        DateFormat.yMMMd(locale).add_jm().format(time.toLocal());
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SettingsCompactSection(
          title: l10n.offlineStoredOnDevice,
          children: [
            SettingsTile(
              key: const ValueKey('offline-storage-summary'),
              grouped: true,
              icon: LucideIcons.hardDrive,
              title: l10n.offlineStorageUsed,
              trailingValue: formatStorageBytes(inventory.logicalBytes, locale),
              value: l10n.offlineQueuedChanges(inventory.pending),
              showChevron: false,
            ),
            if (rows.isEmpty)
              AppStateMessage.inline(
                icon: LucideIcons.searchX,
                title: l10n.offlineNoStoredItems,
              )
            else
              for (final row in rows)
                OfflineStoredItems(
                  key: ValueKey((userId, workspaceId, row.namespace)),
                  store: store,
                  userId: userId,
                  workspaceId: workspaceId,
                  namespace: row.namespace,
                  revision: row.contentRevision,
                  triggerBuilder: (context, open) => SettingsTile(
                    key: ValueKey('offline-collection-${row.namespace}'),
                    grouped: true,
                    icon: LucideIcons.database,
                    title: offlineCollectionLabel(row.namespace, moduleId),
                    value: l10n.offlineCollectionSummary(
                      row.items,
                      formatStorageBytes(row.logicalBytes, locale),
                      updated(row.lastFetch),
                    ),
                    onTap: open,
                  ),
                ),
          ],
        ),
        const AppGap(SettingsRowLayout.groupGap),
        SettingsCompactSection(
          title: l10n.offlineManageData,
          children: [
            SettingsTile(
              key: const ValueKey('offline-evict-row'),
              grouped: true,
              isDestructive: true,
              icon: LucideIcons.trash2,
              title: l10n.offlineEvictTitle,
              subtitle: l10n.offlineEvictRowDescription,
              showChevron: false,
              onTap: canEvict ? onEvict : null,
            ),
          ],
        ),
        const AppGap(SettingsRowLayout.groupGap),
        AppDisclosure(
          key: const ValueKey('offline-technical-details'),
          title: Text(l10n.offlineTechnicalDetails),
          leading: const Icon(LucideIcons.info, size: 18),
          children: [
            _Note(l10n.offlineCoverageUnknown),
            _Note(l10n.offlineBytesExplanation),
            _Note(l10n.offlineLogicalBytes('${inventory.logicalBytes}')),
            _Note(l10n.offlinePendingCoverage(inventory.pending)),
            for (final row in rows) ...[
              const AppGap(AppSpacing.sm),
              Text(
                row.namespace,
                style: AppTokens.of(
                  context,
                ).typography.small.copyWith(fontWeight: FontWeight.w600),
              ),
              _Note(l10n.offlineAvailableItems(row.items, row.snapshots)),
              _Note(l10n.offlineLogicalBytes('${row.logicalBytes}')),
              _Note(
                row.serverReportedTotal == null
                    ? l10n.offlineExpectedTotalUnknown
                    : l10n.offlineExpectedTotal(row.serverReportedTotal!),
              ),
              _Note(
                l10n.offlineFreshness(row.staleSnapshots, row.expiredSnapshots),
              ),
              _Note(l10n.offlineLastFetch(updated(row.lastFetch))),
            ],
          ],
        ),
      ],
    );
  }
}

class _Note extends StatelessWidget {
  const _Note(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.xs),
      child: Text(
        text,
        style: tokens.typography.small.copyWith(
          color: tokens.colorScheme.mutedForeground,
        ),
      ),
    );
  }
}

/// "finance.checkpointList" in the finance module reads "Checkpoint list".
String offlineCollectionLabel(String namespace, String moduleId) {
  var name = namespace.startsWith('$moduleId.')
      ? namespace.substring(moduleId.length + 1)
      : namespace;
  name = name
      .replaceAllMapped(RegExp('([a-z0-9])([A-Z])'), (m) => '${m[1]} ${m[2]}')
      .replaceAll(RegExp(r'[._\-]+'), ' ')
      .trim()
      .toLowerCase();
  if (name.isEmpty) return namespace;
  return name[0].toUpperCase() + name.substring(1);
}

/// Locale-aware size such as "870 KB" or "1.2 MB".
String formatStorageBytes(int bytes, String locale) {
  const units = ['B', 'KB', 'MB', 'GB'];
  var value = bytes.toDouble();
  var unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  final digits = unit == 0 || value >= 100 ? 0 : 1;
  final number = NumberFormat.decimalPatternDigits(
    locale: locale,
    decimalDigits: digits,
  ).format(value);
  return '$number ${units[unit]}';
}
