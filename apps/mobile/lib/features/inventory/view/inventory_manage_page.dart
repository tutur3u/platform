import 'dart:async';

import 'package:flutter/material.dart' hide Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/finance/category.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
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
  late final TextEditingController _ownerController;
  late final TextEditingController _categoryController;
  late final TextEditingController _unitController;
  late final TextEditingController _warehouseController;
  Future<_InventoryManageData>? _future;
  bool _savingOwner = false;
  bool _savingCategory = false;
  bool _savingUnit = false;
  bool _savingWarehouse = false;

  String? get _wsId =>
      context.read<WorkspaceCubit>().state.currentWorkspace?.id;

  @override
  void initState() {
    super.initState();
    _inventoryRepository = InventoryRepository();
    _financeRepository = FinanceRepository();
    _ownerController = TextEditingController();
    _categoryController = TextEditingController();
    _unitController = TextEditingController();
    _warehouseController = TextEditingController();
    unawaited(Future<void>.delayed(Duration.zero, _reload));
  }

  @override
  void dispose() {
    _ownerController.dispose();
    _categoryController.dispose();
    _unitController.dispose();
    _warehouseController.dispose();
    super.dispose();
  }

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
    ]);

    return _InventoryManageData(
      owners: results[0] as List<InventoryOwner>,
      productCategories: results[1] as List<InventoryLookupItem>,
      units: results[2] as List<InventoryLookupItem>,
      warehouses: results[3] as List<InventoryLookupItem>,
      financeCategories: results[4] as List<TransactionCategory>,
    );
  }

  Future<void> _createOwner() async {
    final wsId = _wsId;
    final name = _ownerController.text.trim();
    if (wsId == null || name.isEmpty || _savingOwner) return;
    setState(() => _savingOwner = true);
    try {
      await _inventoryRepository.createOwner(wsId, name);
      _ownerController.clear();
      _reload();
    } finally {
      if (mounted) {
        setState(() => _savingOwner = false);
      }
    }
  }

  Future<void> _createCategory() async {
    final wsId = _wsId;
    final name = _categoryController.text.trim();
    if (wsId == null || name.isEmpty || _savingCategory) return;
    setState(() => _savingCategory = true);
    try {
      await _inventoryRepository.createProductCategory(wsId, name);
      _categoryController.clear();
      _reload();
    } finally {
      if (mounted) {
        setState(() => _savingCategory = false);
      }
    }
  }

  Future<void> _createUnit() async {
    final wsId = _wsId;
    final name = _unitController.text.trim();
    if (wsId == null || name.isEmpty || _savingUnit) return;
    setState(() => _savingUnit = true);
    try {
      await _inventoryRepository.createProductUnit(wsId, name);
      _unitController.clear();
      _reload();
    } finally {
      if (mounted) {
        setState(() => _savingUnit = false);
      }
    }
  }

  Future<void> _createWarehouse() async {
    final wsId = _wsId;
    final name = _warehouseController.text.trim();
    if (wsId == null || name.isEmpty || _savingWarehouse) return;
    setState(() => _savingWarehouse = true);
    try {
      await _inventoryRepository.createProductWarehouse(wsId, name);
      _warehouseController.clear();
      _reload();
    } finally {
      if (mounted) {
        setState(() => _savingWarehouse = false);
      }
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
                    Align(
                      alignment: Alignment.centerRight,
                      child: shad.SecondaryButton(
                        onPressed: () => context.go(Routes.inventoryAuditLogs),
                        child: Text(l10n.inventoryAuditLabel),
                      ),
                    ),
                    const shad.Gap(16),
                    _ManageSection(
                      title: l10n.inventoryManageOwners,
                      controller: _ownerController,
                      actionLabel: l10n.inventoryAddOwner,
                      saving: _savingOwner,
                      onSubmit: _createOwner,
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
                      controller: _categoryController,
                      actionLabel: l10n.inventoryAddCategory,
                      saving: _savingCategory,
                      onSubmit: _createCategory,
                      child: _ChipWrap(
                        labels: data.productCategories
                            .map((item) => item.name)
                            .toList(growable: false),
                      ),
                    ),
                    const shad.Gap(16),
                    _ManageSection(
                      title: l10n.inventoryManageUnits,
                      controller: _unitController,
                      actionLabel: l10n.inventoryAddUnit,
                      saving: _savingUnit,
                      onSubmit: _createUnit,
                      child: _ChipWrap(
                        labels: data.units
                            .map((item) => item.name)
                            .toList(growable: false),
                      ),
                    ),
                    const shad.Gap(16),
                    _ManageSection(
                      title: l10n.inventoryManageWarehouses,
                      controller: _warehouseController,
                      actionLabel: l10n.inventoryAddWarehouse,
                      saving: _savingWarehouse,
                      onSubmit: _createWarehouse,
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
  });

  final List<InventoryOwner> owners;
  final List<InventoryLookupItem> productCategories;
  final List<InventoryLookupItem> units;
  final List<InventoryLookupItem> warehouses;
  final List<TransactionCategory> financeCategories;
}

class _ManageSection extends StatelessWidget {
  const _ManageSection({
    required this.title,
    required this.controller,
    required this.actionLabel,
    required this.saving,
    required this.onSubmit,
    required this.child,
  });

  final String title;
  final TextEditingController controller;
  final String actionLabel;
  final bool saving;
  final Future<void> Function() onSubmit;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return FinancePanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: shad.Theme.of(
              context,
            ).typography.large.copyWith(fontWeight: FontWeight.w700),
          ),
          const shad.Gap(12),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: controller,
                  onSubmitted: (_) => unawaited(onSubmit()),
                ),
              ),
              const shad.Gap(12),
              shad.PrimaryButton(
                onPressed: saving ? null : onSubmit,
                child: Text(actionLabel),
              ),
            ],
          ),
          const shad.Gap(12),
          child,
        ],
      ),
    );
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
