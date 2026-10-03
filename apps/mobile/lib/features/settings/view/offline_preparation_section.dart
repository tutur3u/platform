import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/cache/offline_preparation_coordinator.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/inventory/cubit/inventory_access_cubit.dart';
import 'package:mobile/features/settings/view/offline_module_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';

class OfflinePreparationSection extends StatefulWidget {
  const OfflinePreparationSection({
    this.coordinator,
    this.productId,
    this.showModuleDetails = false,
    super.key,
  });
  final String? productId;
  final bool showModuleDetails;

  final OfflinePreparationCoordinator? coordinator;

  @override
  State<OfflinePreparationSection> createState() =>
      _OfflinePreparationSectionState();
}

class _OfflinePreparationSectionState extends State<OfflinePreparationSection> {
  OfflinePreparationCoordinator get _coordinator =>
      widget.coordinator ?? OfflinePreparationCoordinator.instance;
  String? _userId;
  String? _workspaceId;
  bool _starting = false;
  bool _restoring = true;
  bool _failed = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final userId = context.watch<AuthCubit?>()?.state.user?.id;
    final workspaceId = context
        .watch<WorkspaceCubit>()
        .state
        .currentWorkspace
        ?.id;
    if (_userId == userId && _workspaceId == workspaceId) return;
    _failed = false;
    _userId = userId;
    _workspaceId = workspaceId;
    _restoring = true;
    unawaited(
      _coordinator
          .setScope(userId: userId, workspaceId: workspaceId)
          .whenComplete(() {
            if (mounted && _userId == userId && _workspaceId == workspaceId) {
              setState(() => _restoring = false);
            }
          }),
    );
  }

  Future<void> _download({String? productId, bool resume = false}) async {
    productId ??= widget.productId;
    final userId = _userId;
    final workspaceId = _workspaceId;
    if (userId == null || workspaceId == null || _starting) return;
    setState(() {
      _starting = true;
      _failed = false;
    });
    try {
      await ApiClient.offlinePreparation(() async {
        if (!mounted || _userId != userId || _workspaceId != workspaceId) {
          return;
        }
        await _coordinator.run(
          userId: userId,
          workspaceId: workspaceId,
          productId: productId,
          resume: resume,
        );
      }, shouldContinue: () => _coordinator.canContinue(userId, workspaceId));
    } on Object {
      if (mounted && _userId == userId && _workspaceId == workspaceId) {
        setState(() => _failed = true);
      }
    } finally {
      if (mounted) setState(() => _starting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return ValueListenableBuilder<OfflinePreparationState>(
      valueListenable: _coordinator.state,
      builder: (context, state, _) {
        final enabled = _userId != null && _workspaceId != null;
        final ids = widget.productId == null
            ? OfflinePreparationCoordinator.productIds
            : [widget.productId!];
        final completed = ids
            .where(
              (id) =>
                  state.products[id]?.status == OfflinePreparationStatus.ready,
            )
            .length;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    l10n.offlinePreparationTitle,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
                Tooltip(
                  message: l10n.offlinePreparationDescription,
                  triggerMode: TooltipTriggerMode.tap,
                  child: Icon(
                    Icons.info_outline_rounded,
                    size: 20,
                    semanticLabel: l10n.offlinePreparationDescription,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerLeft,
              child: FilledButton.icon(
                onPressed:
                    enabled && !state.running && !_starting && !_restoring
                    ? _download
                    : null,
                icon: const Icon(Icons.download_for_offline_outlined),
                label: Text(
                  widget.productId == null
                      ? l10n.offlinePreparationCacheAll
                      : l10n.offlineRefreshModule,
                ),
              ),
            ),
            if (state.running)
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                  onPressed: _coordinator.cancel,
                  icon: const Icon(Icons.pause),
                  label: Text(l10n.offlinePauseDownloads),
                ),
              ),
            if (!state.running &&
                state.completed > 0 &&
                state.completed <
                    OfflinePreparationCoordinator.productIds.length &&
                widget.productId == null)
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton(
                  onPressed: enabled && !_starting && !_restoring
                      ? () => _download(resume: true)
                      : null,
                  child: Text(l10n.offlineResumeDownloads),
                ),
              ),
            if (_failed)
              Semantics(
                liveRegion: true,
                child: Text(l10n.offlinePreparationFailed),
              ),
            if (state.running) ...[
              const SizedBox(height: 8),
              LinearProgressIndicator(
                value: widget.productId == null ? completed / ids.length : null,
              ),
              Semantics(
                liveRegion: true,
                child: Text(
                  l10n.offlinePreparationProgress(completed, ids.length),
                ),
              ),
            ],
            for (final id
                in widget.productId == null
                    ? OfflinePreparationCoordinator.productIds
                    : [widget.productId!])
              _OfflineProductRow(
                id: id,
                product:
                    state.products[id] ?? const OfflineProductPreparation(),
                running: state.running,
                onOpen:
                    widget.showModuleDetails &&
                        (id != 'inventory' ||
                            (context
                                        .watch<InventoryAccessCubit?>()
                                        ?.state
                                        .enabled ==
                                    true &&
                                context
                                        .watch<InventoryAccessCubit?>()
                                        ?.state
                                        .wsId ==
                                    _workspaceId)) &&
                        state.products[id]?.status !=
                            OfflinePreparationStatus.unavailable
                    ? () => Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (_) =>
                              OfflineModulePage(moduleId: id, embedded: true),
                        ),
                      )
                    : null,
                onRetry: enabled && !state.running && !_starting && !_restoring
                    ? () => _download(productId: id)
                    : null,
              ),
          ],
        );
      },
    );
  }
}

class _OfflineProductRow extends StatelessWidget {
  const _OfflineProductRow({
    required this.id,
    required this.product,
    required this.running,
    this.onRetry,
    this.onOpen,
  });

  final String id;
  final OfflineProductPreparation product;
  final bool running;
  final VoidCallback? onRetry;
  final VoidCallback? onOpen;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final title = switch (id) {
      'finance' => l10n.financeTitle,
      'inventory' => l10n.inventoryTitle,
      'tasks' => l10n.tasksTitle,
      _ => l10n.calendarTitle,
    };
    final status = switch (product.status) {
      OfflinePreparationStatus.queued =>
        running
            ? l10n.offlinePreparationWaiting
            : product.lastSuccess != null
            ? l10n.offlinePreparationNeedsRefresh
            : l10n.offlinePreparationQueued,
      OfflinePreparationStatus.downloading =>
        l10n.offlinePreparationDownloading,
      OfflinePreparationStatus.ready => l10n.offlinePreparationReady,
      OfflinePreparationStatus.failed => l10n.offlinePreparationFailed,
      OfflinePreparationStatus.unavailable =>
        l10n.offlinePreparationUnavailable,
    };
    final lastSuccess = product.status == OfflinePreparationStatus.unavailable
        ? null
        : product.lastSuccess;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Icon(switch (product.status) {
            OfflinePreparationStatus.downloading => Icons.downloading_rounded,
            OfflinePreparationStatus.ready => Icons.offline_pin_outlined,
            OfflinePreparationStatus.failed => Icons.error_outline_rounded,
            OfflinePreparationStatus.unavailable => Icons.cloud_off_outlined,
            OfflinePreparationStatus.queued => Icons.download_outlined,
          }, size: 20),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: Theme.of(context).textTheme.titleSmall),
                Text(status),
                if (product.errorMessage != null &&
                    product.status != OfflinePreparationStatus.unavailable) ...[
                  Text(product.errorMessage!),
                  Text(l10n.offlineDownloadRetryHint),
                ],
                if (lastSuccess != null)
                  Text(
                    l10n.offlinePreparationLastSuccess(
                      DateFormat.yMd(
                        Localizations.localeOf(context).toString(),
                      ).add_jm().format(lastSuccess.toLocal()),
                    ),
                    style: Theme.of(context).textTheme.bodySmall,
                  ),
              ],
            ),
          ),
          if (onOpen != null)
            IconButton(
              tooltip: l10n.offlineModuleDetails,
              onPressed: onOpen,
              icon: const Icon(Icons.chevron_right),
            ),
          if (product.status == OfflinePreparationStatus.failed ||
              product.status == OfflinePreparationStatus.unavailable)
            IconButton(
              tooltip: l10n.commonRetry,
              onPressed: onRetry,
              icon: const Icon(Icons.refresh_rounded),
            ),
        ],
      ),
    );
  }
}
