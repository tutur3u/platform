import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/finance/finance_invoice.dart';
import 'package:mobile/data/repositories/crm_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/finance/widgets/finance_money.dart';
import 'package:mobile/l10n/l10n.dart';

class ContactBilling extends StatefulWidget {
  const ContactBilling({
    required this.workspaceId,
    required this.contactId,
    required this.repository,
    super.key,
  });

  final String workspaceId;
  final String contactId;
  final CrmRepository repository;

  @override
  State<ContactBilling> createState() => _ContactBillingState();
}

class _ContactBillingState extends State<ContactBilling> {
  double? _outstanding;
  final _invoices = <String, FinanceInvoice>{};
  int _page = 0;
  int _request = 0;
  bool _hasMore = true;
  bool _loading = false;
  bool _failed = false;
  bool _denied = false;

  void _open(bool expanded) {
    if (expanded) unawaited(_loadMore(refresh: true));
  }

  Future<void> _loadMore({bool refresh = false}) async {
    if (!refresh && (_loading || !_hasMore)) return;
    final request = ++_request;
    final page = refresh ? 1 : _page + 1;
    setState(() {
      _loading = true;
      _failed = false;
      _denied = false;
      if (refresh) _clearSnapshot();
    });
    try {
      final result = await widget.repository.getContactInvoices(
        widget.workspaceId,
        widget.contactId,
        page: page,
      );
      if (!mounted || request != _request) return;
      setState(() {
        _page = page;
        if (_page == 1) _outstanding = result.outstanding;
        for (final invoice in result.items) {
          _invoices[invoice.id] = invoice;
        }
        _hasMore = result.items.isNotEmpty && _page * 10 < result.count;
      });
    } on ApiException catch (error) {
      if (!mounted || request != _request) return;
      setState(() {
        _failed = true;
        if (const {401, 403, 404}.contains(error.statusCode)) {
          _clearSnapshot();
          _denied = true;
        }
      });
    } on Object {
      if (mounted && request == _request) setState(() => _failed = true);
    } finally {
      if (mounted && request == _request) setState(() => _loading = false);
    }
  }

  void _clearSnapshot() {
    _invoices.clear();
    _outstanding = null;
    _page = 0;
    _hasMore = true;
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final date = DateFormat.yMMMd(Localizations.localeOf(context).toString());
    return AppPanel(
      padded: false,
      child: AppDisclosure(
        title: Text(l10n.financeInvoices),
        leading: const AppIconTile(
          icon: LucideIcons.receipt,
          tone: AppTone.info,
        ),
        onExpansionChanged: _open,
        childrenPadding: const EdgeInsets.all(AppSpacing.md),
        children: [
          if (_outstanding case final outstanding?)
            AppRichRow(
              title: l10n.crmOutstandingSubscriptions,
              trailing: FinanceAmountText(outstanding, 'VND'),
            ),
          for (final invoice in _invoices.values)
            AppRichRow(
              title: invoice.notice ?? l10n.financeInvoice,
              subtitle: [
                if (invoice.createdAt case final timestamp?)
                  date.format(timestamp.toLocal()),
                if (invoice.note case final note?) note,
              ].join('\n'),
              trailing: invoice.total != null
                  ? FinanceAmountText(invoice.total!, 'VND')
                  : null,
            ),
          if (_loading)
            const AppSkeletonRows(count: 1)
          else if (_denied)
            Text(l10n.crmBillingUnavailable)
          else if (_failed)
            AppButton.outline(
              onPressed: _loadMore,
              child: Text(l10n.commonRetry),
            )
          else if (_invoices.isEmpty)
            Text(l10n.financeInvoiceEmpty)
          else if (_hasMore)
            AppButton.outline(
              onPressed: _loadMore,
              child: Text(l10n.commonLoadMore),
            ),
        ],
      ),
    );
  }
}
