import 'dart:async';

import 'package:flutter/material.dart' hide AppBar, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_colorpicker/flutter_colorpicker.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/icons/platform_icon.dart';
import 'package:mobile/core/input/platform_text_context_menu.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/kit/app_segmented_control.dart';
import 'package:mobile/core/utils/color_hex.dart';
import 'package:mobile/core/utils/currency_formatter.dart';
import 'package:mobile/core/widgets/shadcn_flutter_compat.dart' as shad;
import 'package:mobile/data/models/finance/category.dart';
import 'package:mobile/data/models/finance/tag.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/finance/finance_permissions.dart';
import 'package:mobile/features/finance/widgets/finance_modal_scaffold.dart';
import 'package:mobile/features/finance/widgets/finance_shell_actions.dart';
import 'package:mobile/features/finance/widgets/finance_states.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/settings/cubit/finance_preferences_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/async_delete_confirmation_dialog.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:mobile/widgets/pending_sync_frame.dart';
import 'package:mobile/widgets/platform_icon_picker.dart';

part 'transaction_categories_cards.dart';
part 'transaction_categories_fields.dart';
part 'transaction_categories_forms.dart';
part 'transaction_categories_preview.dart';

class TransactionCategoriesPage extends StatelessWidget {
  const TransactionCategoriesPage({this.repository, super.key});

  final FinanceRepository? repository;

  static void clearCaches() {
    _TransactionCategoriesViewState.clearMemoryCaches();
  }

  @override
  Widget build(BuildContext context) {
    return RepositoryProvider(
      create: (_) => repository ?? FinanceRepository(),
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

    return shad.Scaffold(
      child: BlocListener<WorkspaceCubit, WorkspaceState>(
        listenWhen: (prev, curr) =>
            prev.currentWorkspace?.id != curr.currentWorkspace?.id,
        listener: (context, state) =>
            unawaited(_handleWorkspaceChanged(state.currentWorkspace?.id)),
        child: Stack(
          children: [
            ShellTitleOverride(
              ownerId: 'finance-categories',
              locations: const {Routes.categories},
              title: l10n.financeCategories,
              showLeadingBrand: false,
              showAvatar: false,
            ),
            Column(
              children: [
                AppPageBody(
                  consumeBottomClearance: false,
                  child: AppSegmentedControl<int>(
                    selected: _activeTab,
                    onChanged: _switchTab,
                    segments: [
                      AppSegment(
                        value: _tabCategories,
                        label: l10n.financeCategories,
                      ),
                      AppSegment(value: _tabTags, label: l10n.financeTags),
                    ],
                  ),
                ),
                Expanded(
                  child: NovaRefreshIndicator(
                    onRefresh: () => _loadCurrentTab(forceRefresh: true),
                    child: LayoutBuilder(
                      builder: (context, constraints) {
                        final insets = AppPageInsets.of(
                          context,
                          width: constraints.maxWidth,
                        );
                        return _activeTab == _tabCategories
                            ? _buildCategoriesContent(l10n, insets, showAmounts)
                            : _buildTagsContent(l10n, insets, showAmounts);
                      },
                    ),
                  ),
                ),
              ],
            ),
            ShellChromeActions(
              ownerId: 'finance-manage-create',
              locations: const {Routes.categories},
              onResetSection: () {
                if (_activeTab != _tabCategories) _switchTab(_tabCategories);
              },
              actions: [
                financeAmountVisibilityAction(
                  context,
                  showAmounts: showAmounts,
                ),
                if (canManageFinance(
                  context,
                  _activeTab == _tabCategories
                      ? 'create_transactions'
                      : 'manage_finance',
                ))
                  ShellActionSpec(
                    id: 'finance-manage-create',
                    icon: Icons.add,
                    filled: true,
                    tooltip: _activeTab == _tabCategories
                        ? l10n.financeCreateCategory
                        : l10n.financeCreateTag,
                    callbackToken: _activeTab,
                    onPressed: _activeTab == _tabCategories
                        ? _onCreateCategory
                        : _onCreateTag,
                  ),
              ],
            ),
          ],
        ),
      ),
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

    setState(() => _workspaceCurrency = null);
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
      final currency = await repository
          .readWorkspaceDefaultCurrencyFromCache(wsId)
          .catchError((_) => null);
      if (!mounted || requestId != _categoriesRequestId) return;
      setState(() {
        _categories = resolvedCategories;
        _categoriesWorkspaceId = wsId;
        _workspaceCurrency = currency;
        _categoriesLoading = false;
        _categoriesError = null;
      });
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
      final currency = await CacheStore.awaitRevalidation(
        () => repository.getWorkspaceDefaultCurrency(wsId),
      );
      final categories = await CacheStore.awaitRevalidation(
        () => repository.getCategories(wsId),
      );
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
    final cached = _tagsCache[_memoryCacheKey(wsId)];
    final diskCached = await CacheStore.instance.read<List<FinanceTag>>(
      key: _tagsStoreKey(wsId),
      decode: _decodeTags,
    );
    final resolvedTags = cached?.tags ?? diskCached.data;
    final hasVisibleData = _tagsWorkspaceId == wsId;

    if (!mounted || requestId != _tagsRequestId) return;

    if (!forceRefresh && resolvedTags != null) {
      final currency = await repository
          .readWorkspaceDefaultCurrencyFromCache(wsId)
          .catchError((_) => null);
      if (!mounted || requestId != _tagsRequestId) return;
      setState(() {
        _tags = resolvedTags;
        _tagsWorkspaceId = wsId;
        _workspaceCurrency = currency;
        _tagsLoading = false;
        _tagsError = null;
      });
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
      final currency = await CacheStore.awaitRevalidation(
        () => repository.getWorkspaceDefaultCurrency(wsId),
      );
      final tags = await CacheStore.awaitRevalidation(
        () => repository.getTags(wsId),
      );
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
  const _TagCacheEntry({required this.tags, required this.fetchedAt});

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
