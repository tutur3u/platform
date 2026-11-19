import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/finance/finance_invoice.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/features/finance/view/finance_invoice_editor.dart';
import 'package:mobile/features/finance/view/finance_invoice_report_sheet.dart';
import 'package:mobile/features/finance/widgets/finance_directory_sheet.dart';
import 'package:mobile/features/finance/widgets/finance_money.dart';
import 'package:mobile/features/finance/widgets/finance_workspace_sheet.dart';
import 'package:mobile/l10n/l10n.dart';

Future<void> openFinanceInvoices(
  BuildContext context, {
  required List<Wallet> wallets,
  required String currency,
}) async {
  final repository = context.read<FinanceRepository>();
  final session = FinanceSheetSession(context);
  await session.run(
    (context) => _FinanceInvoicesSheet(
      session: session,
      repository: repository,
      wallets: wallets,
      currency: currency,
    ),
  );
}

class _FinanceInvoicesSheet extends StatefulWidget {
  const _FinanceInvoicesSheet({
    required this.session,
    required this.repository,
    required this.wallets,
    required this.currency,
  });

  final FinanceSheetSession session;
  final FinanceRepository repository;
  final List<Wallet> wallets;
  final String currency;

  @override
  State<_FinanceInvoicesSheet> createState() => _FinanceInvoicesSheetState();
}

class _FinanceInvoicesSheetState extends State<_FinanceInvoicesSheet> {
  bool _subscriptions = false;

  Future<bool> _create(
    BuildContext context, [
    FinancePendingInvoice? pending,
  ]) async {
    if (!widget.session.active || !context.mounted) return false;
    return await widget.session.open<bool>(
          context,
          (_) => FinanceInvoiceEditor(
            session: widget.session,
            repository: widget.repository,
            wallets: widget.wallets,
            currency: widget.currency,
            pending: pending,
          ),
        ) ??
        false;
  }

  Widget? _money(FinanceInvoice invoice) {
    final total = invoice.total;
    final wallet = widget.wallets
        .where((wallet) => wallet.id == invoice.walletId)
        .firstOrNull;
    final currency = wallet?.currency;
    if (total == null || currency == null) return null;
    return FinanceAmountText(total, currency);
  }

  Future<void> _openDetail(
    BuildContext context,
    FinanceInvoice invoice,
    Future<void> Function() reload,
  ) async {
    final changed = await widget.session.open<bool>(
      context,
      (_) => _FinanceInvoiceDetails(
        session: widget.session,
        repository: widget.repository,
        invoice: invoice,
        amount: _money(invoice),
      ),
    );
    if (mounted && changed == true) await reload();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final session = widget.session;
    final ws = session.workspaceId;
    final sections = AppSegmentedControl<bool>(
      segments: [
        AppSegment(value: false, label: l10n.financeInvoices),
        AppSegment(value: true, label: l10n.financeInvoiceSubscriptions),
      ],
      selected: _subscriptions,
      onChanged: (value) => setState(() => _subscriptions = value),
    );
    if (_subscriptions) {
      return FinanceDirectorySheet<FinancePendingInvoice>(
        title: l10n.financeInvoices,
        empty: l10n.financeInvoiceNoPending,
        sections: sections,
        fetch: (query, page) =>
            widget.repository.getPendingInvoices(ws, query: query, page: page),
        row: (context, pending, reload) => AppRichRow(
          key: ValueKey((pending.customerId, pending.groups.join(','))),
          title: pending.customer.isEmpty
              ? l10n.financeInvoiceCustomer
              : pending.customer,
          subtitle: pending.months.join(', '),
          leading: const AppIconTile(icon: LucideIcons.calendar),
          onTap:
              session.allows('create_invoices') &&
                  pending.groups.isNotEmpty &&
                  pending.months.isNotEmpty
              ? () async {
                  if (await _create(context, pending) && mounted) {
                    await reload();
                  }
                }
              : null,
        ),
      );
    }
    return FinanceDirectorySheet<FinanceInvoice>(
      title: l10n.financeInvoices,
      empty: l10n.financeInvoiceEmpty,
      sections: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: AppSpacing.sm,
        children: [
          sections,
          AppButton.secondary(
            leading: const Icon(LucideIcons.chartNoAxesColumn),
            onPressed: () => session.open<void>(
              context,
              (_) => FinanceInvoiceReportSheet(
                session: session,
                repository: widget.repository,
                wallets: widget.wallets,
              ),
            ),
            child: Text(l10n.financeInvoiceReports),
          ),
        ],
      ),
      fetch: (query, page) =>
          widget.repository.getInvoices(ws, query: query, page: page),
      create:
          session.allows('create_invoices') ||
              session.allows('create_inventory_sales')
          ? _create
          : null,
      createLabel: l10n.financeInvoiceNew,
      row: (context, invoice, reload) => AppRichRow(
        key: ValueKey(invoice.id),
        title: invoice.customer ?? invoice.notice ?? l10n.financeInvoice,
        subtitle: [
          if (invoice.createdAt case final date?)
            DateFormat.yMMMd(l10n.localeName).format(date.toLocal()),
          if (invoice.wallet case final wallet?) wallet,
        ].join(' · '),
        leading: const AppIconTile(icon: LucideIcons.receipt),
        trailing: _money(invoice),
        onTap: () => unawaited(_openDetail(context, invoice, reload)),
      ),
    );
  }
}

class _FinanceInvoiceDetails extends StatefulWidget {
  const _FinanceInvoiceDetails({
    required this.session,
    required this.repository,
    required this.invoice,
    required this.amount,
  });

  final FinanceSheetSession session;
  final FinanceRepository repository;
  final FinanceInvoice invoice;
  final Widget? amount;

  @override
  State<_FinanceInvoiceDetails> createState() => _FinanceInvoiceDetailsState();
}

class _FinanceInvoiceDetailsState extends State<_FinanceInvoiceDetails> {
  late final _notice = TextEditingController(text: widget.invoice.notice);
  late final _note = TextEditingController(text: widget.invoice.note);
  bool _busy = false;
  bool _failed = false;

  @override
  void dispose() {
    _notice.dispose();
    _note.dispose();
    super.dispose();
  }

  Future<void> _write(Future<void> Function() write) async {
    if (!widget.session.active || _busy) return;
    setState(() {
      _busy = true;
      _failed = false;
    });
    try {
      await write();
      if (mounted && widget.session.active) Navigator.of(context).pop(true);
    } on Object {
      if (mounted) {
        setState(() {
          _busy = false;
          _failed = true;
        });
      }
    }
  }

  Future<void> _delete() async {
    final confirmed = await showAppActionSheet<bool>(
      context: context,
      title: context.l10n.financeInvoiceDelete,
      actions: [
        AppSheetAction(
          label: context.l10n.commonDelete,
          value: true,
          destructive: true,
        ),
      ],
    );
    if (confirmed != true ||
        !mounted ||
        !widget.session.allows('delete_invoices')) {
      return;
    }
    await _write(
      () => widget.repository.deleteInvoice(
        widget.session.workspaceId,
        widget.invoice.id,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final invoice = widget.invoice;
    final canEdit = widget.session.allows('update_invoices');
    return AppSheetScaffold(
      title: l10n.financeInvoice,
      actions: [
        if (widget.session.allows('delete_invoices'))
          AppButton.secondary(
            onPressed: _busy ? null : _delete,
            child: Text(l10n.commonDelete),
          ),
        if (canEdit)
          AppButton.primary(
            onPressed: _busy
                ? null
                : () => _write(
                    () => widget.repository.updateInvoice(
                      workspace: widget.session.workspaceId,
                      id: invoice.id,
                      notice: _notice.text.trim(),
                      note: _note.text.trim(),
                    ),
                  ),
            child: Text(l10n.commonSave),
          ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: AppSpacing.md,
        children: [
          if (_failed)
            AppStateMessage.inline(
              icon: LucideIcons.circleAlert,
              title: l10n.commonSomethingWentWrong,
            ),
          AppRichRow(
            title: invoice.customer ?? l10n.financeInvoice,
            subtitle: invoice.wallet,
            leading: const AppIconTile(icon: LucideIcons.receipt),
            trailing: widget.amount,
          ),
          if (invoice.coverage case final coverage? when coverage.isNotEmpty)
            AppRichRow(title: l10n.financeInvoiceCoverage, subtitle: coverage),
          if (invoice.creator case final creator?)
            AppRichRow(title: l10n.financeInvoiceCreator, subtitle: creator),
          AppTextField(
            controller: _notice,
            label: l10n.financeInvoiceContent,
            placeholder: l10n.financeInvoiceContent,
            enabled: canEdit && !_busy,
          ),
          AppTextField(
            controller: _note,
            label: l10n.financeInvoiceNotes,
            placeholder: l10n.financeInvoiceNotes,
            enabled: canEdit && !_busy,
            maxLines: 3,
          ),
        ],
      ),
    );
  }
}
