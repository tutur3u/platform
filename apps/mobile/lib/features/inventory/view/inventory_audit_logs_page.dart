import 'dart:async';

import 'package:flutter/material.dart' hide Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_sync_refresh.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/inventory/widgets/inventory_read_warning.dart';
import 'package:mobile/features/inventory/widgets/inventory_search_chrome.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/app_dialog_scaffold.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

part 'inventory_audit_widgets.dart';

class InventoryAuditLogsPage extends StatefulWidget {
  const InventoryAuditLogsPage({super.key});

  @override
  State<InventoryAuditLogsPage> createState() => _InventoryAuditLogsPageState();
}

class _InventoryAuditLogsPageState extends State<InventoryAuditLogsPage>
    with OfflineSyncRefresh<InventoryAuditLogsPage> {
  @override
  Future<void> refreshAfterOfflineSync() => _loadInitial();
  static const int _pageSize = 24;

  late final InventoryRepository _repository;
  final TextEditingController _searchController = TextEditingController();
  String? _eventKind;
  (String?, String?)? _loadedScope;
  (String?, String?) get _scope =>
      (context.read<AuthCubit>().state.user?.id, _wsId);
  final ScrollController _scrollController = ScrollController();
  List<InventoryAuditLogEntry> _entries = const [];
  int _count = 0;
  bool _isLoadingInitial = false;
  bool _isLoadingMore = false;
  bool _hasMore = true;
  String? _error;
  int _requestToken = 0;

  String? get _wsId =>
      context.read<WorkspaceCubit>().state.currentWorkspace?.id;

  @override
  void initState() {
    super.initState();
    _repository = InventoryRepository();
    _scrollController.addListener(_onScroll);
    unawaited(Future<void>.delayed(Duration.zero, _loadInitial));
  }

  @override
  void dispose() {
    _searchController.dispose();
    _scrollController
      ..removeListener(_onScroll)
      ..dispose();
    super.dispose();
  }

  Future<void> _loadInitial({bool forceRefresh = false}) async {
    final wsId = _wsId;
    if (wsId == null) {
      return;
    }
    final requestToken = ++_requestToken;
    if (_loadedScope != _scope) {
      _entries = const [];
      _count = 0;
      _eventKind = null;
      _searchController.clear();
    }
    _loadedScope = _scope;

    setState(() {
      _isLoadingInitial = true;
      _isLoadingMore = false;
      _error = null;
    });

    try {
      final result = await CacheStore.readWithRevalidation(
        () => _repository.getAuditLogs(
          wsId,
          limit: _pageSize,
          forceRefresh: forceRefresh,
        ),
        onSnapshot: (result) {
          if (!mounted ||
              requestToken != _requestToken ||
              _loadedScope != _scope) {
            return;
          }
          setState(() {
            _entries = result.data;
            _count = result.count;
            _hasMore = _entries.length < _count;
          });
        },
      );

      if (!mounted || requestToken != _requestToken || _loadedScope != _scope) {
        return;
      }

      setState(() {
        _entries = result.data;
        _count = result.count;
        _hasMore = _entries.length < _count;
        _error = null;
      });
    } on ApiException catch (error) {
      if (!mounted || requestToken != _requestToken || _loadedScope != _scope) {
        return;
      }
      setState(() {
        if (error.statusCode == 401 ||
            (error.statusCode == 403 && !error.isVerificationRequired)) {
          _entries = const [];
          _count = 0;
          _hasMore = false;
        }
        _error = error.message.isNotEmpty
            ? error.message
            : context.l10n.commonSomethingWentWrong;
      });
    } on Exception {
      if (!mounted || requestToken != _requestToken || _loadedScope != _scope) {
        return;
      }
      setState(() {
        _error = context.l10n.commonSomethingWentWrong;
      });
    } finally {
      if (mounted && requestToken == _requestToken) {
        setState(() {
          _isLoadingInitial = false;
        });
      }
    }
  }

  Future<void> _loadMore() async {
    final wsId = _wsId;
    final requestToken = _requestToken;
    if (wsId == null || _isLoadingInitial || _isLoadingMore || !_hasMore) {
      return;
    }

    setState(() {
      _isLoadingMore = true;
    });

    try {
      final result = await _repository.getAuditLogs(
        wsId,
        limit: _pageSize,
        offset: _entries.length,
      );

      if (!mounted || requestToken != _requestToken || _loadedScope != _scope) {
        return;
      }

      setState(() {
        _entries = [..._entries, ...result.data];
        _count = result.count;
        _hasMore = _entries.length < _count;
      });
    } on Exception {
      if (!mounted || requestToken != _requestToken || _loadedScope != _scope) {
        return;
      }
      setState(() {
        _hasMore = _entries.length < _count;
      });
    } finally {
      if (mounted && requestToken == _requestToken) {
        setState(() {
          _isLoadingMore = false;
        });
      }
    }
  }

  void _onScroll() {
    if (!_scrollController.hasClients) {
      return;
    }
    final position = _scrollController.position;
    if (position.maxScrollExtent - position.pixels <= 200) {
      unawaited(_loadMore());
    }
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
      child: BlocListener<AuthCubit, AuthState>(
        listenWhen: (a, b) => a.user?.id != b.user?.id,
        listener: (_, _) => unawaited(_loadInitial()),
        child: BlocListener<WorkspaceCubit, WorkspaceState>(
          listenWhen: (previous, current) =>
              previous.currentWorkspace?.id != current.currentWorkspace?.id,
          listener: (context, state) => unawaited(_loadInitial()),
          child: Builder(
            builder: (context) {
              if (_isLoadingInitial && _entries.isEmpty) {
                return const Center(child: NovaLoadingIndicator());
              }

              if (_error != null && _entries.isEmpty) {
                return Padding(
                  padding: const EdgeInsets.all(16),
                  child: Center(
                    child: FinanceEmptyState(
                      icon: Icons.error_outline,
                      title: context.l10n.commonSomethingWentWrong,
                      body: _error ?? context.l10n.inventoryAuditLabel,
                      action: shad.SecondaryButton(
                        onPressed: () =>
                            unawaited(_loadInitial(forceRefresh: true)),
                        child: Text(context.l10n.commonRetry),
                      ),
                    ),
                  ),
                );
              }

              return ResponsiveWrapper(
                maxWidth: ResponsivePadding.maxContentWidth(
                  context.deviceClass,
                ),
                child: NovaRefreshIndicator(
                  onRefresh: () => _loadInitial(forceRefresh: true),
                  child: ListView(
                    controller: _scrollController,
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: EdgeInsets.fromLTRB(
                      16,
                      8,
                      16,
                      32 + MediaQuery.paddingOf(context).bottom,
                    ),
                    children: [
                      InventorySearchChrome(
                        location: Routes.inventoryAuditLogs,
                        controller: _searchController,
                        hint: context.l10n.inventoryRedesignLoadedSearch,
                        onChanged: (_) => setState(() {}),
                      ),
                      if (_error != null)
                        InventoryReadWarning(
                          onRetry: () =>
                              unawaited(_loadInitial(forceRefresh: true)),
                        ),
                      DropdownButtonFormField<String>(
                        isExpanded: true,
                        initialValue: _eventKind ?? '',
                        items: [
                          DropdownMenuItem(
                            value: '',
                            child: Text(
                              context.l10n.inventoryRedesignAllEvents,
                            ),
                          ),
                          for (final kind
                              in _entries.map((e) => e.eventKind).toSet())
                            DropdownMenuItem(
                              value: kind,
                              child: Text(_labelForEventKind(context, kind)),
                            ),
                        ],
                        onChanged: (value) => setState(
                          () => _eventKind = value?.isEmpty == true
                              ? null
                              : value,
                        ),
                      ),
                      const SizedBox(height: 12),
                      Text(
                        context.l10n.inventoryRedesignRecentSample(
                          _entries.length,
                        ),
                      ),
                      FinancePanel(
                        child: Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            FinanceStatChip(
                              label: context.l10n.inventoryAuditLabel,
                              value: '$_count',
                              icon: Icons.history_rounded,
                            ),
                          ],
                        ),
                      ),
                      const shad.Gap(18),
                      if (_entries.isEmpty)
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
                        ..._entries
                            .where(
                              (e) =>
                                  (_eventKind == null ||
                                      e.eventKind == _eventKind) &&
                                  [
                                        e.summary,
                                        e.entityLabel,
                                        e.actorDisplayName,
                                        ...e.changedFields,
                                      ]
                                      .whereType<String>()
                                      .join(' ')
                                      .toLowerCase()
                                      .contains(
                                        _searchController.text
                                            .trim()
                                            .toLowerCase(),
                                      ),
                            )
                            .map(
                              (entry) => Padding(
                                padding: const EdgeInsets.only(bottom: 12),
                                child: _AuditEntryCard(
                                  entry: entry,
                                  onTap: () => _openDetails(entry),
                                ),
                              ),
                            ),
                        if (_isLoadingMore)
                          const Padding(
                            padding: EdgeInsets.symmetric(vertical: 16),
                            child: Center(
                              child: NovaLoadingIndicator(size: 20),
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
      ),
    );
  }
}
