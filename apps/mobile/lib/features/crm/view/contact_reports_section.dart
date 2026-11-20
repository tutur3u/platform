import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/repositories/crm_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/crm/utils/contact_sections.dart';
import 'package:mobile/features/crm/view/contact_section_list.dart';
import 'package:mobile/l10n/l10n.dart';

class ContactReportsSection extends StatefulWidget {
  const ContactReportsSection({
    required this.workspaceId,
    required this.repository,
    required this.onOpen,
    super.key,
  });

  final String workspaceId;
  final CrmRepository repository;
  final ValueChanged<ContactSectionRecord> onOpen;

  @override
  State<ContactReportsSection> createState() => _ContactReportsSectionState();
}

class _ContactReportsSectionState extends State<ContactReportsSection> {
  List<ContactSectionRecord> _records = const [];
  int _page = 1;
  int _pageCount = 1;
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    unawaited(_loadPage(1));
  }

  Future<void> _loadPage(int requestedPage) async {
    if (_loading) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      var currentPage = requestedPage;
      var response = await widget.repository.loadReports(
        widget.workspaceId,
        page: currentPage,
      );
      if (!mounted) return;

      final lastPage = _lastPage(response.total);
      if (currentPage > lastPage) {
        currentPage = lastPage;
        response = await widget.repository.loadReports(
          widget.workspaceId,
          page: currentPage,
        );
        if (!mounted) return;
      }
      setState(() {
        _records = response.records;
        _page = currentPage;
        _pageCount = math.max(_page, _lastPage(response.total));
      });
    } on Object catch (error) {
      if (!mounted) return;
      setState(() {
        _records = const [];
        _page = requestedPage;
        _error = error is ApiException
            ? error.message
            : context.l10n.commonSomethingWentWrong;
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  int _lastPage(int total) =>
      math.max(1, (total / ContactReportPage.pageSize).ceil());

  @override
  Widget build(BuildContext context) => ContactSectionList(
    records: _records,
    loading: _loading,
    error: _error,
    onRefresh: () => _loadPage(_page),
    onOpen: _loading ? null : widget.onOpen,
    footer: _error == null && _pageCount > 1 ? _buildPager(context) : null,
  );

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
