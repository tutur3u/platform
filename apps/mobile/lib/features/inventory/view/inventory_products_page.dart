import 'dart:async';

import 'package:flutter/material.dart' hide Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class InventoryProductsPage extends StatefulWidget {
  const InventoryProductsPage({super.key});

  @override
  State<InventoryProductsPage> createState() => _InventoryProductsPageState();
}

class _InventoryProductsPageState extends State<InventoryProductsPage> {
  late final InventoryRepository _repository;
  late final TextEditingController _searchController;
  Future<({List<InventoryProduct> data, int count})>? _future;

  String? get _wsId =>
      context.read<WorkspaceCubit>().state.currentWorkspace?.id;

  @override
  void initState() {
    super.initState();
    _repository = InventoryRepository();
    _searchController = TextEditingController();
    unawaited(Future<void>.delayed(Duration.zero, _reload));
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _reload() {
    final wsId = _wsId;
    if (wsId == null) return;
    setState(() {
      _future = _repository.getProducts(
        wsId,
        query: _searchController.text,
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    return shad.Scaffold(
      child: BlocListener<WorkspaceCubit, WorkspaceState>(
        listenWhen: (previous, current) =>
            previous.currentWorkspace?.id != current.currentWorkspace?.id,
        listener: (context, state) => _reload(),
        child: FutureBuilder<({List<InventoryProduct> data, int count})>(
          future: _future,
          builder: (context, snapshot) {
            if (!snapshot.hasData &&
                snapshot.connectionState != ConnectionState.done) {
              return const Center(child: NovaLoadingIndicator());
            }

            if (snapshot.hasError || !snapshot.hasData) {
              return _InventoryProductsError(onRetry: _reload);
            }

            final result = snapshot.data!;
            final l10n = context.l10n;

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
                    Row(
                      children: [
                        Expanded(
                          child: TextField(
                            controller: _searchController,
                            onSubmitted: (_) => _reload(),
                            decoration: InputDecoration(
                              hintText: l10n.inventorySearchProducts,
                              prefixIcon: const Icon(Icons.search_rounded),
                              suffixIcon: _searchController.text.isEmpty
                                  ? null
                                  : IconButton(
                                      onPressed: () {
                                        _searchController.clear();
                                        _reload();
                                      },
                                      icon: const Icon(Icons.close_rounded),
                                    ),
                            ),
                          ),
                        ),
                        const shad.Gap(12),
                        shad.PrimaryButton(
                          onPressed: () async {
                            final result = await context.push<bool>(
                              Routes.inventoryProductCreate,
                            );
                            if (result == true && mounted) {
                              _reload();
                            }
                          },
                          child: Text(l10n.inventoryCreateProduct),
                        ),
                      ],
                    ),
                    const shad.Gap(16),
                    if (result.data.isEmpty)
                      FinanceEmptyState(
                        icon: Icons.inventory_2_outlined,
                        title: l10n.inventoryProductsLabel,
                        body: l10n.inventoryProductsEmpty,
                        action: shad.SecondaryButton(
                          onPressed: () async {
                            final created = await context.push<bool>(
                              Routes.inventoryProductCreate,
                            );
                            if (created == true && mounted) {
                              _reload();
                            }
                          },
                          child: Text(l10n.inventoryCreateProduct),
                        ),
                      )
                    else
                      ...result.data.map(
                        (product) => Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: FinancePanel(
                            onTap: () async {
                              final saved = await context.push<bool>(
                                Routes.inventoryProductDetailPath(product.id),
                              );
                              if (saved == true && mounted) {
                                _reload();
                              }
                            },
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    Expanded(
                                      child: Text(
                                        product.name ?? 'Untitled product',
                                        style: shad.Theme.of(context)
                                            .typography
                                            .large
                                            .copyWith(
                                              fontWeight: FontWeight.w700,
                                            ),
                                      ),
                                    ),
                                    if (product.archived)
                                      const Icon(
                                        Icons.archive_outlined,
                                        size: 18,
                                      ),
                                  ],
                                ),
                                const shad.Gap(6),
                                Text(
                                  [
                                    if (product.owner?.name.isNotEmpty ?? false)
                                      product.owner!.name,
                                    if (product.category?.isNotEmpty ?? false)
                                      product.category!,
                                    if (product
                                            .financeCategory
                                            ?.name
                                            .isNotEmpty ??
                                        false)
                                      product.financeCategory!.name,
                                  ].join(' • '),
                                ),
                                if (product.inventory.isNotEmpty) ...[
                                  const shad.Gap(10),
                                  ...product.inventory.take(3).map(
                                    (stock) {
                                      final stockSummary =
                                          [
                                                [
                                                  stock.amount?.toStringAsFixed(
                                                        0,
                                                      ) ??
                                                      '0',
                                                  stock.unitName ?? '',
                                                ].join(' ').trim(),
                                                stock.warehouseName ?? '',
                                                [
                                                  l10n.inventoryProductPrice,
                                                  stock.price.toStringAsFixed(
                                                    0,
                                                  ),
                                                ].join(': '),
                                              ]
                                              .where(
                                                (part) => part.isNotEmpty,
                                              )
                                              .join(' • ');

                                      return Padding(
                                        padding: const EdgeInsets.only(
                                          bottom: 6,
                                        ),
                                        child: Text(stockSummary),
                                      );
                                    },
                                  ),
                                ],
                              ],
                            ),
                          ),
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

class _InventoryProductsError extends StatelessWidget {
  const _InventoryProductsError({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: FinanceEmptyState(
        icon: Icons.error_outline,
        title: context.l10n.commonSomethingWentWrong,
        body: context.l10n.inventoryProductsLabel,
        action: shad.SecondaryButton(
          onPressed: onRetry,
          child: Text(context.l10n.commonRetry),
        ),
      ),
    );
  }
}
