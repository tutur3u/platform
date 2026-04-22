import 'dart:async';

import 'package:flutter/material.dart' hide AppBar, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_colorpicker/flutter_colorpicker.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/icons/platform_icon.dart';
import 'package:mobile/core/input/platform_text_context_menu.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/utils/color_hex.dart';
import 'package:mobile/core/utils/currency_formatter.dart';
import 'package:mobile/data/models/finance/category.dart';
import 'package:mobile/data/models/finance/tag.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/finance/finance_cache.dart';
import 'package:mobile/features/finance/widgets/finance_modal_scaffold.dart';
import 'package:mobile/features/finance/widgets/finance_shell_actions.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/settings/cubit/finance_preferences_cubit.dart';
import 'package:mobile/features/shell/view/shell_mini_nav.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/async_delete_confirmation_dialog.dart';
import 'package:mobile/widgets/fab/fab_action.dart';
import 'package:mobile/widgets/fab/speed_dial_fab.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:mobile/widgets/platform_icon_picker.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class TransactionCategoriesPage extends StatelessWidget {
  const TransactionCategoriesPage({super.key});

  static void clearCaches() {
    _TransactionCategoriesViewState.clearMemoryCaches();
  }

  @override
  Widget build(BuildContext context) {
    return RepositoryProvider(
      create: (_) => FinanceRepository(),
      child: const _TransactionCategoriesView(),
    );
  }
}

class _TransactionCategoriesView extends StatefulWidget {
  const _TransactionCategoriesView();

  @override
  State<_TransactionCategoriesView> createState() =>
      _TransactionCategoriesViewState();
}

class _TransactionCategoriesViewState
    extends State<_TransactionCategoriesView> {
  static const double _fabContentBottomPadding = 96;
  static const _tabCategories = 0;
  static const _tabTags = 1;
  static const CachePolicy _cachePolicy = CachePolicies.moduleData;
  static const _categoriesCacheTag = 'finance:categories';
  static const _tagsCacheTag = 'finance:tags';
  static final Map<String, _CategoryCacheEntry> _categoriesCache = {};
  static final Map<String, _TagCacheEntry> _tagsCache = {};

  static void clearMemoryCaches() {
    _categoriesCache.clear();
    _tagsCache.clear();
  }

  List<TransactionCategory> _categories = const [];
  List<FinanceTag> _tags = const [];
  int _activeTab = _tabCategories;
  bool _categoriesLoading = false;
  bool _tagsLoading = false;
  String? _categoriesError;
  String? _tagsError;
  int _categoriesRequestId = 0;
  int _tagsRequestId = 0;
  String? _categoriesWorkspaceId;
  String? _tagsWorkspaceId;
  String? _workspaceCurrency;

  @override
  void initState() {
    super.initState();
    _seedFromCache();
    unawaited(_loadCurrentTab());
  }

  CacheKey _categoriesStoreKey(String wsId) {
    return CacheKey(
      namespace: 'finance.categories',
      userId: currentCacheUserId(),
      workspaceId: wsId,
      locale: currentCacheLocaleTag(),
    );
  }

  CacheKey _tagsStoreKey(String wsId) {
    return CacheKey(
      namespace: 'finance.tags',
      userId: currentCacheUserId(),
      workspaceId: wsId,
      locale: currentCacheLocaleTag(),
    );
  }

  String _memoryCacheKey(String wsId) => userScopedCacheKey(wsId);

  void _seedFromCache() {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) {
      return;
    }

    final cachedCategories = CacheStore.instance
        .peek<List<TransactionCategory>>(
          key: _categoriesStoreKey(wsId),
          decode: _decodeCategories,
        );
    _workspaceCurrency = context
        .read<FinanceRepository>()
        .peekWorkspaceDefaultCurrency(wsId);
    if (cachedCategories.hasValue && cachedCategories.data != null) {
      _categories = cachedCategories.data!;
      _categoriesWorkspaceId = wsId;
    }

    final cachedTags = CacheStore.instance.peek<List<FinanceTag>>(
      key: _tagsStoreKey(wsId),
      decode: _decodeTags,
    );
    if (cachedTags.hasValue && cachedTags.data != null) {
      _tags = cachedTags.data!;
      _tagsWorkspaceId = wsId;
    }
  }

  List<TransactionCategory> _decodeCategories(Object? json) {
    if (json is! List) {
      throw const FormatException('Invalid categories cache payload.');
    }
    return json
        .whereType<Map<String, dynamic>>()
        .map(TransactionCategory.fromJson)
        .toList(growable: false);
  }

  List<FinanceTag> _decodeTags(Object? json) {
    if (json is! List) {
      throw const FormatException('Invalid finance tags cache payload.');
    }
    return json
        .whereType<Map<String, dynamic>>()
        .map(FinanceTag.fromJson)
        .toList(growable: false);
  }

  void _switchTab(int value) {
    setState(() {
      _activeTab = value;
      if (value == _tabCategories) {
        _categoriesError = null;
      } else {
        _tagsError = null;
      }
    });

    final workspaceId = context
        .read<WorkspaceCubit>()
        .state
        .currentWorkspace
        ?.id;
    if (value == _tabCategories && _categoriesWorkspaceId != workspaceId) {
      unawaited(_loadCategories());
      return;
    }
    if (value == _tabTags && _tagsWorkspaceId != workspaceId) {
      unawaited(_loadTags());
      return;
    }
    if (value == _tabCategories) {
      unawaited(_loadCategories());
    } else {
      unawaited(_loadTags());
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final showAmounts = context.select<FinancePreferencesCubit, bool>(
      (cubit) => cubit.state.showAmounts,
    );
    final listBottomPadding =
        _fabContentBottomPadding + MediaQuery.paddingOf(context).bottom;

    return shad.Scaffold(
      child: BlocListener<WorkspaceCubit, WorkspaceState>(
        listenWhen: (prev, curr) =>
            prev.currentWorkspace?.id != curr.currentWorkspace?.id,
        listener: (context, state) =>
            unawaited(_handleWorkspaceChanged(state.currentWorkspace?.id)),
        child: Stack(
          children: [
            const FinanceAmountVisibilityShellAction(
              ownerId: 'finance-manage-amount-visibility',
              locations: {Routes.categories},
            ),
            ShellMiniNav(
              ownerId: 'finance-manage-mini-nav',
              locations: const {Routes.categories},
              deepLinkBackRoute: Routes.finance,
              items: [
                ShellMiniNavItemSpec(
                  id: 'back',
                  icon: Icons.chevron_left,
                  label: l10n.navBack,
                  callbackToken: 'back',
                  onPressed: () => context.go(Routes.finance),
                ),
                ShellMiniNavItemSpec(
                  id: 'categories',
                  icon: Icons.category_outlined,
                  label: l10n.financeCategories,
                  selected: _activeTab == _tabCategories,
                  callbackToken: 'categories-$_activeTab',
                  onPressed: () => _switchTab(_tabCategories),
                ),
                ShellMiniNavItemSpec(
                  id: 'tags',
                  icon: Icons.label_outline,
                  label: l10n.financeTags,
                  selected: _activeTab == _tabTags,
                  callbackToken: 'tags-$_activeTab',
                  onPressed: () => _switchTab(_tabTags),
                ),
              ],
            ),
            RefreshIndicator(
              onRefresh: () => _loadCurrentTab(forceRefresh: true),
              child: _activeTab == _tabCategories
                  ? _buildCategoriesContent(
                      l10n,
                      listBottomPadding,
                      showAmounts,
                    )
                  : _buildTagsContent(
                      l10n,
                      listBottomPadding,
                      showAmounts,
                    ),
            ),
            SpeedDialFab(
              label: l10n.financeCreateCategory,
              icon: Icons.add,
              includeBottomSafeArea: false,
              actions: [
                FabAction(
                  icon: Icons.category_outlined,
                  label: l10n.financeCreateCategory,
                  onPressed: _onCreateCategory,
                ),
                FabAction(
                  icon: Icons.label_outline,
                  label: l10n.financeCreateTag,
                  onPressed: _onCreateTag,
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCategoriesContent(
    AppLocalizations l10n,
    double listBottomPadding,
    bool showAmounts,
  ) {
    if (_categoriesLoading) {
      return const Center(child: NovaLoadingIndicator());
    }
    if (_categoriesError != null) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: EdgeInsets.fromLTRB(16, 8, 16, listBottomPadding),
        children: [
          FinanceEmptyState(
            icon: Icons.error_outline,
            title: l10n.commonSomethingWentWrong,
            body: _categoriesError!,
            action: shad.SecondaryButton(
              onPressed: _loadCategories,
              child: Text(l10n.commonRetry),
            ),
          ),
        ],
      );
    }
    if (_categories.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: EdgeInsets.fromLTRB(16, 8, 16, listBottomPadding),
        children: [
          FinanceEmptyState(
            icon: Icons.category_outlined,
            title: l10n.financeNoCategories,
            body: l10n.financeManageCategoriesEmptyBody,
            action: shad.SecondaryButton(
              onPressed: _onCreateCategory,
              child: Text(l10n.financeCreateCategory),
            ),
          ),
        ],
      );
    }
    if (_workspaceCurrency == null || _workspaceCurrency!.trim().isEmpty) {
      return ListView.separated(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: EdgeInsets.fromLTRB(16, 8, 16, listBottomPadding),
        itemCount: _categories.length.clamp(1, 6),
        separatorBuilder: (context, index) => const shad.Gap(8),
        itemBuilder: (context, index) => const _ManageFinanceCardSkeleton(),
      );
    }
    return ListView.separated(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: EdgeInsets.fromLTRB(16, 8, 16, listBottomPadding),
      itemCount: _categories.length,
      separatorBuilder: (context, index) => const shad.Gap(8),
      itemBuilder: (context, index) {
        final category = _categories[index];
        return _CategoryCard(
          category: category,
          currencyCode: _workspaceCurrency!,
          showAmounts: showAmounts,
          onEdit: () => _onEdit(category),
          onDelete: () => _onDelete(category),
        );
      },
    );
  }

  Widget _buildTagsContent(
    AppLocalizations l10n,
    double listBottomPadding,
    bool showAmounts,
  ) {
    if (_tagsLoading) {
      return const Center(child: NovaLoadingIndicator());
    }
    if (_tagsError != null) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: EdgeInsets.fromLTRB(16, 8, 16, listBottomPadding),
        children: [
          FinanceEmptyState(
            icon: Icons.error_outline,
            title: l10n.commonSomethingWentWrong,
            body: _tagsError!,
            action: shad.SecondaryButton(
              onPressed: _loadTags,
              child: Text(l10n.commonRetry),
            ),
          ),
        ],
      );
    }
    if (_tags.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: EdgeInsets.fromLTRB(16, 8, 16, listBottomPadding),
        children: [
          FinanceEmptyState(
            icon: Icons.sell_outlined,
            title: l10n.financeNoTags,
            body: l10n.financeManageTagsEmptyBody,
            action: shad.SecondaryButton(
              onPressed: _onCreateTag,
              child: Text(l10n.financeCreateTag),
            ),
          ),
        ],
      );
    }
    if (_workspaceCurrency == null || _workspaceCurrency!.trim().isEmpty) {
      return ListView.separated(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: EdgeInsets.fromLTRB(16, 8, 16, listBottomPadding),
        itemCount: _tags.length.clamp(1, 6),
        separatorBuilder: (context, index) => const shad.Gap(8),
        itemBuilder: (context, index) => const _ManageFinanceCardSkeleton(),
      );
    }
    return ListView.separated(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: EdgeInsets.fromLTRB(16, 8, 16, listBottomPadding),
      itemCount: _tags.length,
      separatorBuilder: (context, index) => const shad.Gap(8),
      itemBuilder: (context, index) {
        final tag = _tags[index];
        return _TagCard(
          tag: tag,
          currencyCode: _workspaceCurrency!,
          showAmounts: showAmounts,
          onEdit: () => _onEditTag(tag),
          onDelete: () => _onDeleteTag(tag),
        );
      },
    );
  }

  Future<void> _onCreateCategory() async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;
    final changed = await _showCategoryDialog(wsId: wsId);
    if (changed) {
      await _loadCategories(forceRefresh: true);
    }
  }

  Future<void> _onDelete(TransactionCategory category) async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;

    final repository = context.read<FinanceRepository>();
    final l10n = context.l10n;
    final toastContext = Navigator.of(context, rootNavigator: true).context;

    final deleted =
        await shad.showDialog<bool>(
          context: context,
          builder: (_) => AsyncDeleteConfirmationDialog(
            title: l10n.financeDeleteCategory,
            message: l10n.financeDeleteCategoryConfirm,
            cancelLabel: l10n.commonCancel,
            confirmLabel: l10n.financeDeleteCategory,
            toastContext: toastContext,
            onConfirm: () async {
              await repository.deleteCategory(
                wsId: wsId,
                categoryId: category.id,
              );
            },
          ),
        ) ??
        false;

    if (!mounted || !deleted) return;
    await _loadCategories(forceRefresh: true);
  }

  Future<void> _onEdit(TransactionCategory category) async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;
    final changed = await _showCategoryDialog(wsId: wsId, category: category);
    if (changed) {
      await _loadCategories(forceRefresh: true);
    }
  }

  Future<void> _onCreateTag() async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;
    final changed = await _showTagDialog(wsId: wsId);
    if (changed) {
      await _loadTags(forceRefresh: true);
    }
  }

  Future<void> _onDeleteTag(FinanceTag tag) async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;

    final repository = context.read<FinanceRepository>();
    final l10n = context.l10n;
    final toastContext = Navigator.of(context, rootNavigator: true).context;

    final deleted =
        await shad.showDialog<bool>(
          context: context,
          builder: (_) => AsyncDeleteConfirmationDialog(
            title: l10n.financeDeleteTag,
            message: l10n.financeDeleteTagConfirm,
            cancelLabel: l10n.commonCancel,
            confirmLabel: l10n.financeDeleteTag,
            toastContext: toastContext,
            onConfirm: () async {
              await repository.deleteTag(wsId: wsId, tagId: tag.id);
            },
          ),
        ) ??
        false;

    if (!mounted || !deleted) return;
    await _loadTags(forceRefresh: true);
  }

  Future<void> _onEditTag(FinanceTag tag) async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;
    final changed = await _showTagDialog(wsId: wsId, tag: tag);
    if (changed) {
      await _loadTags(forceRefresh: true);
    }
  }

  Future<void> _loadCurrentTab({bool forceRefresh = false}) async {
    if (_activeTab == _tabTags) {
      await _loadTags(forceRefresh: forceRefresh);
      return;
    }
    await _loadCategories(forceRefresh: forceRefresh);
  }

  Future<void> _handleWorkspaceChanged(String? workspaceId) async {
    _categoriesRequestId++;
    _tagsRequestId++;

    if (!mounted) return;

    if (workspaceId == null) {
      setState(() {
        _categories = const [];
        _tags = const [];
        _categoriesWorkspaceId = null;
        _tagsWorkspaceId = null;
        _workspaceCurrency = null;
        _categoriesLoading = false;
        _tagsLoading = false;
        _categoriesError = null;
        _tagsError = null;
      });
      return;
    }

    await _loadCurrentTab();
  }

  bool _isWorkspaceRequestCurrent(String wsId) {
    return context.read<WorkspaceCubit>().state.currentWorkspace?.id == wsId;
  }

  Future<void> _loadCategories({bool forceRefresh = false}) async {
    final requestId = ++_categoriesRequestId;

    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) {
      if (!mounted || requestId != _categoriesRequestId) return;
      setState(() {
        _categories = const [];
        _categoriesWorkspaceId = null;
        _categoriesLoading = false;
        _categoriesError = null;
      });
      return;
    }

    final repository = context.read<FinanceRepository>();
    final currencyFuture = repository.getWorkspaceDefaultCurrency(
      wsId,
      forceRefresh: forceRefresh,
    );
    final cached = _categoriesCache[_memoryCacheKey(wsId)];
    final diskCached = await CacheStore.instance
        .read<List<TransactionCategory>>(
          key: _categoriesStoreKey(wsId),
          decode: _decodeCategories,
        );
    final resolvedCategories = cached?.categories ?? diskCached.data;
    final hasVisibleData = _categoriesWorkspaceId == wsId;

    if (!mounted || requestId != _categoriesRequestId) return;

    if (!forceRefresh && resolvedCategories != null) {
      final currency = await currencyFuture;
      if (!mounted || requestId != _categoriesRequestId) return;
      setState(() {
        _categories = resolvedCategories;
        _categoriesWorkspaceId = wsId;
        _workspaceCurrency = currency;
        _categoriesLoading = false;
        _categoriesError = null;
      });
      if ((cached != null && isFinanceCacheFresh(cached.fetchedAt)) ||
          diskCached.isFresh) {
        return;
      }
    } else if (!hasVisibleData) {
      setState(() {
        _categories = const [];
        _categoriesWorkspaceId = wsId;
        _categoriesLoading = true;
        _categoriesError = null;
      });
    } else {
      setState(() => _categoriesError = null);
    }

    try {
      final currency = await currencyFuture;
      final categories = await repository.getCategories(wsId);
      if (!mounted ||
          requestId != _categoriesRequestId ||
          !_isWorkspaceRequestCurrent(wsId)) {
        return;
      }
      _categoriesCache[_memoryCacheKey(wsId)] = _CategoryCacheEntry(
        categories: categories,
        fetchedAt: DateTime.now(),
      );
      await CacheStore.instance.write(
        key: _categoriesStoreKey(wsId),
        policy: _cachePolicy,
        payload: categories
            .map((category) => category.toJson())
            .toList(growable: false),
        tags: [_categoriesCacheTag, 'workspace:$wsId', 'module:finance'],
      );
      setState(() {
        _categories = categories;
        _categoriesWorkspaceId = wsId;
        _workspaceCurrency = currency;
        _categoriesError = null;
      });
    } on Exception {
      if (!mounted ||
          requestId != _categoriesRequestId ||
          !_isWorkspaceRequestCurrent(wsId)) {
        return;
      }
      if (resolvedCategories != null || hasVisibleData) {
        setState(() => _categoriesError = null);
      } else {
        setState(
          () => _categoriesError = context.l10n.commonSomethingWentWrong,
        );
      }
    } finally {
      if (mounted && requestId == _categoriesRequestId) {
        setState(() => _categoriesLoading = false);
      }
    }
  }

  Future<void> _loadTags({bool forceRefresh = false}) async {
    final requestId = ++_tagsRequestId;

    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) {
      if (!mounted || requestId != _tagsRequestId) return;
      setState(() {
        _tags = const [];
        _tagsWorkspaceId = null;
        _tagsLoading = false;
        _tagsError = null;
      });
      return;
    }

    final repository = context.read<FinanceRepository>();
    final currencyFuture = repository.getWorkspaceDefaultCurrency(
      wsId,
      forceRefresh: forceRefresh,
    );
    final cached = _tagsCache[_memoryCacheKey(wsId)];
    final diskCached = await CacheStore.instance.read<List<FinanceTag>>(
      key: _tagsStoreKey(wsId),
      decode: _decodeTags,
    );
    final resolvedTags = cached?.tags ?? diskCached.data;
    final hasVisibleData = _tagsWorkspaceId == wsId;

    if (!mounted || requestId != _tagsRequestId) return;

    if (!forceRefresh && resolvedTags != null) {
      final currency = await currencyFuture;
      if (!mounted || requestId != _tagsRequestId) return;
      setState(() {
        _tags = resolvedTags;
        _tagsWorkspaceId = wsId;
        _workspaceCurrency = currency;
        _tagsLoading = false;
        _tagsError = null;
      });
      if ((cached != null && isFinanceCacheFresh(cached.fetchedAt)) ||
          diskCached.isFresh) {
        return;
      }
    } else if (!hasVisibleData) {
      setState(() {
        _tags = const [];
        _tagsWorkspaceId = wsId;
        _tagsLoading = true;
        _tagsError = null;
      });
    } else {
      setState(() => _tagsError = null);
    }

    try {
      final currency = await currencyFuture;
      final tags = await repository.getTags(wsId);
      if (!mounted ||
          requestId != _tagsRequestId ||
          !_isWorkspaceRequestCurrent(wsId)) {
        return;
      }
      _tagsCache[_memoryCacheKey(wsId)] = _TagCacheEntry(
        tags: tags,
        fetchedAt: DateTime.now(),
      );
      await CacheStore.instance.write(
        key: _tagsStoreKey(wsId),
        policy: _cachePolicy,
        payload: tags.map(_tagToJson).toList(growable: false),
        tags: [_tagsCacheTag, 'workspace:$wsId', 'module:finance'],
      );
      setState(() {
        _tags = tags;
        _tagsWorkspaceId = wsId;
        _workspaceCurrency = currency;
        _tagsError = null;
      });
    } on Exception {
      if (!mounted ||
          requestId != _tagsRequestId ||
          !_isWorkspaceRequestCurrent(wsId)) {
        return;
      }
      if (resolvedTags != null || hasVisibleData) {
        setState(() => _tagsError = null);
      } else {
        setState(() => _tagsError = context.l10n.commonSomethingWentWrong);
      }
    } finally {
      if (mounted && requestId == _tagsRequestId) {
        setState(() => _tagsLoading = false);
      }
    }
  }

  Future<bool> _showCategoryDialog({
    required String wsId,
    TransactionCategory? category,
  }) async {
    final repository = context.read<FinanceRepository>();
    final createdOrUpdated = await showFinanceFullscreenModal<bool>(
      context: context,
      builder: (_) => _CategoryDialog(
        wsId: wsId,
        category: category,
        repository: repository,
      ),
    );

    return createdOrUpdated ?? false;
  }

  Future<bool> _showTagDialog({required String wsId, FinanceTag? tag}) async {
    final repository = context.read<FinanceRepository>();
    final createdOrUpdated = await showFinanceFullscreenModal<bool>(
      context: context,
      builder: (_) => _TagDialog(wsId: wsId, tag: tag, repository: repository),
    );

    return createdOrUpdated ?? false;
  }
}

class _CategoryCacheEntry {
  const _CategoryCacheEntry({
    required this.categories,
    required this.fetchedAt,
  });

  final List<TransactionCategory> categories;
  final DateTime fetchedAt;
}

class _TagCacheEntry {
  const _TagCacheEntry({
    required this.tags,
    required this.fetchedAt,
  });

  final List<FinanceTag> tags;
  final DateTime fetchedAt;
}

Map<String, dynamic> _tagToJson(FinanceTag tag) {
  return {
    'id': tag.id,
    'name': tag.name,
    'color': tag.color,
    'description': tag.description,
    'ws_id': tag.wsId,
    'amount': tag.amount,
    'transaction_count': tag.transactionCount,
  };
}

class _CategoryDialog extends StatefulWidget {
  const _CategoryDialog({
    required this.wsId,
    required this.repository,
    this.category,
  });

  final String wsId;
  final FinanceRepository repository;
  final TransactionCategory? category;

  @override
  State<_CategoryDialog> createState() => _CategoryDialogState();
}

class _CategoryDialogState extends State<_CategoryDialog> {
  late final TextEditingController _nameController;
  late bool _isExpense;
  String? _icon;
  String? _colorHex;
  String? _nameError;
  bool _isSaving = false;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController(text: widget.category?.name ?? '');
    _isExpense = widget.category?.isExpense ?? true;
    _icon = widget.category?.icon;
    _colorHex = normalizeHex(widget.category?.color ?? '');
  }

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final previewColor =
        parseHex(_colorHex) ??
        (_isExpense
            ? shad.Theme.of(context).colorScheme.destructive
            : shad.Theme.of(context).colorScheme.primary);
    final previewIcon = resolvePlatformIcon(
      _icon,
      fallback: _isExpense ? Icons.arrow_downward : Icons.arrow_upward,
    );

    return FinanceFullscreenFormScaffold(
      title: widget.category == null
          ? context.l10n.financeCreateCategory
          : context.l10n.financeEditCategory,
      subtitle: context.l10n.financeCategoryDialogSubtitle,
      primaryActionLabel: widget.category == null
          ? context.l10n.financeCreateCategory
          : context.l10n.timerSave,
      onPrimaryPressed: _isSaving ? null : _saveCategory,
      onClose: _isSaving ? null : () => Navigator.of(context).pop(false),
      isSaving: _isSaving,
      child: ListView(
        children: [
          _TaxonomyPreviewCard(
            name: _nameController.text.trim().isEmpty
                ? context.l10n.financeCreateCategory
                : _nameController.text.trim(),
            subtitle: _isExpense
                ? context.l10n.financeExpense
                : context.l10n.financeIncome,
            previewColor: previewColor,
            icon: previewIcon,
          ),
          const shad.Gap(12),
          FinanceFormSection(
            title: context.l10n.timerCategoryName,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _TaxonomyTextField(
                  controller: _nameController,
                  placeholder: context.l10n.timerCategoryName,
                  autofocus: true,
                  errorText: _nameError,
                  onChanged: _onNameChanged,
                ),
                const shad.Gap(10),
                _TaxonomyFieldLabel(label: context.l10n.financeType),
                const shad.Gap(4),
                _TaxonomySegmentedRow(
                  leftLabel: context.l10n.financeExpense,
                  rightLabel: context.l10n.financeIncome,
                  leftSelected: _isExpense,
                  onLeftPressed: () => setState(() => _isExpense = true),
                  onRightPressed: () => setState(() => _isExpense = false),
                ),
              ],
            ),
          ),
          const shad.Gap(12),
          FinanceFormSection(
            title: context.l10n.financeIcon,
            child: PlatformIconPickerField(
              value: _icon,
              title: context.l10n.financeSelectIcon,
              searchPlaceholder: context.l10n.financeSearchIcons,
              emptyText: context.l10n.financeNoIconsFound,
              showLabel: false,
              onChanged: (value) => setState(() => _icon = value),
            ),
          ),
          const shad.Gap(12),
          FinanceFormSection(
            title: context.l10n.calendarEventColor,
            child: _TaxonomyColorSection(
              colorHex: _colorHex ?? context.l10n.financeNoColor,
              previewColor: previewColor,
              onPickColor: _openColorPicker,
              onRandomize: () => setState(() => _colorHex = randomHexColor()),
              onClear: _colorHex == null
                  ? null
                  : () => setState(() => _colorHex = null),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _saveCategory() async {
    final nameError = _validateName(_nameController.text);
    setState(() => _nameError = nameError);
    if (nameError != null) {
      return;
    }

    final rootNav = Navigator.of(context, rootNavigator: true);
    final toastContext = rootNav.context;

    setState(() => _isSaving = true);
    try {
      final repository = widget.repository;
      final color = _colorHex;
      if (widget.category == null) {
        await repository.createCategory(
          wsId: widget.wsId,
          name: _nameController.text.trim(),
          isExpense: _isExpense,
          icon: _icon,
          color: color,
        );
      } else {
        await repository.updateCategory(
          wsId: widget.wsId,
          categoryId: widget.category!.id,
          name: _nameController.text.trim(),
          isExpense: _isExpense,
          icon: _icon,
          color: color,
        );
      }
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      final message = e.message.trim();
      final details = message.isEmpty || message == 'Request failed'
          ? context.l10n.commonSomethingWentWrong
          : message;

      if (toastContext.mounted) {
        shad.showToast(
          context: toastContext,
          builder: (ctx, _) => shad.Alert.destructive(
            title: Text(ctx.l10n.commonSomethingWentWrong),
            content: Text(details),
          ),
        );
      }
      if (mounted) {
        setState(() => _isSaving = false);
      }
    } on Exception {
      if (toastContext.mounted) {
        shad.showToast(
          context: toastContext,
          builder: (ctx, _) => shad.Alert.destructive(
            content: Text(ctx.l10n.commonSomethingWentWrong),
          ),
        );
      }
      if (mounted) {
        setState(() => _isSaving = false);
      }
    }
  }

  void _onNameChanged(String value) {
    setState(() => _nameError = _validateName(value));
  }

  String? _validateName(String value) {
    if (value.trim().isEmpty) {
      return context.l10n.financeCategoryNameRequired;
    }
    return null;
  }

  Future<void> _openColorPicker() async {
    var selected =
        parseHex(_colorHex) ??
        (_isExpense
            ? shad.Theme.of(context).colorScheme.destructive
            : shad.Theme.of(context).colorScheme.primary);

    final result = await showFinanceModal<Color>(
      context: context,
      builder: (dialogContext) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return FinanceModalScaffold(
              title: context.l10n.financePickColor,
              actions: [
                shad.OutlineButton(
                  onPressed: () => Navigator.of(dialogContext).pop(),
                  child: Text(context.l10n.commonCancel),
                ),
                shad.PrimaryButton(
                  onPressed: () => Navigator.of(dialogContext).pop(selected),
                  child: Text(context.l10n.timerSave),
                ),
              ],
              child: ColorPicker(
                pickerColor: selected,
                onColorChanged: (color) =>
                    setDialogState(() => selected = color),
                enableAlpha: false,
                portraitOnly: true,
                labelTypes: const [ColorLabelType.hex],
                pickerAreaHeightPercent: 0.72,
                displayThumbColor: true,
                hexInputBar: true,
              ),
            );
          },
        );
      },
    );

    if (result != null && mounted) {
      setState(() => _colorHex = colorToHexString(result));
    }
  }
}

class _TagDialog extends StatefulWidget {
  const _TagDialog({
    required this.wsId,
    required this.repository,
    this.tag,
  });

  final String wsId;
  final FinanceRepository repository;
  final FinanceTag? tag;

  @override
  State<_TagDialog> createState() => _TagDialogState();
}

class _TagDialogState extends State<_TagDialog> {
  late final TextEditingController _nameController;
  late final TextEditingController _descriptionController;
  String? _colorHex;
  String? _nameError;
  bool _isSaving = false;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController(text: widget.tag?.name ?? '');
    _descriptionController = TextEditingController(
      text: widget.tag?.description ?? '',
    );
    _colorHex = normalizeHex(widget.tag?.color ?? '') ?? '#3B82F6';
  }

  @override
  void dispose() {
    _nameController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final previewColor = parseHex(_colorHex) ?? const Color(0xFF3B82F6);

    return FinanceFullscreenFormScaffold(
      title: widget.tag == null
          ? context.l10n.financeCreateTag
          : context.l10n.financeEditTag,
      subtitle: context.l10n.financeTagDialogSubtitle,
      primaryActionLabel: widget.tag == null
          ? context.l10n.financeCreateTag
          : context.l10n.timerSave,
      onPrimaryPressed: _isSaving ? null : _saveTag,
      onClose: _isSaving ? null : () => Navigator.of(context).pop(false),
      isSaving: _isSaving,
      child: ListView(
        children: [
          _TaxonomyPreviewCard(
            name: _nameController.text.trim().isEmpty
                ? context.l10n.financeCreateTag
                : _nameController.text.trim(),
            subtitle: _descriptionController.text.trim().isEmpty
                ? context.l10n.financeTagDialogSubtitle
                : _descriptionController.text.trim(),
            previewColor: previewColor,
            icon: Icons.sell_outlined,
          ),
          const shad.Gap(12),
          FinanceFormSection(
            title: context.l10n.financeTagName,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _TaxonomyTextField(
                  controller: _nameController,
                  placeholder: context.l10n.financeTagName,
                  autofocus: true,
                  errorText: _nameError,
                  onChanged: _onNameChanged,
                ),
                const shad.Gap(10),
                _TaxonomyFieldLabel(label: context.l10n.financeDescription),
                const shad.Gap(4),
                _TaxonomyTextArea(
                  controller: _descriptionController,
                  placeholder: context.l10n.financeDescription,
                  onChanged: (_) => setState(() {}),
                ),
              ],
            ),
          ),
          const shad.Gap(12),
          FinanceFormSection(
            title: context.l10n.calendarEventColor,
            child: _TaxonomyColorSection(
              colorHex: _colorHex ?? '#3B82F6',
              previewColor: previewColor,
              onPickColor: _openColorPicker,
              onRandomize: () => setState(() => _colorHex = randomHexColor()),
              onClear: _colorHex == null
                  ? null
                  : () => setState(() => _colorHex = '#3B82F6'),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _saveTag() async {
    final nameError = _validateName(_nameController.text);
    setState(() => _nameError = nameError);
    if (nameError != null) return;

    final rootNav = Navigator.of(context, rootNavigator: true);
    final toastContext = rootNav.context;

    setState(() => _isSaving = true);
    try {
      final repository = widget.repository;
      final description = _descriptionController.text.trim();
      if (widget.tag == null) {
        await repository.createTag(
          wsId: widget.wsId,
          name: _nameController.text.trim(),
          color: _colorHex ?? '#3B82F6',
          description: description.isEmpty ? null : description,
        );
      } else {
        await repository.updateTag(
          wsId: widget.wsId,
          tagId: widget.tag!.id,
          name: _nameController.text.trim(),
          color: _colorHex ?? '#3B82F6',
          description: description.isEmpty ? null : description,
        );
      }
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      final message = e.message.trim();
      final details = message.isEmpty || message == 'Request failed'
          ? context.l10n.commonSomethingWentWrong
          : message;

      if (toastContext.mounted) {
        shad.showToast(
          context: toastContext,
          builder: (ctx, _) => shad.Alert.destructive(
            title: Text(ctx.l10n.commonSomethingWentWrong),
            content: Text(details),
          ),
        );
      }
      if (mounted) {
        setState(() => _isSaving = false);
      }
    } on Exception {
      if (toastContext.mounted) {
        shad.showToast(
          context: toastContext,
          builder: (ctx, _) => shad.Alert.destructive(
            content: Text(ctx.l10n.commonSomethingWentWrong),
          ),
        );
      }
      if (mounted) {
        setState(() => _isSaving = false);
      }
    }
  }

  void _onNameChanged(String value) {
    setState(() => _nameError = _validateName(value));
  }

  String? _validateName(String value) {
    if (value.trim().isEmpty) {
      return context.l10n.financeTagNameRequired;
    }
    return null;
  }

  Future<void> _openColorPicker() async {
    var selected = parseHex(_colorHex) ?? const Color(0xFF3B82F6);

    final result = await showFinanceModal<Color>(
      context: context,
      builder: (dialogContext) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            return FinanceModalScaffold(
              title: context.l10n.financePickColor,
              actions: [
                shad.OutlineButton(
                  onPressed: () => Navigator.of(dialogContext).pop(),
                  child: Text(context.l10n.commonCancel),
                ),
                shad.PrimaryButton(
                  onPressed: () => Navigator.of(dialogContext).pop(selected),
                  child: Text(context.l10n.timerSave),
                ),
              ],
              child: ColorPicker(
                pickerColor: selected,
                onColorChanged: (color) =>
                    setDialogState(() => selected = color),
                enableAlpha: false,
                portraitOnly: true,
                labelTypes: const [ColorLabelType.hex],
                pickerAreaHeightPercent: 0.72,
                displayThumbColor: true,
                hexInputBar: true,
              ),
            );
          },
        );
      },
    );

    if (result != null && mounted) {
      setState(() => _colorHex = colorToHexString(result));
    }
  }
}

class _ManageFinanceCardSkeleton extends StatelessWidget {
  const _ManageFinanceCardSkeleton();

  @override
  Widget build(BuildContext context) {
    return const FinancePanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              FinanceSkeletonBlock(width: 52, height: 52, radius: 18),
              shad.Gap(14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    FinanceSkeletonBlock(width: 140, height: 18),
                    shad.Gap(10),
                    FinanceSkeletonBlock(width: 112, height: 28, radius: 999),
                  ],
                ),
              ),
              FinanceSkeletonBlock(width: 88, height: 22),
            ],
          ),
        ],
      ),
    );
  }
}

class _CategoryCard extends StatelessWidget {
  const _CategoryCard({
    required this.category,
    required this.currencyCode,
    required this.showAmounts,
    required this.onEdit,
    required this.onDelete,
  });

  final TransactionCategory category;
  final String currencyCode;
  final bool showAmounts;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final isExpense = category.isExpense != false;
    final baseColor = isExpense
        ? theme.colorScheme.destructive
        : theme.colorScheme.primary;
    final color = parseHex(category.color) ?? baseColor;
    final icon = resolvePlatformIcon(
      category.icon,
      fallback: isExpense ? Icons.arrow_downward : Icons.arrow_upward,
    );

    return FinancePanel(
      radius: 22,
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.16),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(icon, size: 18, color: color),
          ),
          const shad.Gap(12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  category.name ?? '-',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.typography.large.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const shad.Gap(6),
                if (category.amount != null) ...[
                  Text(
                    maskFinanceValue(
                      formatCurrency(category.amount!, currencyCode),
                      showAmounts: showAmounts,
                    ),
                    style: theme.typography.textSmall.copyWith(
                      color: color,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const shad.Gap(6),
                ],
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 5,
                      ),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(999),
                        color: color.withValues(alpha: 0.12),
                      ),
                      child: Text(
                        isExpense
                            ? context.l10n.financeExpense
                            : context.l10n.financeIncome,
                        style: theme.typography.xSmall.copyWith(
                          color: color,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    if (category.transactionCount != null) ...[
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 5,
                        ),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(999),
                          color: theme.colorScheme.muted.withValues(
                            alpha: 0.24,
                          ),
                        ),
                        child: Text(
                          '${category.transactionCount} '
                          '${context.l10n.financeTransactionCountShort}',
                          style: theme.typography.xSmall.copyWith(
                            color: theme.colorScheme.mutedForeground,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
          shad.GhostButton(
            density: shad.ButtonDensity.icon,
            onPressed: onEdit,
            child: const Icon(Icons.edit_outlined, size: 16),
          ),
          shad.GhostButton(
            density: shad.ButtonDensity.icon,
            onPressed: onDelete,
            child: const Icon(Icons.delete_outline, size: 16),
          ),
        ],
      ),
    );
  }
}

class _TagCard extends StatelessWidget {
  const _TagCard({
    required this.tag,
    required this.currencyCode,
    required this.showAmounts,
    required this.onEdit,
    required this.onDelete,
  });

  final FinanceTag tag;
  final String currencyCode;
  final bool showAmounts;
  final VoidCallback onEdit;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final color = parseHex(tag.color) ?? theme.colorScheme.primary;

    return FinancePanel(
      radius: 22,
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(Icons.sell_outlined, color: color, size: 18),
          ),
          const shad.Gap(12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  tag.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.typography.large.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
                if (tag.description != null &&
                    tag.description!.trim().isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(
                      tag.description!,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.typography.textSmall.copyWith(
                        color: theme.colorScheme.mutedForeground,
                      ),
                    ),
                  ),
                if (tag.amount != null || tag.transactionCount != null) ...[
                  const shad.Gap(8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      if (tag.amount != null)
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 5,
                          ),
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(999),
                            color: color.withValues(alpha: 0.12),
                          ),
                          child: Text(
                            maskFinanceValue(
                              formatCurrency(tag.amount!, currencyCode),
                              showAmounts: showAmounts,
                            ),
                            style: theme.typography.xSmall.copyWith(
                              color: color,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      if (tag.transactionCount != null)
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 5,
                          ),
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(999),
                            color: theme.colorScheme.muted.withValues(
                              alpha: 0.24,
                            ),
                          ),
                          child: Text(
                            '${tag.transactionCount} '
                            '${context.l10n.financeTransactionCountShort}',
                            style: theme.typography.xSmall.copyWith(
                              color: theme.colorScheme.mutedForeground,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                    ],
                  ),
                ],
              ],
            ),
          ),
          shad.GhostButton(
            density: shad.ButtonDensity.icon,
            onPressed: onEdit,
            child: const Icon(Icons.edit_outlined, size: 16),
          ),
          shad.GhostButton(
            density: shad.ButtonDensity.icon,
            onPressed: onDelete,
            child: const Icon(Icons.delete_outline, size: 16),
          ),
        ],
      ),
    );
  }
}

class _TaxonomyPreviewCard extends StatelessWidget {
  const _TaxonomyPreviewCard({
    required this.name,
    required this.subtitle,
    required this.previewColor,
    required this.icon,
  });

  final String name;
  final String subtitle;
  final Color previewColor;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return FinancePanel(
      padding: const EdgeInsets.all(14),
      radius: 22,
      backgroundColor: FinancePalette.of(context).elevatedPanel,
      borderColor: previewColor.withValues(alpha: 0.18),
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: previewColor.withValues(alpha: 0.16),
            ),
            child: Icon(icon, size: 18, color: previewColor),
          ),
          const shad.Gap(12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.typography.small.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const shad.Gap(4),
                Text(
                  subtitle,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: theme.typography.xSmall.copyWith(
                    color: theme.colorScheme.mutedForeground,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _TaxonomySegmentedRow extends StatelessWidget {
  const _TaxonomySegmentedRow({
    required this.leftLabel,
    required this.rightLabel,
    required this.leftSelected,
    required this.onLeftPressed,
    required this.onRightPressed,
  });

  final String leftLabel;
  final String rightLabel;
  final bool leftSelected;
  final VoidCallback onLeftPressed;
  final VoidCallback onRightPressed;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final accent = FinancePalette.of(context).accent;

    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: theme.colorScheme.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: theme.colorScheme.border.withValues(alpha: 0.72),
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: _TaxonomySegmentButton(
              label: leftLabel,
              selected: leftSelected,
              accent: accent,
              onPressed: onLeftPressed,
            ),
          ),
          const shad.Gap(4),
          Expanded(
            child: _TaxonomySegmentButton(
              label: rightLabel,
              selected: !leftSelected,
              accent: accent,
              onPressed: onRightPressed,
            ),
          ),
        ],
      ),
    );
  }
}

class _TaxonomySegmentButton extends StatelessWidget {
  const _TaxonomySegmentButton({
    required this.label,
    required this.selected,
    required this.accent,
    required this.onPressed,
  });

  final String label;
  final bool selected;
  final Color accent;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onPressed,
        borderRadius: BorderRadius.circular(14),
        child: Ink(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
          decoration: BoxDecoration(
            color: selected
                ? accent.withValues(alpha: 0.14)
                : Colors.transparent,
            borderRadius: BorderRadius.circular(14),
          ),
          child: Center(
            child: Text(
              label,
              textAlign: TextAlign.center,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: theme.typography.small.copyWith(
                fontWeight: FontWeight.w700,
                color: selected ? accent : theme.colorScheme.mutedForeground,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _TaxonomyColorSection extends StatelessWidget {
  const _TaxonomyColorSection({
    required this.colorHex,
    required this.previewColor,
    required this.onPickColor,
    required this.onRandomize,
    this.onClear,
  });

  final String colorHex;
  final Color previewColor;
  final VoidCallback onPickColor;
  final VoidCallback onRandomize;
  final VoidCallback? onClear;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: theme.colorScheme.card,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
              color: theme.colorScheme.border.withValues(alpha: 0.72),
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 24,
                height: 24,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: previewColor,
                ),
              ),
              const shad.Gap(10),
              Expanded(
                child: Text(
                  colorHex,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.typography.small.copyWith(
                    color: theme.colorScheme.mutedForeground,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
        ),
        const shad.Gap(10),
        Row(
          children: [
            Expanded(
              child: shad.OutlineButton(
                onPressed: onPickColor,
                child: Center(
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text(context.l10n.financePickColor),
                  ),
                ),
              ),
            ),
            const shad.Gap(8),
            Expanded(
              child: shad.OutlineButton(
                onPressed: onRandomize,
                child: Center(
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text(context.l10n.financeRandomizeColor),
                  ),
                ),
              ),
            ),
            if (onClear != null) ...[
              const shad.Gap(8),
              shad.GhostButton(
                onPressed: onClear,
                child: const Icon(Icons.close_rounded, size: 18),
              ),
            ],
          ],
        ),
      ],
    );
  }
}

class _TaxonomyFieldLabel extends StatelessWidget {
  const _TaxonomyFieldLabel({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Text(
      label,
      style: theme.typography.xSmall.copyWith(
        color: theme.colorScheme.mutedForeground,
        fontWeight: FontWeight.w700,
        letterSpacing: 0.35,
      ),
    );
  }
}

class _TaxonomyTextField extends StatelessWidget {
  const _TaxonomyTextField({
    required this.controller,
    required this.placeholder,
    required this.onChanged,
    this.autofocus = false,
    this.errorText,
  });

  final TextEditingController controller;
  final String placeholder;
  final ValueChanged<String> onChanged;
  final bool autofocus;
  final String? errorText;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        shad.TextField(
          contextMenuBuilder: platformTextContextMenuBuilder(),
          controller: controller,
          placeholder: Text(placeholder),
          autofocus: autofocus,
          onChanged: onChanged,
        ),
        if (errorText != null) ...[
          const shad.Gap(4),
          _TaxonomyFieldErrorText(message: errorText!),
        ],
      ],
    );
  }
}

class _TaxonomyTextArea extends StatelessWidget {
  const _TaxonomyTextArea({
    required this.controller,
    required this.placeholder,
    required this.onChanged,
  });

  final TextEditingController controller;
  final String placeholder;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return shad.TextArea(
      contextMenuBuilder: platformTextContextMenuBuilder(),
      controller: controller,
      placeholder: Text(placeholder),
      initialHeight: 96,
      minHeight: 96,
      maxHeight: 156,
      onChanged: onChanged,
    );
  }
}

class _TaxonomyFieldErrorText extends StatelessWidget {
  const _TaxonomyFieldErrorText({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Text(
      message,
      style: shad.Theme.of(context).typography.xSmall.copyWith(
        color: shad.Theme.of(context).colorScheme.destructive,
        fontWeight: FontWeight.w600,
      ),
    );
  }
}
