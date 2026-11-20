import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/repositories/crm_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/crm/utils/contact_sections.dart';
import 'package:mobile/features/crm/view/contact_section_list.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/l10n/l10n.dart';

class ContactReportsSection extends StatefulWidget {
  const ContactReportsSection({
    required this.workspaceId,
    required this.repository,
    required this.onOpen,
    required this.selectCadence,
    super.key,
  });

  final String workspaceId;
  final CrmRepository repository;
  final ValueChanged<ContactSectionRecord> onOpen;
  final Future<ContactReportCadence?> Function(ContactReportCadence)
  selectCadence;

  @override
  State<ContactReportsSection> createState() => _ContactReportsSectionState();
}

class _ContactReportsSectionState extends State<ContactReportsSection> {
  List<ContactSectionRecord> _records = const [];
  int _page = 1;
  int _pageCount = 1;
  bool _loading = false;
  String? _error;
  final _searchController = TextEditingController();
  Timer? _searchDebounce;
  bool _searching = false;
  String _query = '';
  ContactReportCadence _cadence = ContactReportCadence.all;
  int _request = 0;

  @override
  void initState() {
    super.initState();
    unawaited(_loadPage(1));
  }

  @override
  void dispose() {
    _searchDebounce?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadPage(int requestedPage, {bool replace = false}) async {
    if (_loading && !replace) return;
    final request = ++_request;
    final query = _query;
    final cadence = _cadence;
    setState(() {
      _loading = true;
      _error = null;
      if (replace) {
        _records = const [];
        _pageCount = 1;
      }
    });
    try {
      var currentPage = requestedPage;
      var response = await widget.repository.loadReports(
        widget.workspaceId,
        page: currentPage,
        query: query,
        cadence: cadence,
      );
      if (!mounted || request != _request) return;

      final lastPage = _lastPage(response.total);
      if (currentPage > lastPage) {
        currentPage = lastPage;
        response = await widget.repository.loadReports(
          widget.workspaceId,
          page: currentPage,
          query: query,
          cadence: cadence,
        );
        if (!mounted || request != _request) return;
      }
      setState(() {
        _records = response.records;
        _page = currentPage;
        _pageCount = math.max(_page, _lastPage(response.total));
      });
    } on Object catch (error) {
      if (!mounted || request != _request) return;
      setState(() {
        _records = const [];
        _page = requestedPage;
        _error = error is ApiException
            ? error.message
            : context.l10n.commonSomethingWentWrong;
      });
    } finally {
      if (mounted && request == _request) setState(() => _loading = false);
    }
  }

  int _lastPage(int total) =>
      math.max(1, (total / ContactReportPage.pageSize).ceil());

  void _searchChanged(String value) {
    _searchDebounce?.cancel();
    _searchDebounce = Timer(
      const Duration(milliseconds: 300),
      () => _applyQuery(value),
    );
  }

  void _applyQuery(String value) {
    _searchDebounce?.cancel();
    final query = value.trim();
    if (query == _query) return;
    _query = query;
    unawaited(_loadPage(1, replace: true));
  }

  void _closeSearch() {
    _searchController.clear();
    setState(() => _searching = false);
    _applyQuery('');
  }

  Future<void> _changeCadence() async {
    final result = await widget.selectCadence(_cadence);
    if (!mounted || result == null || result == _cadence) return;
    _cadence = result;
    await _loadPage(1, replace: true);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Stack(
      children: [
        ShellChromeActions(
          ownerId: 'crm-report-actions',
          locations: Routes.contactLocations,
          onBack: _searching ? () async => _closeSearch() : null,
          actions: [
            ShellActionSpec.search(
              id: 'crm-report-search',
              active: _searching,
              hasQuery: _query.isNotEmpty,
              tooltip: l10n.contactsReportSearchHint,
              onPressed: _searching
                  ? _closeSearch
                  : () => setState(() => _searching = true),
              controller: _searchController,
              searchHint: l10n.contactsReportSearchHint,
              onSearchChanged: _searchChanged,
              onSearchSubmitted: _applyQuery,
              onCloseSearch: _closeSearch,
            ),
            ShellActionSpec(
              id: 'crm-report-cadence',
              icon: LucideIcons.listFilter,
              tooltip: l10n.contactsReportCadence,
              highlighted: _cadence != ContactReportCadence.all,
              onPressed: _changeCadence,
            ),
          ],
        ),
        ContactSectionList(
          records: _records,
          loading: _loading,
          error: _error,
          emptyMessage: _query.isEmpty && _cadence == ContactReportCadence.all
              ? l10n.contactsReportEmptyList
              : l10n.commonNoSearchResults,
          onRefresh: () => _loadPage(_page),
          onOpen: _loading ? null : widget.onOpen,
          footer: _error == null && _pageCount > 1
              ? _buildPager(context)
              : null,
        ),
      ],
    );
  }

  Widget _buildPager(BuildContext context) {
    final l10n = context.l10n;
    return Wrap(
      alignment: WrapAlignment.center,
      crossAxisAlignment: WrapCrossAlignment.center,
      spacing: AppSpacing.sm,
      children: [
        AppButton.ghost(
          onPressed: !_loading && _page > 1 ? () => _loadPage(_page - 1) : null,
          child: Text(l10n.commonPrevious),
        ),
        Text(l10n.contactsReportPage(_page, _pageCount)),
        AppButton.ghost(
          onPressed: !_loading && _page < _pageCount
              ? () => _loadPage(_page + 1)
              : null,
          child: Text(l10n.commonNext),
        ),
      ],
    );
  }
}
