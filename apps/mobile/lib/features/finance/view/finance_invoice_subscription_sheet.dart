import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/crm/crm_models.dart';
import 'package:mobile/data/models/finance/finance_invoice.dart';
import 'package:mobile/data/repositories/crm_repository.dart';
import 'package:mobile/features/finance/widgets/finance_directory_sheet.dart';
import 'package:mobile/features/finance/widgets/finance_workspace_sheet.dart';
import 'package:mobile/l10n/l10n.dart';

Future<CrmUser?> selectFinanceInvoiceCustomer(
  BuildContext context,
  FinanceSheetSession session,
) {
  final crm = CrmRepository();
  return session.open<CrmUser>(
    context,
    (context) => FinanceDirectorySheet<CrmUser>(
      title: context.l10n.financeInvoiceCustomer,
      empty: context.l10n.financeInvoiceNoCustomers,
      fetch: (query, page) async {
        final result = await crm.getUsers(
          session.workspaceId,
          query: query,
          page: page,
        );
        return (items: result.users, count: result.count);
      },
      row: (context, person, _) => AppOptionTile(
        title: person.label,
        onTap: () => Navigator.of(context).pop(person),
      ),
    ),
  );
}

class FinanceInvoiceSubscriptionSheet extends StatefulWidget {
  const FinanceInvoiceSubscriptionSheet({
    required this.load,
    required this.customer,
    super.key,
  });

  final Future<List<FinanceSubscriptionGroup>> Function() load;
  final CrmUser customer;

  @override
  State<FinanceInvoiceSubscriptionSheet> createState() =>
      _FinanceInvoiceSubscriptionSheetState();
}

class _FinanceInvoiceSubscriptionSheetState
    extends State<FinanceInvoiceSubscriptionSheet> {
  late Future<List<FinanceSubscriptionGroup>> _groups = widget.load();
  DateTime _month = DateTime.now();
  final _selected = <String>{};

  Future<void> _pickMonth() async {
    final value = await showAppDatePicker(
      context: context,
      initialDate: _month,
      firstDate: DateTime(2000),
      lastDate: DateTime(DateTime.now().year + 5, 12, 31),
    );
    if (!mounted || value == null) return;
    setState(() {
      _month = value;
      _selected.clear();
    });
  }

  bool _coversMonth(FinanceSubscriptionGroup group) {
    final start = DateTime(_month.year, _month.month);
    final end = DateTime(_month.year, _month.month + 1);
    return (group.start == null || group.start!.isBefore(end)) &&
        (group.end == null || !group.end!.isBefore(start));
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppSheetScaffold(
      title: l10n.financeInvoiceManualSubscription,
      actions: [
        AppButton.primary(
          onPressed: _selected.isEmpty
              ? null
              : () => Navigator.of(context).pop(
                  FinancePendingInvoice(
                    customerId: widget.customer.id,
                    customer: widget.customer.label,
                    groups: _selected.toList(growable: false),
                    months: [DateFormat('yyyy-MM', 'en').format(_month)],
                  ),
                ),
          child: Text(l10n.commonNext),
        ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: AppSpacing.md,
        children: [
          AppRichRow(
            title: widget.customer.label,
            leading: const AppIconTile(icon: LucideIcons.userRound),
          ),
          AppRichRow(
            title: l10n.financeInvoiceCoverage,
            subtitle: DateFormat.yMMMM(l10n.localeName).format(_month),
            onTap: _pickMonth,
          ),
          FutureBuilder(
            future: _groups,
            builder: (context, snapshot) {
              if (snapshot.connectionState != ConnectionState.done) {
                return const AppSkeletonRows();
              }
              final groups = snapshot.data?.where(_coversMonth).toList();
              if (groups == null || groups.isEmpty) {
                return AppStateMessage.inline(
                  icon: groups == null
                      ? LucideIcons.circleAlert
                      : LucideIcons.users,
                  title: groups == null
                      ? l10n.commonSomethingWentWrong
                      : l10n.financeInvoiceNoEligibleGroups,
                  actionLabel: groups == null ? l10n.commonRetry : null,
                  onAction: groups == null
                      ? () => setState(() => _groups = widget.load())
                      : null,
                );
              }
              return AppGroupedCard(
                children: [
                  for (final group in groups)
                    AppOptionTile(
                      title: group.name,
                      selected: _selected.contains(group.id),
                      onTap: () => setState(() {
                        if (!_selected.remove(group.id)) {
                          _selected.add(group.id);
                        }
                      }),
                    ),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}
