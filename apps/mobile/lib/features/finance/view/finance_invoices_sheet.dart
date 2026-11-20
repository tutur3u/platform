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
import 'package:mobile/features/finance/view/finance_fee_locks_sheet.dart';
import 'package:mobile/features/finance/view/finance_invoice_editor.dart';
import 'package:mobile/features/finance/view/finance_invoice_export_sheet.dart';
import 'package:mobile/features/finance/view/finance_invoice_history_sheet.dart';
import 'package:mobile/features/finance/view/finance_invoice_report_sheet.dart';
import 'package:mobile/features/finance/view/finance_invoice_subscription_sheet.dart';
import 'package:mobile/features/finance/widgets/finance_directory_sheet.dart';
import 'package:mobile/features/finance/widgets/finance_invoice_receipt.dart';
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
  int _listRevision = 0;

  Future<bool> _create(
    BuildContext context, [
    FinancePendingInvoice? pending,
    bool manualSubscription = false,
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
            manualSubscription: manualSubscription,
          ),
        ) ??
        false;
  }

  Future<bool> _manualSubscription(BuildContext context) async {
    final session = widget.session;
    final customer = await selectFinanceInvoiceCustomer(context, session);
    if (!context.mounted ||
        customer == null ||
        !session.allows('create_invoices')) {
      return false;
    }
    final terms = await session.open<FinancePendingInvoice>(
      context,
      (_) => FinanceInvoiceSubscriptionSheet(
        customer: customer,
        load: () => widget.repository.getSubscriptionGroups(
          session.workspaceId,
          customer.id,
        ),
      ),
    );
    if (!context.mounted ||
        terms == null ||
        !session.allows('create_invoices')) {
      return false;
    }
    return await _create(context, terms, true);
  }

  Future<void> _export(BuildContext context, String query) =>
      widget.session.open<void>(
        context,
        (_) => FinanceInvoiceExportSheet(
          repository: widget.repository,
          session: widget.session,
          pending: _subscriptions,
          query: query,
        ),
      );

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
        wallets: widget.wallets,
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
        create: session.allows('create_invoices') ? _manualSubscription : null,
        createLabel: l10n.financeInvoiceManualSubscription,
        onExport: session.allows('export_finance_data') ? _export : null,
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
      key: ValueKey(_listRevision),
      title: l10n.financeInvoices,
      empty: l10n.financeInvoiceEmpty,
      onExport: session.allows('export_finance_data') ? _export : null,
      sections: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: AppSpacing.sm,
        children: [
          sections,
          AppGroupedCard(
            children: [
              AppRichRow(
                title: l10n.financeInvoiceReports,
                leading: const AppIconTile(icon: LucideIcons.chartNoAxesColumn),
                onTap: () => session.open<void>(
                  context,
                  (_) => FinanceInvoiceReportSheet(
                    session: session,
                    repository: widget.repository,
                    wallets: widget.wallets,
                  ),
                ),
              ),
              if (session.allows('manage_workspace_audit_logs'))
                AppRichRow(
                  title: l10n.financeInvoiceHistory,
                  leading: const AppIconTile(icon: LucideIcons.history),
                  onTap: () => session.open<void>(
                    context,
                    (_) => FinanceInvoiceHistorySheet(
                      session: session,
                      repository: widget.repository,
                      onRestore: () {
                        if (mounted) setState(() => _listRevision++);
                      },
                    ),
                  ),
                ),
              AppRichRow(
                title: l10n.financeFeeLocks,
                leading: const AppIconTile(icon: LucideIcons.lockKeyhole),
                onTap: () => session.open<void>(
                  context,
                  (_) => FinanceFeeLocksSheet(
                    session: session,
                    repository: widget.repository,
                  ),
                ),
              ),
            ],
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
    required this.wallets,
    required this.amount,
  });

  final FinanceSheetSession session;
  final FinanceRepository repository;
  final FinanceInvoice invoice;
  final List<Wallet> wallets;
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

  Future<void> _moveWallet() async {
    final invoice = widget.invoice;
    final session = widget.session;
    final candidates = widget.wallets.where(
      (wallet) => wallet.id != invoice.walletId && wallet.currency != null,
    );
    final l10n = context.l10n;
    final wallet = await session.open<Wallet>(
      context,
      (_) => AppChoiceSheet(
        title: l10n.financeInvoiceMoveWallet,
        selected: null,
        choices: [
          for (final wallet in candidates)
            AppSheetChoice(
              value: wallet,
              label: wallet.name ?? wallet.id,
              subtitle: wallet.currency,
            ),
        ],
      ),
    );
    if (wallet == null ||
        !mounted ||
        !session.allows('update_invoices') ||
        !session.allows('change_finance_wallets')) {
      return;
    }
    final currency = widget.wallets
        .where((wallet) => wallet.id == invoice.walletId)
        .firstOrNull
        ?.currency;
    if (currency != wallet.currency) {
      final confirmed = await showAppConfirmDialog(
        context: context,
        title: l10n.financeInvoiceMoveWallet,
        message: l10n.financeInvoiceMoveCurrency(wallet.currency!),
        confirmLabel: l10n.financeInvoiceMoveWallet,
        cancelLabel: l10n.commonCancel,
      );
      if (!mounted ||
          !confirmed ||
          !session.allows('update_invoices') ||
          !session.allows('change_finance_wallets')) {
        return;
      }
    }
    await _write(
      () => widget.repository.moveInvoiceWallet(
        workspace: session.workspaceId,
        id: invoice.id,
        walletId: wallet.id,
      ),
    );
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
          FinanceInvoiceReceiptLoader(
            load: () => widget.repository.getInvoiceDetail(
              workspace: widget.session.workspaceId,
              id: invoice.id,
            ),
            fallbackCurrency:
                widget.wallets
                    .where((wallet) => wallet.id == invoice.walletId)
                    .firstOrNull
                    ?.currency ??
                '',
          ),
          if (canEdit &&
              widget.session.allows('change_finance_wallets') &&
              widget.wallets.any(
                (wallet) =>
                    wallet.id != invoice.walletId && wallet.currency != null,
              ))
            AppRichRow(
              title: l10n.financeInvoiceMoveWallet,
              leading: const AppIconTile(icon: LucideIcons.wallet),
              onTap: _busy ? null : _moveWallet,
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
