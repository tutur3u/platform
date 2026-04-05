import 'dart:async';

import 'package:flutter/material.dart' hide Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/finance/category.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/inventory/inventory_permissions.dart';
import 'package:mobile/features/inventory/widgets/inventory_ui.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/app_dialog_scaffold.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class InventoryManagePage extends StatefulWidget {
  const InventoryManagePage({super.key});

  @override
  State<InventoryManagePage> createState() => _InventoryManagePageState();
}

class _InventoryManagePageState extends State<InventoryManagePage> {
  late final InventoryRepository _inventoryRepository;
  late final FinanceRepository _financeRepository;
  late final WorkspacePermissionsRepository _permissionsRepository;
  Future<_InventoryManageData>? _future;

  String? get _wsId =>
      context.read<WorkspaceCubit>().state.currentWorkspace?.id;

  @override
  void initState() {
    super.initState();
    _inventoryRepository = InventoryRepository();
    _financeRepository = FinanceRepository();
    _permissionsRepository = WorkspacePermissionsRepository();
    unawaited(Future<void>.delayed(Duration.zero, _reload));
  }

  @override
  void dispose() => super.dispose();

  void _reload() {
    final wsId = _wsId;
    if (wsId == null) return;
    setState(() {
      _future = _loadData(wsId);
    });
  }

  Future<_InventoryManageData> _loadData(String wsId) async {
    final results = await Future.wait<dynamic>([
      _inventoryRepository.getOwners(wsId),
      _inventoryRepository.getProductCategories(wsId),
      _inventoryRepository.getProductUnits(wsId),
      _inventoryRepository.getProductWarehouses(wsId),
      _financeRepository.getCategories(wsId),
      _permissionsRepository.getPermissions(wsId: wsId),
    ]);

    return _InventoryManageData(
      owners: results[0] as List<InventoryOwner>,
      productCategories: results[1] as List<InventoryLookupItem>,
      units: results[2] as List<InventoryLookupItem>,
      warehouses: results[3] as List<InventoryLookupItem>,
      financeCategories: results[4] as List<TransactionCategory>,
      canManageSetup: canManageInventorySetup(
        results[5] as WorkspacePermissions,
      ),
    );
  }

  Future<void> _createOwner(String name) async {
    final wsId = _wsId;
    if (wsId == null || name.isEmpty) return;
    await _inventoryRepository.createOwner(wsId, name);
  }

  Future<void> _createCategory(String name) async {
    final wsId = _wsId;
    if (wsId == null || name.isEmpty) return;
    await _inventoryRepository.createProductCategory(wsId, name);
  }

  Future<void> _createUnit(String name) async {
    final wsId = _wsId;
    if (wsId == null || name.isEmpty) return;
    await _inventoryRepository.createProductUnit(wsId, name);
  }

  Future<void> _createWarehouse(String name) async {
    final wsId = _wsId;
    if (wsId == null || name.isEmpty) return;
    await _inventoryRepository.createProductWarehouse(wsId, name);
  }

  Future<void> _showCreateDialog({
    required String title,
    required String confirmLabel,
    required Future<void> Function(String value) onConfirm,
  }) async {
    final result = await showAdaptiveSheet<bool>(
      context: context,
      maxDialogWidth: 420,
      builder: (_) => _CreateManageItemDialog(
        title: title,
        confirmLabel: confirmLabel,
        onConfirm: onConfirm,
      ),
    );

    if (result == true && mounted) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) {
          return;
        }
        _reload();
        showInventoryToast(context, confirmLabel);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return shad.Scaffold(
      child: BlocListener<WorkspaceCubit, WorkspaceState>(
        listenWhen: (previous, current) =>
            previous.currentWorkspace?.id != current.currentWorkspace?.id,
        listener: (context, state) => _reload(),
        child: FutureBuilder<_InventoryManageData>(
          future: _future,
          builder: (context, snapshot) {
            if (!snapshot.hasData &&
                snapshot.connectionState != ConnectionState.done) {
              return const Center(child: NovaLoadingIndicator());
            }

            if (snapshot.hasError || !snapshot.hasData) {
              return Center(
                child: FinanceEmptyState(
                  icon: Icons.error_outline,
                  title: l10n.commonSomethingWentWrong,
                  body: l10n.inventoryManageLabel,
                  action: shad.SecondaryButton(
                    onPressed: _reload,
                    child: Text(l10n.commonRetry),
                  ),
                ),
              );
            }

            final data = snapshot.data!;

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
                    InventoryHeroCard(
                      title: l10n.inventoryManageLabel,
                      icon: Icons.tune_rounded,
                      metrics: [
                        InventoryMetricTile(
                          label: l10n.inventoryManageOwners,
                          value: '${data.owners.length}',
                          icon: Icons.people_outline_rounded,
                        ),
                        InventoryMetricTile(
                          label: l10n.inventoryManageCategories,
                          value: '${data.productCategories.length}',
                          icon: Icons.category_outlined,
                        ),
                        InventoryMetricTile(
                          label: l10n.inventoryManageWarehouses,
                          value: '${data.warehouses.length}',
                          icon: Icons.warehouse_outlined,
                        ),
                      ],
                      actions: [
                        shad.SecondaryButton(
                          onPressed: () =>
                              context.go(Routes.inventoryAuditLogs),
                          child: Text(l10n.inventoryAuditLabel),
                        ),
                      ],
                    ),
                    const shad.Gap(16),
                    _ManageSection(
                      title: l10n.inventoryManageOwners,
                      actionLabel: l10n.inventoryAddOwner,
                      canManage: data.canManageSetup,
                      onSubmit: () => _showCreateDialog(
                        title: l10n.inventoryAddOwner,
                        confirmLabel: l10n.inventoryAddOwner,
                        onConfirm: _createOwner,
                      ),
                      child: _ChipWrap(
                        labels: data.owners
                            .map((owner) {
                              if (owner.archived) {
                                return '${owner.name} '
                                    '(${l10n.inventoryOwnerArchived})';
                              }
                              return owner.name;
                            })
                            .toList(growable: false),
                      ),
                    ),
                    const shad.Gap(16),
                    _ManageSection(
                      title: l10n.inventoryManageCategories,
                      actionLabel: l10n.inventoryAddCategory,
                      canManage: data.canManageSetup,
                      onSubmit: () => _showCreateDialog(
                        title: l10n.inventoryAddCategory,
                        confirmLabel: l10n.inventoryAddCategory,
                        onConfirm: _createCategory,
                      ),
                      child: _ChipWrap(
                        labels: data.productCategories
                            .map((item) => item.name)
                            .toList(growable: false),
                      ),
                    ),
                    const shad.Gap(16),
                    _ManageSection(
                      title: l10n.inventoryManageUnits,
                      actionLabel: l10n.inventoryAddUnit,
                      canManage: data.canManageSetup,
                      onSubmit: () => _showCreateDialog(
                        title: l10n.inventoryAddUnit,
                        confirmLabel: l10n.inventoryAddUnit,
                        onConfirm: _createUnit,
                      ),
                      child: _ChipWrap(
                        labels: data.units
                            .map((item) => item.name)
                            .toList(growable: false),
                      ),
                    ),
                    const shad.Gap(16),
                    _ManageSection(
                      title: l10n.inventoryManageWarehouses,
                      actionLabel: l10n.inventoryAddWarehouse,
                      canManage: data.canManageSetup,
                      onSubmit: () => _showCreateDialog(
                        title: l10n.inventoryAddWarehouse,
                        confirmLabel: l10n.inventoryAddWarehouse,
                        onConfirm: _createWarehouse,
                      ),
                      child: _ChipWrap(
                        labels: data.warehouses
                            .map((item) => item.name)
                            .toList(growable: false),
                      ),
                    ),
                    const shad.Gap(16),
                    FinancePanel(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            l10n.financeCategories,
                            style: shad.Theme.of(context).typography.large
                                .copyWith(fontWeight: FontWeight.w700),
                          ),
                          const shad.Gap(10),
                          _ChipWrap(
                            labels: data.financeCategories
                                .map((item) => item.name ?? '')
                                .where((item) => item.isNotEmpty)
                                .toList(growable: false),
                          ),
                        ],
                      ),
                    ),
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

class _InventoryManageData {
  const _InventoryManageData({
    required this.owners,
    required this.productCategories,
    required this.units,
    required this.warehouses,
    required this.financeCategories,
    required this.canManageSetup,
  });

  final List<InventoryOwner> owners;
  final List<InventoryLookupItem> productCategories;
  final List<InventoryLookupItem> units;
  final List<InventoryLookupItem> warehouses;
  final List<TransactionCategory> financeCategories;
  final bool canManageSetup;
}

class _ManageSection extends StatelessWidget {
  const _ManageSection({
    required this.title,
    required this.actionLabel,
    required this.canManage,
    required this.onSubmit,
    required this.child,
  });

  final String title;
  final String actionLabel;
  final bool canManage;
  final Future<void> Function() onSubmit;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return FinancePanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          FinanceSectionHeader(
            title: title,
            action: canManage
                ? shad.IconButton.ghost(
                    onPressed: () => unawaited(onSubmit()),
                    icon: const Icon(Icons.add_rounded, size: 18),
                  )
                : null,
          ),
          const shad.Gap(12),
          if (canManage && actionLabel.trim().isNotEmpty) const shad.Gap(0),
          child,
        ],
      ),
    );
  }
}

class _CreateManageItemDialog extends StatefulWidget {
  const _CreateManageItemDialog({
    required this.title,
    required this.confirmLabel,
    required this.onConfirm,
  });

  final String title;
  final String confirmLabel;
  final Future<void> Function(String value) onConfirm;

  @override
  State<_CreateManageItemDialog> createState() =>
      _CreateManageItemDialogState();
}

class _CreateManageItemDialogState extends State<_CreateManageItemDialog> {
  late final TextEditingController _controller;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AppDialogScaffold(
      title: widget.title,
      icon: Icons.add_circle_outline_rounded,
      maxWidth: 420,
      maxHeightFactor: 0.5,
      actions: [
        shad.OutlineButton(
          onPressed: _saving ? null : () => Navigator.of(context).pop(false),
          child: Text(context.l10n.commonCancel),
        ),
        shad.PrimaryButton(
          onPressed: _saving ? null : _handleConfirm,
          child: _saving
              ? const SizedBox.square(
                  dimension: 16,
                  child: shad.CircularProgressIndicator(strokeWidth: 2),
                )
              : Text(widget.confirmLabel),
        ),
      ],
      child: TextField(
        controller: _controller,
        autofocus: true,
        onSubmitted: (_) => unawaited(_handleConfirm()),
      ),
    );
  }

  Future<void> _handleConfirm() async {
    final value = _controller.text.trim();
    if (value.isEmpty) {
      showInventoryToast(
        context,
        context.l10n.inventoryManageNameRequired,
        destructive: true,
      );
      return;
    }

    setState(() => _saving = true);
    try {
      await widget.onConfirm(value);
      if (!mounted) {
        return;
      }
      Navigator.of(context).pop(true);
    } on Exception catch (error) {
      if (!mounted) {
        return;
      }
      showInventoryToast(
        context,
        error.toString(),
        destructive: true,
      );
    } finally {
      if (mounted) {
        setState(() => _saving = false);
      }
    }
  }
}

class _ChipWrap extends StatelessWidget {
  const _ChipWrap({required this.labels});

  final List<String> labels;

  @override
  Widget build(BuildContext context) {
    if (labels.isEmpty) {
      return Text(context.l10n.inventoryManageEmpty);
    }

    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: labels
          .map(
            (label) => Chip(
              label: Text(label),
            ),
          )
          .toList(growable: false),
    );
  }
}
