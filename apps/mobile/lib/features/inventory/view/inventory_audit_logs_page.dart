import 'dart:async';

import 'package:flutter/material.dart' hide Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/app_dialog_scaffold.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class InventoryAuditLogsPage extends StatefulWidget {
  const InventoryAuditLogsPage({super.key});

  @override
  State<InventoryAuditLogsPage> createState() => _InventoryAuditLogsPageState();
}

class _InventoryAuditLogsPageState extends State<InventoryAuditLogsPage> {
  late final InventoryRepository _repository;
  Future<({List<InventoryAuditLogEntry> data, int count})>? _future;

  String? get _wsId =>
      context.read<WorkspaceCubit>().state.currentWorkspace?.id;

  @override
  void initState() {
    super.initState();
    _repository = InventoryRepository();
    unawaited(Future<void>.delayed(Duration.zero, _reload));
  }

  void _reload() {
    final wsId = _wsId;
    if (wsId == null) {
      return;
    }
    setState(() {
      _future = _repository.getAuditLogs(wsId);
    });
  }

  Future<void> _openDetails(InventoryAuditLogEntry entry) async {
    await showAdaptiveSheet<void>(
      context: context,
      maxDialogWidth: 680,
      builder: (_) => _AuditEntryDetailDialog(entry: entry),
    );
  }

  @override
  Widget build(BuildContext context) {
    return shad.Scaffold(
      child: BlocListener<WorkspaceCubit, WorkspaceState>(
        listenWhen: (previous, current) =>
            previous.currentWorkspace?.id != current.currentWorkspace?.id,
        listener: (context, state) => _reload(),
        child: FutureBuilder<({List<InventoryAuditLogEntry> data, int count})>(
          future: _future,
          builder: (context, snapshot) {
            if (!snapshot.hasData &&
                snapshot.connectionState != ConnectionState.done) {
              return const Center(child: NovaLoadingIndicator());
            }

            if (snapshot.hasError || !snapshot.hasData) {
              return Padding(
                padding: const EdgeInsets.all(16),
                child: Center(
                  child: FinanceEmptyState(
                    icon: Icons.error_outline,
                    title: context.l10n.commonSomethingWentWrong,
                    body:
                        snapshot.error?.toString() ??
                        context.l10n.inventoryAuditLabel,
                    action: shad.SecondaryButton(
                      onPressed: _reload,
                      child: Text(context.l10n.commonRetry),
                    ),
                  ),
                ),
              );
            }

            final result = snapshot.data!;

            return ResponsiveWrapper(
              maxWidth: ResponsivePadding.maxContentWidth(context.deviceClass),
              child: RefreshIndicator(
                onRefresh: () async => _reload(),
                child: ListView(
                  padding: EdgeInsets.fromLTRB(
                    16,
                    8,
                    16,
                    32 + MediaQuery.paddingOf(context).bottom,
                  ),
                  children: [
                    FinancePanel(
                      child: Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          FinanceStatChip(
                            label: context.l10n.inventoryAuditLabel,
                            value: '${result.count}',
                            icon: Icons.history_rounded,
                          ),
                        ],
                      ),
                    ),
                    const shad.Gap(18),
                    if (result.data.isEmpty)
                      FinanceEmptyState(
                        icon: Icons.history_toggle_off_outlined,
                        title: context.l10n.inventoryAuditLabel,
                        body: context.l10n.inventoryAuditEmpty,
                      )
                    else ...[
                      FinanceSectionHeader(
                        title: context.l10n.inventoryAuditRecentTitle,
                      ),
                      const shad.Gap(12),
                      ...result.data.map(
                        (entry) => Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: _AuditEntryCard(
                            entry: entry,
                            onTap: () => _openDetails(entry),
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}

class _AuditEntryCard extends StatelessWidget {
  const _AuditEntryCard({
    required this.entry,
    required this.onTap,
  });

  final InventoryAuditLogEntry entry;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final palette = FinancePalette.of(context);
    final changeCount = entry.fieldChanges.isNotEmpty
        ? entry.fieldChanges.length
        : entry.changedFields.length;

    return FinancePanel(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  _displaySummary(context, entry),
                  style: theme.typography.large.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              const shad.Gap(12),
              Icon(
                Icons.chevron_right_rounded,
                size: 18,
                color: theme.colorScheme.mutedForeground,
              ),
            ],
          ),
          const shad.Gap(8),
          Text(
            [
              _labelForEntityKind(context, entry.entityKind),
              _labelForEventKind(context, entry.eventKind),
              if (entry.actorDisplayName?.trim().isNotEmpty ?? false)
                entry.actorDisplayName!.trim(),
            ].join(' • '),
            style: theme.typography.textSmall.copyWith(
              color: theme.colorScheme.mutedForeground,
            ),
          ),
          const shad.Gap(10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _AuditBadge(
                label: changeCount > 0
                    ? context.l10n.inventoryAuditChanges(changeCount)
                    : context.l10n.inventoryAuditNoChanges,
                color: palette.accent,
              ),
              ...entry.fieldChanges
                  .take(2)
                  .map(
                    (change) => _AuditBadge(
                      label: _prettyFieldLabel(change.label, change.field),
                      color: theme.colorScheme.mutedForeground,
                    ),
                  ),
            ],
          ),
          const shad.Gap(10),
          Text(
            DateFormat.yMMMd().add_jm().format(entry.occurredAt.toLocal()),
            style: theme.typography.xSmall.copyWith(
              color: theme.colorScheme.mutedForeground,
            ),
          ),
        ],
      ),
    );
  }
}

class _AuditEntryDetailDialog extends StatelessWidget {
  const _AuditEntryDetailDialog({required this.entry});

  final InventoryAuditLogEntry entry;

  @override
  Widget build(BuildContext context) {
    final fieldChanges = entry.fieldChanges;

    return AppDialogScaffold(
      title: _displaySummary(context, entry),
      icon: Icons.history_rounded,
      maxWidth: 680,
      actions: [
        shad.OutlineButton(
          onPressed: () => Navigator.of(context).pop(),
          child: Text(context.l10n.commonCancel),
        ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _AuditBadge(
                label: _labelForEntityKind(context, entry.entityKind),
                color: FinancePalette.of(context).accent,
              ),
              _AuditBadge(
                label: _labelForEventKind(context, entry.eventKind),
                color: FinancePalette.of(context).positive,
              ),
            ],
          ),
          const shad.Gap(16),
          _AuditDetailRow(
            label: context.l10n.inventoryAuditActorLabel,
            value: entry.actorDisplayName?.trim().isNotEmpty == true
                ? entry.actorDisplayName!.trim()
                : '—',
          ),
          _AuditDetailRow(
            label: context.l10n.inventoryAuditOccurredAt,
            value: DateFormat.yMMMd().add_jm().format(
              entry.occurredAt.toLocal(),
            ),
          ),
          if (entry.entityLabel?.trim().isNotEmpty ?? false)
            _AuditDetailRow(
              label: context.l10n.inventoryAuditSubject,
              value: entry.entityLabel!.trim(),
            ),
          const shad.Gap(16),
          FinanceSectionHeader(
            title: context.l10n.inventoryAuditChangedFields,
          ),
          const shad.Gap(12),
          if (fieldChanges.isEmpty)
            Text(context.l10n.inventoryAuditNoChanges)
          else
            ...fieldChanges.map(
              (change) => Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: FinancePanel(
                  radius: 18,
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _prettyFieldLabel(change.label, change.field),
                        style: shad.Theme.of(context).typography.small.copyWith(
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const shad.Gap(10),
                      _AuditDiffRow(
                        label: context.l10n.inventoryAuditBefore,
                        value: change.before,
                      ),
                      const shad.Gap(6),
                      _AuditDiffRow(
                        label: context.l10n.inventoryAuditAfter,
                        value: change.after,
                      ),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _AuditDetailRow extends StatelessWidget {
  const _AuditDetailRow({
    required this.label,
    required this.value,
  });

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 112,
            child: Text(
              label,
              style: shad.Theme.of(context).typography.textSmall.copyWith(
                color: shad.Theme.of(context).colorScheme.mutedForeground,
              ),
            ),
          ),
          const shad.Gap(12),
          Expanded(
            child: Text(
              value,
              style: shad.Theme.of(context).typography.small.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _AuditDiffRow extends StatelessWidget {
  const _AuditDiffRow({
    required this.label,
    required this.value,
  });

  final String label;
  final String? value;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: shad.Theme.of(context).typography.xSmall.copyWith(
            color: shad.Theme.of(context).colorScheme.mutedForeground,
          ),
        ),
        const shad.Gap(4),
        Text(
          value?.trim().isNotEmpty == true ? value!.trim() : '—',
          style: shad.Theme.of(context).typography.textSmall,
        ),
      ],
    );
  }
}

class _AuditBadge extends StatelessWidget {
  const _AuditBadge({
    required this.label,
    required this.color,
  });

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.22)),
      ),
      child: Text(
        label,
        style: theme.typography.xSmall.copyWith(
          color: color,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

String _labelForEntityKind(BuildContext context, String value) {
  return switch (value) {
    'owner' => context.l10n.inventoryManageOwners,
    'product' => context.l10n.inventoryProductsLabel,
    'stock' => context.l10n.inventoryProductInventory,
    'category' => context.l10n.inventoryManageCategories,
    'unit' => context.l10n.inventoryManageUnits,
    'warehouse' => context.l10n.inventoryManageWarehouses,
    'sale' => context.l10n.inventorySalesLabel,
    _ => _prettyFieldLabel('', value),
  };
}

String _labelForEventKind(BuildContext context, String value) {
  return switch (value) {
    'created' => context.l10n.inventoryAuditEventCreated,
    'updated' => context.l10n.inventoryAuditEventUpdated,
    'archived' => context.l10n.inventoryAuditEventArchived,
    'reactivated' => context.l10n.inventoryAuditEventReactivated,
    'deleted' => context.l10n.inventoryAuditEventDeleted,
    'sale_created' => context.l10n.inventoryAuditEventSaleCreated,
    _ => _prettyFieldLabel('', value),
  };
}

String _displaySummary(BuildContext context, InventoryAuditLogEntry entry) {
  final trimmed = entry.summary.trim();
  if (trimmed.isNotEmpty) {
    return trimmed;
  }

  if (entry.entityLabel?.trim().isNotEmpty ?? false) {
    return '${_labelForEventKind(context, entry.eventKind)} '
        '${entry.entityLabel!.trim()}';
  }

  return [
    _labelForEventKind(context, entry.eventKind),
    _labelForEntityKind(context, entry.entityKind),
  ].join(' ');
}

String _prettyFieldLabel(String label, String fallback) {
  final source = label.trim().isNotEmpty ? label : fallback;
  final normalized = source.replaceAll('_', ' ').trim();
  if (normalized.isEmpty) {
    return fallback;
  }

  return normalized[0].toUpperCase() + normalized.substring(1);
}
