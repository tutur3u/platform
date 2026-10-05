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
    final count = usersTab ? _users.length : _auditEvents.length;
    final total = usersTab ? _total : _auditTotal;
    return shad.Scaffold(
      child: Stack(
        children: [
          if (selected != null)
            ShellTitleOverride(
              ownerId: 'crm-detail-title',
              locations: const {Routes.crm},
              title: selected.label,
            ),
          ShellMiniNav(
            ownerId: 'crm-root-nav',
            locations: const {Routes.crm},
            deepLinkBackRoute: Routes.apps,
            items: [
              ShellMiniNavItemSpec(
                id: 'crm-back',
                icon: Icons.chevron_left,
                label: l10n.navBack,
                callbackToken: (selected?.id, _searching),
                onPressed: _back,
              ),
              ShellMiniNavItemSpec(
                id: 'crm-users',
                icon: Icons.badge_outlined,
                label: l10n.crmUsersTab,
                callbackToken: _tab,
                selected: usersTab,
                enabled: _canViewUsers,
                onPressed: () => _selectTab(_CrmTab.users),
              ),
              ShellMiniNavItemSpec(
                id: 'crm-audit',
                icon: Icons.history_rounded,
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
            locations: const {Routes.crm},
            onBack: _back,
            onResetSection: _resetSearch,
            actions: [
              if (selected == null && allowed)
                ShellActionSpec(
                  id: 'crm-search',
                  icon: Icons.search_rounded,
                  tooltip: usersTab
                      ? l10n.crmSearchUsersHint
                      : l10n.crmSearchAuditHint,
                  inDock: true,
                  callbackToken: (_searching, _tab),
                  searchController: _searching ? _searchController : null,
                  searchHint: usersTab
                      ? l10n.crmSearchUsersHint
                      : l10n.crmSearchAuditHint,
                  onSearchChanged: _onSearchChanged,
                  onCloseSearch: _resetSearch,
                  onPressed: () => _updateState(() => _searching = true),
                ),
              if (selected == null && allowed)
                ShellActionSpec(
                  id: 'crm-filters',
                  icon: Icons.filter_list_rounded,
                  tooltip: l10n.commonFilters,
                  callbackToken: (_tab, filterCount),
                  highlighted: filterCount > 0,
                  onPressed: usersTab
                      ? _showUsersFilterSheet
                      : _showAuditFilterSheet,
                ),
              if (selected == null && usersTab && _canCreateUsers)
                ShellActionSpec(
                  id: 'crm-create',
                  icon: Icons.person_add_alt_1_rounded,
                  tooltip: l10n.crmCreateUser,
                  callbackToken: widget.workspaceId,
                  onPressed: _showUserSheet,
                ),
              if (selected == null &&
                  usersTab &&
                  (_canViewUsers || _canCreateUsers))
                ShellActionSpec(
                  id: 'crm-tools',
                  icon: Icons.more_horiz_rounded,
                  tooltip: l10n.appsHubMoreTools,
                  callbackToken: _workspacePermissions,
                  onPressed: _showCrmToolsSheet,
                ),
              if (selected != null && _canUpdateUsers)
                ShellActionSpec(
                  id: 'crm-edit',
                  icon: Icons.edit_outlined,
                  tooltip: l10n.commonEdit,
                  callbackToken: selected,
                  inDock: true,
                  onPressed: () => _showUserSheet(user: selected),
                ),
              if (selected != null && _canViewFeedbacks)
                ShellActionSpec(
                  id: 'crm-feedback',
                  icon: Icons.chat_bubble_outline_rounded,
                  tooltip: l10n.crmFeedbackAction,
                  callbackToken: selected,
                  onPressed: () => _showFeedbackSheet(selected),
                ),
              if (selected != null && _canDeleteUsers)
                ShellActionSpec(
                  id: 'crm-delete',
                  icon: Icons.delete_outline_rounded,
                  tooltip: l10n.commonDelete,
                  callbackToken: selected,
                  onPressed: () => _deleteUser(selected),
                ),
            ],
          ),
          ResponsiveWrapper(
            maxWidth: ResponsivePadding.maxContentWidth(context.deviceClass),
            child: selected != null
                ? _CrmUserDetail(
                    user: selected,
                    privateInfo: _userPermissions?.hasPrivateInfo ?? false,
                    publicInfo: _userPermissions?.hasPublicInfo ?? false,
                  )
                : NovaRefreshIndicator(
                    onRefresh: () => _loadInitial(force: true),
                    child: ListView.builder(
                      controller: _scrollController,
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: EdgeInsets.fromLTRB(
                        16,
                        8,
                        16,
                        24 + MediaQuery.paddingOf(context).bottom,
                      ),
                      itemCount: 2 + (allowed ? count : 0),
                      itemBuilder: (context, index) {
                        if (index == 0) {
                          return Padding(
                            padding: const EdgeInsets.only(bottom: 16),
                            child: FinanceSectionHeader(
                              title: usersTab
                                  ? l10n.crmUsersTab
                                  : l10n.crmAuditTab,
                              subtitle: allowed
                                  ? NumberFormat.compact().format(total)
                                  : null,
                            ),
                          );
                        }
                        if (index == count + 1 || !allowed) {
                          if (!allowed && !_isLoading) {
                            return FinanceEmptyState(
                              icon: Icons.lock_outline_rounded,
                              title: l10n.crmTitle,
                              body: l10n.crmPermissionDenied,
                            );
                          }
                          if (_isLoading && count == 0) {
                            return const _CrmLoadingRows();
                          }
                          if (_isLoading || _isLoadingMore) {
                            return const Padding(
                              padding: EdgeInsets.all(24),
                              child: Center(child: NovaLoadingIndicator()),
                            );
                          }
                          if (_error != null && count == 0) {
                            return FinanceEmptyState(
                              icon: Icons.error_outline_rounded,
                              title: l10n.commonSomethingWentWrong,
                              body: _error!,
                            );
                          }
                          if (count == 0) {
                            return FinanceEmptyState(
                              icon: usersTab
                                  ? Icons.badge_outlined
                                  : Icons.history_rounded,
                              title: usersTab
                                  ? l10n.crmUsersTab
                                  : l10n.crmAuditTab,
                              body: usersTab
                                  ? l10n.crmEmptyUsers
                                  : l10n.crmEmptyAudit,
                            );
                          }
                          if (_pagingFailed) {
                            return Center(
                              child: TextButton(
                                onPressed: () {
                                  _pagingFailed = false;
                                  unawaited(_loadMore());
                                },
                                child: Text(l10n.commonRetry),
                              ),
                            );
                          }
                          return const SizedBox(height: 8);
                        }
                        if (!usersTab) {
                          return _CrmAuditCard(event: _auditEvents[index - 1]);
                        }
                        final user = _users[index - 1];
                        return PendingSyncFrame(
                          workspaceId: widget.workspaceId,
                          entityId: user.id,
                          feature: 'crm',
                          child: _CrmUserCard(
                            user: user,
                            onOpen: () {
                              _searching = false;
                              _updateState(() => _selectedUser = user);
                            },
                            onEdit: _canUpdateUsers
                                ? () => _showUserSheet(user: user)
                                : null,
                            onDelete: _canDeleteUsers
                                ? () => _deleteUser(user)
                                : null,
                            onFeedback: _canViewFeedbacks
                                ? () => _showFeedbackSheet(user)
                                : null,
                          ),
                        );
                      },
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}
