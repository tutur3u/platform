part of 'crm_page.dart';

extension _CrmPageData on _CrmPageState {
  CrmUserPermissions _effectivePermissions(CrmUserPermissions? server) =>
      CrmUserPermissions(
        hasPrivateInfo:
            (server?.hasPrivateInfo ?? false) &&
            _workspacePermissions.containsPermission('view_users_private_info'),
        hasPublicInfo:
            (server?.hasPublicInfo ?? false) &&
            _workspacePermissions.containsPermission('view_users_public_info'),
        canCheckUserAttendance:
            (server?.canCheckUserAttendance ?? false) &&
            _workspacePermissions.containsPermission('check_user_attendance'),
      );

  Future<void> _loadInitial({bool force = false}) async {
    final wsId = _wsId;
    if (wsId == null || wsId.isEmpty) return;

    final requestToken = ++_requestToken;

    _updateState(() {
      _isLoading = true;
      _isLoadingMore = false;
      _error = null;
      _page = 1;
      _auditOffset = 0;
    });

    final tab = _tab;
    final query = _searchController.text;
    final status = _status;
    final link = _linkStatus;
    final attention = _requireAttention;
    final membership = _groupMembership;
    final included = List<String>.of(_includedGroups);
    final excluded = List<String>.of(_excludedGroups);
    final range = _auditRange;
    final kind = _auditEventKind;
    final source = _auditSource;
    final affected = _affectedUserQuery;
    final actor = _actorQuery;
    _pagingFailed = false;

    Future<void> read() async {
      final permissions = await _permissionsRepository.getPermissions(
        wsId: wsId,
      );
      if (!mounted || requestToken != _requestToken) return;
      _updateState(() {
        _workspacePermissions = permissions;
        if (!_canViewFeedbacks) _groups = const [];
        final previous = _userPermissions;
        if (previous != null && _effectivePermissions(previous) != previous) {
          _users = const [];
          _selectedUser = null;
          _userPermissions = null;
        }
        if (!_canViewUsers) {
          _users = const [];
          _selectedUser = null;
        }
        if (!_canViewAuditLog) _auditEvents = const [];
      });
      final users = tab == _CrmTab.users && _canViewUsers
          ? await _repository.getUsers(
              wsId,
              query: query,
              status: status,
              linkStatus: link,
              requireAttention: attention,
              groupMembership: membership,
              includedGroups: included,
              excludedGroups: excluded,
            )
          : null;
      final audit = tab == _CrmTab.audit && _canViewAuditLog
          ? await _repository.getAuditLogs(
              wsId,
              start: range.start.toIso8601String(),
              end: range.end.toIso8601String(),
              eventKind: kind == 'all' ? null : kind,
              source: source == 'all' ? null : source,
              affectedUserQuery: affected,
              actorQuery: actor,
              limit: 50,
            )
          : null;
      if (!mounted || requestToken != _requestToken) return;
      _updateState(() {
        if (tab == _CrmTab.users) {
          final effective = _effectivePermissions(users?.permissions);
          _users =
              users?.users
                  .map((row) => crmVisibleUser(row, effective))
                  .toList() ??
              const [];
          _total = users?.count ?? 0;
          _userPermissions = effective;
          final selected = _selectedUser;
          if (selected != null) {
            _selectedUser = _users
                .where((row) => row.id == selected.id)
                .firstOrNull;
          }
        } else {
          _auditEvents = audit?.items ?? const [];
          _auditTotal = audit?.count ?? 0;
        }
      });
      var groups = const <CrmGroup>[];
      if (_canViewFeedbacks) {
        try {
          groups = await _repository.getGroups(wsId);
        } on ApiException catch (error) {
          if (crmAccessDenied(error) && error.statusCode == 403) {
            groups = const [];
          } else if (crmTemporaryFailure(error)) {
            groups = _groups;
            if (mounted && requestToken == _requestToken) {
              _toast(error.message, destructive: true);
            }
          } else {
            rethrow;
          }
        }
      }
      if (mounted && requestToken == _requestToken) {
        _updateState(() => _groups = groups);
      }
    }

    try {
      if (force) {
        await CacheStore.awaitRevalidation(read);
      } else {
        await CacheStore.readWithRevalidation(read, onSnapshot: (_) {});
      }
    } on ApiException catch (error) {
      if (!mounted || requestToken != _requestToken) return;
      _updateState(() {
        _error = error.message;
        if (crmAccessDenied(error)) {
          _users = const [];
          _auditEvents = const [];
          _selectedUser = null;
          _total = 0;
          _auditTotal = 0;
          _pagingFailed = true;
        }
      });
    } on Object catch (_) {
      if (!mounted || requestToken != _requestToken) return;
      _updateState(() => _error = context.l10n.commonSomethingWentWrong);
    } finally {
      if (mounted && requestToken == _requestToken) {
        _updateState(() => _isLoading = false);
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) _maybeLoadMore();
        });
      }
    }
  }

  Future<void> _loadMore() async {
    final wsId = _wsId;
    if (wsId == null || _isLoading || _isLoadingMore) return;

    if (_tab == _CrmTab.users && _users.length >= _total) return;
    if (_tab == _CrmTab.audit && _auditEvents.length >= _auditTotal) return;

    final requestToken = _requestToken;

    _updateState(() => _isLoadingMore = true);

    try {
      if (_tab == _CrmTab.users) {
        final nextPage = _page + 1;
        final result = await CacheStore.awaitRevalidation(
          () => _repository.getUsers(
            wsId,
            query: _searchController.text,
            page: nextPage,
            status: _status,
            linkStatus: _linkStatus,
            requireAttention: _requireAttention,
            groupMembership: _groupMembership,
            includedGroups: _includedGroups,
            excludedGroups: _excludedGroups,
          ),
        );
        if (!mounted || requestToken != _requestToken) return;
        _updateState(() {
          final effective = _effectivePermissions(result.permissions);
          _userPermissions = effective;
          _users = {
            for (final row in [..._users, ...result.users])
              row.id: crmVisibleUser(row, effective),
          }.values.toList();
          final selected = _selectedUser;
          if (selected != null) {
            _selectedUser = _users
                .where((row) => row.id == selected.id)
                .firstOrNull;
          }
          _page = nextPage;
          _total = result.users.isEmpty ? _users.length : result.count;
        });
      } else {
        final nextOffset = _auditOffset + 50;
        final result = await CacheStore.awaitRevalidation(
          () => _repository.getAuditLogs(
            wsId,
            start: _auditRange.start.toIso8601String(),
            end: _auditRange.end.toIso8601String(),
            eventKind: _auditEventKind == 'all' ? null : _auditEventKind,
            source: _auditSource == 'all' ? null : _auditSource,
            affectedUserQuery: _affectedUserQuery,
            actorQuery: _actorQuery,
            offset: nextOffset,
            limit: 50,
          ),
        );
        if (!mounted || requestToken != _requestToken) return;
        _updateState(() {
          _auditEvents = {
            for (final row in [..._auditEvents, ...result.items])
              (row.auditRecordId, row.source): row,
          }.values.toList();
          _auditOffset = nextOffset;
          _auditTotal = result.items.isEmpty
              ? _auditEvents.length
              : result.count;
        });
      }
    } on ApiException catch (error) {
      if (!mounted || requestToken != _requestToken) return;
      if (crmAccessDenied(error)) {
        _updateState(() {
          _users = const [];
          _auditEvents = const [];
          _selectedUser = null;
          _total = 0;
          _auditTotal = 0;
        });
      }
      _pagingFailed = true;
      _toast(error.message, destructive: true);
    } on Object catch (_) {
      if (!mounted || requestToken != _requestToken) return;
      _pagingFailed = true;
      _toast(context.l10n.commonSomethingWentWrong, destructive: true);
    } finally {
      if (mounted && requestToken == _requestToken) {
        _updateState(() => _isLoadingMore = false);
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) _maybeLoadMore();
        });
      }
    }
  }

  void _onSearchChanged(String value) {
    ++_requestToken;
    _updateState(() {
      _isLoading = true;
      _isLoadingMore = false;
    });
    _searchDebounce?.cancel();
    _searchDebounce = Timer(const Duration(milliseconds: 300), () {
      if (!mounted) return;
      if (_tab == _CrmTab.audit) {
        _updateState(() {
          _affectedUserQuery = value;
          _actorQuery = value;
        });
      }
      unawaited(_loadInitial());
    });
  }

  void _selectTab(_CrmTab tab) {
    if (_tab == tab) {
      if (_selectedUser != null) _updateState(() => _selectedUser = null);
      return;
    }
    _updateState(() {
      _tab = tab;
      _selectedUser = null;
      if (tab == _CrmTab.audit) {
        _affectedUserQuery = _searchController.text;
        _actorQuery = _searchController.text;
      }
    });
    unawaited(_loadInitial());
  }

  int _activeUserFilterCount() {
    var count = 0;
    if (_status != 'active') count += 1;
    if (_linkStatus != 'all') count += 1;
    if (_requireAttention != 'all') count += 1;
    if (_groupMembership != 'all') count += 1;
    if (_includedGroups.isNotEmpty) count += 1;
    if (_excludedGroups.isNotEmpty) count += 1;
    return count;
  }

  int _activeAuditFilterCount() {
    var count = 0;
    final defaultStart = DateTime.now().subtract(const Duration(days: 30));
    final defaultEnd = DateTime.now();
    if (_auditRange.start.difference(defaultStart).inDays.abs() > 1 ||
        _auditRange.end.difference(defaultEnd).inDays.abs() > 1) {
      count += 1;
    }
    if (_auditEventKind != 'all') count += 1;
    if (_auditSource != 'all') count += 1;
    if (_affectedUserQuery.trim().isNotEmpty) count += 1;
    if (_actorQuery.trim().isNotEmpty) count += 1;
    return count;
  }
}
