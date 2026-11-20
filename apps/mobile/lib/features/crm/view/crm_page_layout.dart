part of 'crm_page.dart';

extension _CrmPageLayout on _CrmPageState {
  Widget _buildWorkspace(BuildContext context) {
    final l10n = context.l10n;
    final usersTab = _tab == _CrmTab.users;
    final allowed = usersTab ? _canViewUsers : _canViewAuditLog;
    final filterCount = usersTab
        ? _activeUserFilterCount()
        : _activeAuditFilterCount();
    final selected = _selectedUser;
    return AppScaffold(
      child: Stack(
        children: [
          ShellTitleOverride(
            ownerId: 'contacts-title',
            locations: Routes.contactLocations,
            title: _section != null
                ? _sectionTitle(l10n)
                : selected == null
                ? l10n.contactsTitle
                : (contactNamedTitle(
                        displayName: selected.displayName,
                        fullName: selected.fullName,
                      ) ??
                      l10n.contactsTitle),
          ),
          ShellMiniNav(
            ownerId: 'crm-root-nav',
            locations: Routes.contactLocations,
            deepLinkBackRoute: Routes.apps,
            items: [
              ShellMiniNavItemSpec(
                id: 'crm-users',
                icon: LucideIcons.contact,
                label: l10n.contactsTitle,
                callbackToken: _tab,
                selected: usersTab,
                enabled: _canViewUsers,
                onPressed: () => _selectTab(_CrmTab.users),
              ),
              ShellMiniNavItemSpec(
                id: 'crm-audit',
                icon: LucideIcons.history,
                label: l10n.crmAuditTab,
                callbackToken: _tab,
                selected: !usersTab,
                enabled: _canViewAuditLog,
                onPressed: () => _selectTab(_CrmTab.audit),
              ),
            ],
          ),
          ShellChromeActions(
            ownerId: 'crm-root-actions',
            locations: Routes.contactLocations,
            onBack: _back,
            onResetSection: _resetSearch,
            actions: [
              if (selected == null && allowed)
                ShellActionSpec.search(
                  id: 'crm-search',
                  active: _searching,
                  tooltip: usersTab
                      ? l10n.contactsSearchHint
                      : l10n.crmSearchAuditHint,
                  callbackToken: (_tab, _directory),
                  controller: _searchController,
                  searchHint: usersTab
                      ? l10n.contactsSearchHint
                      : l10n.crmSearchAuditHint,
                  onSearchChanged: _onSearchChanged,
                  onCloseSearch: _resetSearch,
                  onPressed: () => _updateState(() => _searching = true),
                ),
              if (selected == null && allowed)
                ShellActionSpec(
                  id: 'crm-filters',
                  icon: LucideIcons.listFilter,
                  tooltip: l10n.commonFilters,
                  callbackToken: (_tab, filterCount),
                  highlighted: filterCount > 0,
                  onPressed: usersTab
                      ? _showUsersFilterSheet
                      : _showAuditFilterSheet,
                ),
              if (selected == null &&
                  usersTab &&
                  _directory == _ContactDirectory.people &&
                  _canCreateUsers)
                ShellActionSpec(
                  id: 'crm-create',
                  icon: LucideIcons.userPlus,
                  tooltip: l10n.crmCreateUser,
                  callbackToken: widget.workspaceId,
                  onPressed: _showUserSheet,
                ),
              if (selected == null &&
                  usersTab &&
                  _directory == _ContactDirectory.groups &&
                  _canCreateGroups)
                ShellActionSpec(
                  id: 'crm-create-group',
                  icon: LucideIcons.plus,
                  tooltip: l10n.contactsCreateGroup,
                  callbackToken: widget.workspaceId,
                  onPressed: _showGroupEditor,
                ),
              if (selected == null &&
                  usersTab &&
                  _directory == _ContactDirectory.tags &&
                  _canCreateGroups)
                ShellActionSpec(
                  id: 'crm-create-tag',
                  icon: LucideIcons.plus,
                  tooltip: l10n.contactsCreateTag,
                  callbackToken: widget.workspaceId,
                  onPressed: _showTagEditor,
                ),
              if (selected == null &&
                  usersTab &&
                  (_canViewUsers || _canCreateUsers))
                ShellActionSpec(
                  id: 'crm-tools',
                  icon: LucideIcons.ellipsis,
                  tooltip: l10n.appsHubMoreTools,
                  callbackToken: _workspacePermissions,
                  onPressed: _showCrmToolsSheet,
                ),
              if (selected != null && _canUpdateUsers)
                ShellActionSpec(
                  id: 'crm-edit',
                  icon: LucideIcons.pencil,
                  tooltip: l10n.commonEdit,
                  callbackToken: selected,
                  inDock: true,
                  onPressed: () => _showUserSheet(user: selected),
                ),
              if (selected != null &&
                  selected.linkedUsers.isEmpty &&
                  _canUpdateUsers &&
                  (_userPermissions?.hasPrivateInfo ?? false) &&
                  (_userPermissions?.hasPublicInfo ?? false))
                ShellActionSpec(
                  id: 'crm-account-invitation',
                  icon: LucideIcons.link,
                  tooltip: l10n.crmContactAccountInvitation,
                  callbackToken: selected,
                  onPressed: () => _showContactAccountInvitation(selected),
                ),
              if (selected != null && _canViewFeedbacks)
                ShellActionSpec(
                  id: 'crm-feedback',
                  icon: LucideIcons.messageCircle,
                  tooltip: l10n.crmFeedbackAction,
                  callbackToken: selected,
                  onPressed: () => _showFeedbackSheet(selected),
                ),
              if (selected != null && _canDeleteUsers)
                ShellActionSpec(
                  id: 'crm-delete',
                  icon: LucideIcons.trash2,
                  tooltip: l10n.commonDelete,
                  callbackToken: selected,
                  onPressed: () => _deleteUser(selected),
                ),
            ],
          ),
          if (_section != null)
            ContactSectionList(
              records: _sectionRecords,
              loading: _sectionLoading,
              error: _sectionError,
              onRefresh: _reloadSection,
              onOpen: _openSectionRecord,
            )
          else if (selected != null)
            _CrmUserDetail(
              user: selected,
              billing: _workspacePermissions.containsPermission('view_invoices')
                  ? ContactBilling(
                      key: ValueKey((widget.workspaceId, selected.id)),
                      workspaceId: widget.workspaceId,
                      contactId: selected.id,
                      repository: _repository,
                    )
                  : null,
              privateInfo: _userPermissions?.hasPrivateInfo ?? false,
              publicInfo: _userPermissions?.hasPublicInfo ?? false,
            )
          else
            NovaRefreshIndicator(
              onRefresh: () => _directory == _ContactDirectory.schedule
                  ? _loadSessions()
                  : _loadInitial(force: true),
              child: _directoryList(
                context,
                allowed: allowed,
                usersTab: usersTab,
              ),
            ),
        ],
      ),
    );
  }

  Widget _directoryList(
    BuildContext context, {
    required bool allowed,
    required bool usersTab,
  }) {
    final l10n = context.l10n;
    final scheduleCold =
        _directory == _ContactDirectory.schedule &&
        _sessionsLoading &&
        _sessions.isEmpty;
    if (scheduleCold || (_isLoading && _directoryCount == 0 && !scheduleCold)) {
      return AppPageListView(
        controller: _scrollController,
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          Semantics(
            label: l10n.commonLoading,
            liveRegion: true,
            child: const AppSkeletonRows(count: 3),
          ),
        ],
      );
    }
    final slots = _listSlots(l10n, allowed: allowed, usersTab: usersTab);
    return AppPageListView.builder(
      controller: _scrollController,
      physics: const AlwaysScrollableScrollPhysics(),
      itemCount: slots.length,
      itemBuilder: (context, index) => slots[index],
    );
  }

  int get _directoryCount {
    if (_tab == _CrmTab.audit) return _auditEvents.length;
    return switch (_directory) {
      _ContactDirectory.people => _users.length,
      _ContactDirectory.groups => _visibleGroups.length,
      _ContactDirectory.tags => _visibleTags.length,
      _ContactDirectory.schedule => _sessions.length,
    };
  }

  List<CrmGroup> get _visibleGroups {
    final query = _searchController.text.trim().toLowerCase();
    if (query.isEmpty) return _groups;
    return _groups
        .where((group) => group.name.toLowerCase().contains(query))
        .toList(growable: false);
  }

  List<CrmGroupTag> get _visibleTags {
    final query = _searchController.text.trim().toLowerCase();
    if (query.isEmpty) return _tags;
    return _tags
        .where((tag) => tag.name.toLowerCase().contains(query))
        .toList(growable: false);
  }

  List<Widget> _listSlots(
    AppLocalizations l10n, {
    required bool allowed,
    required bool usersTab,
  }) {
    final slots = <Widget>[];
    if (usersTab &&
        allowed &&
        _users.isNotEmpty &&
        _directory == _ContactDirectory.people) {
      final attention = _users.where((user) => user.requireAttention).length;
      slots.add(
        Padding(
          padding: const EdgeInsets.only(bottom: AppLayout.sectionGap),
          child: AppAdaptiveGrid(
            equalHeight: true,
            children: [
              AppStatTile(
                label: l10n.contactsPeople,
                value: '$_total',
                icon: LucideIcons.contact,
                tone: AppTone.info,
              ),
              AppStatTile(
                label: l10n.contactsGroups,
                value: '$_groupTotal',
                icon: LucideIcons.users,
                tone: AppTone.info,
                onTap: _canViewFeedbacks
                    ? () => _updateState(
                        () => _directory = _ContactDirectory.groups,
                      )
                    : null,
              ),
              AppStatTile(
                label: l10n.contactsTags,
                value: '$_tagTotal',
                icon: LucideIcons.tags,
                tone: AppTone.info,
                onTap: _canViewFeedbacks
                    ? () => _updateState(
                        () => _directory = _ContactDirectory.tags,
                      )
                    : null,
              ),
              AppStatTile(
                label: l10n.crmRequireAttention,
                value: '$attention',
                caption: l10n.contactsAttentionCaption,
                icon: LucideIcons.triangleAlert,
                tone: attention == 0 ? AppTone.neutral : AppTone.warning,
              ),
            ],
          ),
        ),
      );
    }
    if (usersTab && allowed && _canViewFeedbacks) {
      slots.add(
        Padding(
          padding: const EdgeInsets.only(bottom: AppSpacing.lg),
          child: AppSegmentedControl<_ContactDirectory>(
            selected: _directory,
            onChanged: (value) {
              _updateState(() => _directory = value);
              if (value == _ContactDirectory.schedule) {
                unawaited(_loadSessions());
              }
            },
            segments: [
              AppSegment(
                value: _ContactDirectory.people,
                label: l10n.contactsPeople,
                icon: LucideIcons.contact,
              ),
              AppSegment(
                value: _ContactDirectory.groups,
                label: l10n.contactsGroups,
                icon: LucideIcons.users,
              ),
              AppSegment(
                value: _ContactDirectory.tags,
                label: l10n.contactsTags,
                icon: LucideIcons.tags,
              ),
              AppSegment(
                value: _ContactDirectory.schedule,
                label: l10n.contactsSchedule,
                icon: LucideIcons.calendar,
              ),
            ],
          ),
        ),
      );
    }
    if (!allowed && !_isLoading) {
      slots.add(
        AppStateMessage(
          icon: LucideIcons.lock,
          title: l10n.contactsTitle,
          message: l10n.contactsPermissionDenied,
        ),
      );
      return slots;
    }
    if (_error != null && _directoryCount == 0 && !_isLoading) {
      slots.add(
        AppStateMessage(
          icon: LucideIcons.circleAlert,
          tone: AppTone.destructive,
          title: l10n.commonSomethingWentWrong,
          message: _error,
          actionLabel: l10n.commonRetry,
          onAction: () => _loadInitial(force: true),
        ),
      );
      return slots;
    }
    if (_directory == _ContactDirectory.schedule &&
        _sessionsError != null &&
        _sessions.isEmpty &&
        !_sessionsLoading) {
      slots.add(
        AppStateMessage(
          icon: LucideIcons.circleAlert,
          tone: AppTone.destructive,
          title: l10n.commonSomethingWentWrong,
          message: _sessionsError,
          actionLabel: l10n.commonRetry,
          onAction: _loadSessions,
        ),
      );
      return slots;
    }
    if (_directoryCount == 0 && !_isLoading && !_sessionsLoading) {
      final searching = _searchController.text.trim().isNotEmpty;
      final createLabel = _emptyCreateLabel(l10n, usersTab);
      slots.add(
        AppStateMessage(
          icon: usersTab ? LucideIcons.contact : LucideIcons.history,
          title: _emptyTitle(l10n, usersTab),
          message: searching && usersTab
              ? l10n.contactsEmptySearch
              : _emptyMessage(l10n, usersTab),
          actionLabel: searching ? null : createLabel,
          onAction: searching ? null : _emptyCreateAction(usersTab),
          illustration: searching
              ? const AppIllustration(
                  AppIllustrationKind.searchNoResults,
                  tone: AppTone.info,
                  cycles: 0,
                )
              : null,
        ),
      );
      return slots;
    }
    if (_error != null && _directoryCount > 0) {
      slots.add(
        Padding(
          padding: const EdgeInsets.only(bottom: AppSpacing.md),
          child: AppStateMessage.inline(
            icon: LucideIcons.circleAlert,
            tone: AppTone.destructive,
            title: l10n.commonSomethingWentWrong,
            message: _error,
          ),
        ),
      );
    }
    if (usersTab && _directory == _ContactDirectory.people) {
      final groups = contactListGroups(_users);
      for (final group in groups) {
        slots.add(AppSectionHeader(title: group.label));
        for (var index = 0; index < group.users.length; index++) {
          final user = group.users[index];
          slots.add(
            PendingSyncFrame(
              workspaceId: widget.workspaceId,
              entityId: user.id,
              feature: 'crm',
              child: AppGroupedSlice(
                position: AppSlicePosition.of(index, group.users.length),
                child: ContactListRow(
                  user: user,
                  selected: _selectedUser?.id == user.id,
                  onTap: () {
                    _searching = false;
                    _updateState(() => _selectedUser = user);
                  },
                  onLongPress: () => _showContactActions(user),
                ),
              ),
            ),
          );
        }
      }
    } else if (usersTab && _directory == _ContactDirectory.groups) {
      slots.addAll(
        _namedSlices(_visibleGroups.length, (index) {
          final group = _visibleGroups[index];
          return AppRichRow(
            title: group.name,
            subtitle: group.notes,
            leading: const AppIconTile(
              icon: LucideIcons.users,
              tone: AppTone.info,
            ),
            onTap: () => _filterByGroups([group.id]),
            onLongPress: _canUpdateGroups || _canDeleteGroups
                ? () => _showGroupActions(group)
                : null,
          );
        }),
      );
    } else if (usersTab && _directory == _ContactDirectory.tags) {
      slots.addAll(
        _namedSlices(_visibleTags.length, (index) {
          final tag = _visibleTags[index];
          return AppRichRow(
            title: tag.name,
            leading: const AppIconTile(
              icon: LucideIcons.tags,
              tone: AppTone.info,
            ),
            trailing: Text('${tag.groupIds.length}'),
            onTap: tag.groupIds.isEmpty
                ? null
                : () => _filterByGroups(tag.groupIds),
            onLongPress: _canUpdateGroups || _canDeleteGroups
                ? () => _showTagActions(tag)
                : null,
          );
        }),
      );
    } else if (usersTab && _directory == _ContactDirectory.schedule) {
      final days = contactScheduleDays(_sessions);
      final localizations = MaterialLocalizations.of(context);
      for (final day in days) {
        slots
          ..add(
            AppSectionHeader(title: localizations.formatMediumDate(day.day)),
          )
          ..addAll(
            _namedSlices(day.sessions.length, (index) {
              final session = day.sessions[index];
              final start = DateTime.tryParse(session.startsAt)?.toLocal();
              final end = DateTime.tryParse(session.endsAt)?.toLocal();
              final when = start == null
                  ? session.startsAt
                  : localizations.formatTimeOfDay(
                      TimeOfDay.fromDateTime(start),
                    );
              final until = end == null
                  ? ''
                  : localizations.formatTimeOfDay(TimeOfDay.fromDateTime(end));
              return AppRichRow(
                title: session.label,
                subtitle: session.groupName,
                trailingCaption: until.isEmpty ? when : '$when–$until',
                leading: const AppIconTile(
                  icon: LucideIcons.calendar,
                  tone: AppTone.info,
                ),
                onTap: () => _showAttendance(session),
              );
            }),
          );
      }
    } else {
      slots.addAll(
        _namedSlices(_auditEvents.length, (index) {
          return _CrmAuditCard(event: _auditEvents[index]);
        }),
      );
    }
    if (_isLoadingMore || (_isLoading && _directoryCount > 0)) {
      slots.add(const AppSkeletonRows(count: 1));
    } else if (_pagingFailed) {
      slots.add(
        AppStateMessage.inline(
          icon: LucideIcons.circleAlert,
          tone: AppTone.destructive,
          title: l10n.commonSomethingWentWrong,
          actionLabel: l10n.commonRetry,
          onAction: () {
            _pagingFailed = false;
            return _loadMore();
          },
        ),
      );
    }
    return slots;
  }

  List<Widget> _namedSlices(int count, Widget Function(int index) row) {
    return [
      for (var index = 0; index < count; index++)
        AppGroupedSlice(
          position: AppSlicePosition.of(index, count),
          child: row(index),
        ),
    ];
  }

  String _emptyTitle(AppLocalizations l10n, bool usersTab) {
    if (!usersTab) return l10n.crmAuditTab;
    return switch (_directory) {
      _ContactDirectory.people => l10n.contactsTitle,
      _ContactDirectory.groups => l10n.contactsGroups,
      _ContactDirectory.tags => l10n.contactsTags,
      _ContactDirectory.schedule => l10n.contactsSchedule,
    };
  }

  String _emptyMessage(AppLocalizations l10n, bool usersTab) {
    if (!usersTab) return l10n.crmEmptyAudit;
    return switch (_directory) {
      _ContactDirectory.people => l10n.contactsEmpty,
      _ContactDirectory.groups => l10n.contactsEmptyGroups,
      _ContactDirectory.tags => l10n.contactsEmptyTags,
      _ContactDirectory.schedule => l10n.contactsEmptySchedule,
    };
  }

  String? _emptyCreateLabel(AppLocalizations l10n, bool usersTab) {
    if (!usersTab || !_canCreateGroups) return null;
    return switch (_directory) {
      _ContactDirectory.groups => l10n.contactsCreateGroup,
      _ContactDirectory.tags => l10n.contactsCreateTag,
      _ContactDirectory.people || _ContactDirectory.schedule => null,
    };
  }

  Future<void> Function()? _emptyCreateAction(bool usersTab) {
    if (!usersTab || !_canCreateGroups) return null;
    return switch (_directory) {
      _ContactDirectory.groups => _showGroupEditor,
      _ContactDirectory.tags => _showTagEditor,
      _ContactDirectory.people || _ContactDirectory.schedule => null,
    };
  }

  void _filterByGroups(List<String> groupIds) {
    _updateState(() {
      _directory = _ContactDirectory.people;
      _includedGroups = groupIds;
      _page = 1;
    });
    unawaited(_loadInitial());
  }
}
