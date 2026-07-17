import 'dart:async';

import 'package:flutter/material.dart' hide Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/storefront/storefront_models.dart';
import 'package:mobile/data/repositories/storefront_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/inventory/widgets/inventory_ui.dart';
import 'package:mobile/features/storefront/storefront_labels.dart';
import 'package:mobile/features/storefront/view/storefront_editor_sheet.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class StorefrontsPage extends StatefulWidget {
  const StorefrontsPage({super.key, this.repository});

  final StorefrontRepository? repository;

  @override
  State<StorefrontsPage> createState() => _StorefrontsPageState();
}

class _StorefrontsPageState extends State<StorefrontsPage> {
  late final StorefrontRepository _repository;
  late final TextEditingController _searchController;
  Timer? _searchDebounce;
  List<Storefront> _storefronts = const [];
  String _status = 'all';
  bool _loading = false;
  String? _error;
  int _requestToken = 0;

  String? get _wsId =>
      context.read<WorkspaceCubit>().state.currentWorkspace?.id;

  @override
  void initState() {
    super.initState();
    _repository = widget.repository ?? StorefrontRepository();
    _searchController = TextEditingController();
    unawaited(Future<void>.delayed(Duration.zero, _reload));
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _searchController.dispose();
    if (widget.repository == null) _repository.dispose();
    super.dispose();
  }

  Future<void> _reload() async {
    final wsId = _wsId;
    if (wsId == null || wsId.isEmpty) return;
    final requestToken = ++_requestToken;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final result = await _repository.listStorefronts(
        wsId,
        status: _status,
        query: _searchController.text,
      );
      if (!mounted || requestToken != _requestToken) return;
      setState(() => _storefronts = result.data);
    } on ApiException catch (error) {
      if (!mounted || requestToken != _requestToken) return;
      setState(() => _error = error.message);
    } on Object {
      if (!mounted || requestToken != _requestToken) return;
      setState(() => _error = context.l10n.commonSomethingWentWrong);
    } finally {
      if (mounted && requestToken == _requestToken) {
        setState(() => _loading = false);
      }
    }
  }

  void _onSearchChanged(String value) {
    _searchDebounce?.cancel();
    _searchDebounce = Timer(const Duration(milliseconds: 320), _reload);
  }

  Future<void> _createStorefront() async {
    final wsId = _wsId;
    if (wsId == null) return;
    final payload = await showStorefrontEditorSheet(context);
    if (payload == null || !mounted) return;
    try {
      final storefront = await _repository.createStorefront(wsId, payload);
      if (!mounted) return;
      showInventoryToast(context, context.l10n.storefrontSaved);
      context.go(Routes.storefrontDetailPath(storefront.id));
    } on ApiException catch (error) {
      if (mounted) {
        showInventoryToast(context, error.message, destructive: true);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final published = _storefronts.where((item) => item.isPublished).length;
    final listings = _storefronts.fold<int>(
      0,
      (total, item) => total + item.listingsCount,
    );

    return shad.Scaffold(
      child: BlocListener<WorkspaceCubit, WorkspaceState>(
        listenWhen: (previous, current) =>
            previous.currentWorkspace?.id != current.currentWorkspace?.id,
        listener: (context, state) => unawaited(_reload()),
        child: ResponsiveWrapper(
          maxWidth: ResponsivePadding.maxContentWidth(context.deviceClass),
          child: RefreshIndicator(
            onRefresh: _reload,
            child: ListView(
              padding: EdgeInsets.fromLTRB(
                16,
                8,
                16,
                40 + MediaQuery.paddingOf(context).bottom,
              ),
              children: [
                InventoryHeroCard(
                  title: l10n.storefrontTitle,
                  subtitle: l10n.storefrontSubtitle,
                  icon: Icons.storefront_outlined,
                  showHeader: false,
                  metrics: [
                    InventoryMetricTile(
                      label: l10n.storefrontStores,
                      value: '${_storefronts.length}',
                      icon: Icons.store_mall_directory_outlined,
                    ),
                    InventoryMetricTile(
                      label: l10n.storefrontPublished,
                      value: '$published',
                      icon: Icons.public_outlined,
                      tint: FinancePalette.of(context).positive,
                    ),
                    InventoryMetricTile(
                      label: l10n.storefrontListings,
                      value: '$listings',
                      icon: Icons.sell_outlined,
                    ),
                  ],
                  actions: [
                    shad.PrimaryButton(
                      onPressed: _createStorefront,
                      child: Text(l10n.storefrontCreate),
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                TextField(
                  controller: _searchController,
                  onChanged: _onSearchChanged,
                  decoration: InputDecoration(
                    labelText: l10n.storefrontSearch,
                    prefixIcon: const Icon(Icons.search_rounded),
                    suffixIcon: _searchController.text.isEmpty
                        ? null
                        : IconButton(
                            tooltip: l10n.commonClear,
                            onPressed: () {
                              _searchController.clear();
                              unawaited(_reload());
                            },
                            icon: const Icon(Icons.close_rounded),
                          ),
                  ),
                ),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: ['all', 'published', 'draft', 'paused', 'archived']
                      .map(
                        (status) => ChoiceChip(
                          label: Text(storefrontStatusLabel(l10n, status)),
                          selected: _status == status,
                          onSelected: (_) {
                            setState(() => _status = status);
                            unawaited(_reload());
                          },
                        ),
                      )
                      .toList(growable: false),
                ),
                const SizedBox(height: 18),
                if (_loading && _storefronts.isEmpty)
                  const _StorefrontSkeleton()
                else if (_error != null)
                  FinanceEmptyState(
                    icon: Icons.cloud_off_outlined,
                    title: l10n.commonSomethingWentWrong,
                    body: _error!,
                    action: shad.SecondaryButton(
                      onPressed: _reload,
                      child: Text(l10n.commonRetry),
                    ),
                  )
                else if (_storefronts.isEmpty)
                  FinanceEmptyState(
                    icon: Icons.storefront_outlined,
                    title: l10n.storefrontEmptyTitle,
                    body: l10n.storefrontEmptyBody,
                    action: shad.PrimaryButton(
                      onPressed: _createStorefront,
                      child: Text(l10n.storefrontCreate),
                    ),
                  )
                else
                  ..._storefronts.map(
                    (storefront) => Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: _StorefrontCard(storefront: storefront),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _StorefrontCard extends StatelessWidget {
  const _StorefrontCard({required this.storefront});

  final Storefront storefront;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    return FinancePanel(
      onTap: () => context.go(Routes.storefrontDetailPath(storefront.id)),
      child: Row(
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: theme.colorScheme.primary.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Icon(
              storefront.isPublished
                  ? Icons.storefront_rounded
                  : Icons.storefront_outlined,
              color: theme.colorScheme.primary,
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  storefront.name,
                  style: theme.typography.large.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  '${storefront.slug} · ${storefront.currency}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.typography.textSmall.copyWith(
                    color: theme.colorScheme.mutedForeground,
                  ),
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    _StatusPill(
                      label: storefrontStatusLabel(
                        context.l10n,
                        storefront.status,
                      ),
                    ),
                    _StatusPill(
                      label: storefrontVisibilityLabel(
                        context.l10n,
                        storefront.visibility,
                      ),
                    ),
                    _StatusPill(
                      label: context.l10n.storefrontListingCount(
                        storefront.listingsCount,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          const Icon(Icons.chevron_right_rounded),
        ],
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: theme.colorScheme.muted.withValues(alpha: 0.55),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: theme.typography.xSmall.copyWith(fontWeight: FontWeight.w700),
      ),
    );
  }
}

class _StorefrontSkeleton extends StatelessWidget {
  const _StorefrontSkeleton();

  @override
  Widget build(BuildContext context) => Column(
    children: List.generate(
      3,
      (index) => const FinanceSkeletonBlock(
        height: 112,
        radius: 24,
        margin: EdgeInsets.only(bottom: 12),
      ),
    ),
  );
}
