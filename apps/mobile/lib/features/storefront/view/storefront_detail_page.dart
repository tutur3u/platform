import 'dart:async';

import 'package:flutter/material.dart' hide Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/widgets/shadcn_flutter_compat.dart' as shad;
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/models/storefront/storefront_models.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/data/repositories/storefront_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/inventory/widgets/inventory_ui.dart';
import 'package:mobile/features/storefront/storefront_labels.dart';
import 'package:mobile/features/storefront/view/storefront_editor_sheet.dart';
import 'package:mobile/features/storefront/view/storefront_listing_editor_sheet.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/async_delete_confirmation_dialog.dart';
import 'package:url_launcher/url_launcher.dart';

class StorefrontDetailPage extends StatefulWidget {
  const StorefrontDetailPage({
    required this.storefrontId,
    super.key,
    this.storefrontRepository,
    this.inventoryRepository,
  });

  final String storefrontId;
  final StorefrontRepository? storefrontRepository;
  final InventoryRepository? inventoryRepository;

  @override
  State<StorefrontDetailPage> createState() => _StorefrontDetailPageState();
}

class _StorefrontDetailPageState extends State<StorefrontDetailPage> {
  late final StorefrontRepository _storefrontRepository;
  late final InventoryRepository _inventoryRepository;
  Storefront? _storefront;
  List<StorefrontListing> _listings = const [];
  List<InventoryProduct> _products = const [];
  bool _loading = false;
  String? _error;
  int _requestToken = 0;

  String? get _wsId =>
      context.read<WorkspaceCubit>().state.currentWorkspace?.id;

  @override
  void initState() {
    super.initState();
    _storefrontRepository =
        widget.storefrontRepository ?? StorefrontRepository();
    _inventoryRepository = widget.inventoryRepository ?? InventoryRepository();
    unawaited(Future<void>.delayed(Duration.zero, _reload));
  }

  @override
  void dispose() {
    if (widget.storefrontRepository == null) _storefrontRepository.dispose();
    if (widget.inventoryRepository == null) _inventoryRepository.dispose();
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
      final results = await Future.wait<Object>([
        _storefrontRepository.getStorefront(wsId, widget.storefrontId),
        _storefrontRepository.listListings(wsId, widget.storefrontId),
        _inventoryRepository.getProductOptions(wsId),
      ]);
      if (!mounted || requestToken != _requestToken) return;
      setState(() {
        _storefront = results[0] as Storefront;
        _listings = results[1] as List<StorefrontListing>;
        _products = results[2] as List<InventoryProduct>;
      });
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

  Future<void> _editStorefront() async {
    final wsId = _wsId;
    final storefront = _storefront;
    if (wsId == null || storefront == null) return;
    final payload = await showStorefrontEditorSheet(
      context,
      storefront: storefront,
    );
    if (payload == null || !mounted) return;
    try {
      final updated = await _storefrontRepository.updateStorefront(
        wsId,
        storefront.id,
        payload,
      );
      if (!mounted) return;
      setState(() => _storefront = updated);
      showInventoryToast(context, context.l10n.storefrontSaved);
    } on ApiException catch (error) {
      if (mounted) {
        showInventoryToast(context, error.message, destructive: true);
      }
    }
  }

  Future<void> _openPreview() async {
    final slug = _storefront?.slug;
    if (slug == null || slug.isEmpty) return;
    final uri = Uri.https('storefront.tuturuuu.com', '/$slug');
    final opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!opened && mounted) {
      showInventoryToast(
        context,
        context.l10n.commonSomethingWentWrong,
        destructive: true,
      );
    }
  }

  Future<void> _editListing([StorefrontListing? listing]) async {
    final wsId = _wsId;
    final storefront = _storefront;
    if (wsId == null || storefront == null) return;
    final payload = await showStorefrontListingEditorSheet(
      context,
      products: _products,
      listing: listing,
    );
    if (payload == null || !mounted) return;
    try {
      if (listing == null) {
        await _storefrontRepository.createListing(wsId, storefront.id, payload);
      } else {
        await _storefrontRepository.updateListing(
          wsId,
          storefront.id,
          listing.id,
          payload,
        );
      }
      if (!mounted) return;
      showInventoryToast(context, context.l10n.storefrontListingSaved);
      await _reload();
    } on ApiException catch (error) {
      if (mounted) {
        showInventoryToast(context, error.message, destructive: true);
      }
    }
  }

  Future<void> _deleteListing(StorefrontListing listing) async {
    final wsId = _wsId;
    final storefront = _storefront;
    if (wsId == null || storefront == null) return;
    final deleted = await shad.showDialog<bool>(
      context: context,
      builder: (_) => AsyncDeleteConfirmationDialog(
        toastContext: context,
        title: context.l10n.storefrontListingDelete,
        message: context.l10n.storefrontListingDeleteConfirm,
        cancelLabel: context.l10n.commonCancel,
        confirmLabel: context.l10n.storefrontListingDelete,
        onConfirm: () => _storefrontRepository.deleteListing(
          wsId,
          storefront.id,
          listing.id,
        ),
      ),
    );
    if (deleted == true && mounted) {
      showInventoryToast(context, context.l10n.storefrontListingDeleted);
      await _reload();
    }
  }

  Future<void> _deleteStorefront() async {
    final wsId = _wsId;
    final storefront = _storefront;
    if (wsId == null || storefront == null) return;
    final deleted = await shad.showDialog<bool>(
      context: context,
      builder: (_) => AsyncDeleteConfirmationDialog(
        toastContext: context,
        title: context.l10n.storefrontDelete,
        message: context.l10n.storefrontDeleteConfirm,
        cancelLabel: context.l10n.commonCancel,
        confirmLabel: context.l10n.storefrontDelete,
        onConfirm: () =>
            _storefrontRepository.deleteStorefront(wsId, storefront.id),
      ),
    );
    if (deleted == true && mounted) {
      showInventoryToast(context, context.l10n.storefrontDeleted);
      context.go(Routes.storefronts);
    }
  }

  @override
  Widget build(BuildContext context) {
    final storefront = _storefront;
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
              physics: const AlwaysScrollableScrollPhysics(),
              padding: EdgeInsets.fromLTRB(
                16,
                8,
                16,
                40 + MediaQuery.paddingOf(context).bottom,
              ),
              children: [
                if (_loading && storefront == null)
                  const _StorefrontDetailSkeleton()
                else if (_error != null && storefront == null)
                  FinanceEmptyState(
                    icon: Icons.cloud_off_outlined,
                    title: context.l10n.commonSomethingWentWrong,
                    body: _error!,
                    action: shad.SecondaryButton(
                      onPressed: _reload,
                      child: Text(context.l10n.commonRetry),
                    ),
                  )
                else if (storefront != null) ...[
                  _StorefrontHeader(
                    storefront: storefront,
                    onEdit: _editStorefront,
                    onPreview: _openPreview,
                    onDelete: _deleteStorefront,
                  ),
                  const SizedBox(height: 20),
                  _ListingsSection(
                    listings: _listings,
                    productsAvailable: _products.isNotEmpty,
                    onCreate: _editListing,
                    onEdit: _editListing,
                    onDelete: _deleteListing,
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _StorefrontHeader extends StatelessWidget {
  const _StorefrontHeader({
    required this.storefront,
    required this.onEdit,
    required this.onPreview,
    required this.onDelete,
  });

  final Storefront storefront;
  final VoidCallback onEdit;
  final VoidCallback onPreview;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) => InventoryHeroCard(
    title: storefront.name,
    subtitle:
        storefront.description ?? 'storefront.tuturuuu.com/${storefront.slug}',
    icon: Icons.storefront_rounded,
    metrics: [
      InventoryMetricTile(
        label: context.l10n.storefrontStatus,
        value: storefrontStatusLabel(context.l10n, storefront.status),
        icon: Icons.published_with_changes_outlined,
      ),
      InventoryMetricTile(
        label: context.l10n.storefrontVisibility,
        value: storefrontVisibilityLabel(context.l10n, storefront.visibility),
        icon: Icons.public_outlined,
      ),
      InventoryMetricTile(
        label: context.l10n.storefrontListings,
        value: '${storefront.listingsCount}',
        icon: Icons.sell_outlined,
      ),
    ],
    actions: [
      shad.SecondaryButton(
        onPressed: onPreview,
        child: Text(context.l10n.storefrontPreview),
      ),
      shad.SecondaryButton(
        onPressed: onEdit,
        child: Text(context.l10n.storefrontEdit),
      ),
      shad.DestructiveButton(
        onPressed: onDelete,
        child: Text(context.l10n.storefrontDelete),
      ),
    ],
  );
}

class _ListingsSection extends StatelessWidget {
  const _ListingsSection({
    required this.listings,
    required this.productsAvailable,
    required this.onCreate,
    required this.onEdit,
    required this.onDelete,
  });

  final List<StorefrontListing> listings;
  final bool productsAvailable;
  final VoidCallback onCreate;
  final ValueChanged<StorefrontListing> onEdit;
  final ValueChanged<StorefrontListing> onDelete;

  @override
  Widget build(BuildContext context) => FinancePanel(
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                context.l10n.storefrontListings,
                style: shad.Theme.of(context).typography.h4,
              ),
            ),
            shad.PrimaryButton(
              onPressed: productsAvailable ? onCreate : null,
              child: Text(context.l10n.storefrontListingCreate),
            ),
          ],
        ),
        if (!productsAvailable) ...[
          const SizedBox(height: 12),
          Text(context.l10n.storefrontProductsRequired),
        ],
        const SizedBox(height: 16),
        if (listings.isEmpty)
          FinanceEmptyState(
            icon: Icons.sell_outlined,
            title: context.l10n.storefrontListingsEmptyTitle,
            body: context.l10n.storefrontListingsEmptyBody,
          )
        else
          ...listings.map(
            (listing) => _ListingTile(
              listing: listing,
              onEdit: () => onEdit(listing),
              onDelete: () => onDelete(listing),
            ),
          ),
      ],
    ),
  );
}

class _ListingTile extends StatelessWidget {
  const _ListingTile({
    required this.listing,
    required this.onEdit,
    required this.onDelete,
  });

  final StorefrontListing listing;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: theme.colorScheme.muted.withValues(alpha: 0.28),
        borderRadius: BorderRadius.circular(18),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  listing.title,
                  style: theme.typography.base.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  '${listing.price.toStringAsFixed(0)} · '
                  '${storefrontStatusLabel(context.l10n, listing.status)}',
                  style: theme.typography.textSmall.copyWith(
                    color: theme.colorScheme.mutedForeground,
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            tooltip: context.l10n.storefrontListingEdit,
            onPressed: onEdit,
            icon: const Icon(Icons.edit_outlined),
          ),
          IconButton(
            tooltip: context.l10n.storefrontListingDelete,
            onPressed: onDelete,
            icon: Icon(
              Icons.delete_outline_rounded,
              color: theme.colorScheme.destructive,
            ),
          ),
        ],
      ),
    );
  }
}

class _StorefrontDetailSkeleton extends StatelessWidget {
  const _StorefrontDetailSkeleton();

  @override
  Widget build(BuildContext context) => const Column(
    children: [
      FinanceSkeletonBlock(height: 250, radius: 28),
      SizedBox(height: 20),
      FinanceSkeletonBlock(height: 320, radius: 24),
    ],
  );
}
