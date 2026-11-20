import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/finance/view/bill_split_create_sheet.dart';
import 'package:mobile/features/finance/widgets/finance_money.dart';
import 'package:mobile/l10n/l10n.dart';

class BillSplitActivityPanel extends StatefulWidget {
  const BillSplitActivityPanel({
    required this.api,
    required this.path,
    required this.split,
    required this.onUpdate,
    super.key,
  });

  final ApiClient api;
  final String path;
  final Map<String, dynamic> split;
  final VoidCallback onUpdate;

  @override
  State<BillSplitActivityPanel> createState() => _BillSplitActivityPanelState();
}

class _BillSplitActivityPanelState extends State<BillSplitActivityPanel> {
  late Future<List<dynamic>> _events = _read();
  Map<String, Object>? _pending;
  bool _busy = false;
  bool _failed = false;

  Future<List<dynamic>> _read() => widget.api.getJsonList(widget.path);

  @override
  void didUpdateWidget(covariant BillSplitActivityPanel oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!identical(oldWidget.split, widget.split)) _events = _read();
  }

  Future<void> _send(Map<String, Object> payload) async {
    if (_busy) return;
    final request = _pending ?? {...payload, 'eventId': newBillSplitId()};
    setState(() {
      _busy = true;
      _failed = false;
      _pending = request;
    });
    try {
      await widget.api.postJson(widget.path, request);
      if (!mounted) return;
      _pending = null;
      widget.onUpdate();
    } on Object {
      if (mounted) setState(() => _failed = true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<String?> _value(
    BuildContext context, {
    required String title,
    required bool comment,
  }) async {
    final controller = TextEditingController();
    try {
      return await showAppSheet<String>(
        context: context,
        builder: (context) => AppSheetScaffold(
          title: title,
          actions: [
            AppButton.primary(
              onPressed: () =>
                  Navigator.of(context).pop(controller.text.trim()),
              child: Text(context.l10n.commonSave),
            ),
          ],
          child: AppTextField(
            label: title,
            controller: controller,
            maxLength: comment ? 2000 : 24,
            maxLines: comment ? 3 : 1,
            keyboardType: comment
                ? TextInputType.multiline
                : const TextInputType.numberWithOptions(decimal: true),
          ),
        ),
      );
    } finally {
      WidgetsBinding.instance.addPostFrameCallback((_) => controller.dispose());
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final currency = widget.split['currency'] as Map<String, dynamic>;
    final code = currency['code'] as String;
    final digits = currency['minorDigits'] as int;
    final participants = {
      for (final person in _rows(widget.split['participants']))
        person['id']: person,
    };
    final ledger = widget.split['ledger'] as Map<String, dynamic>;
    final plan = ledger['settlement'] as Map<String, dynamic>;
    String name(Object? id) =>
        participants[id]?['displayName'] as String? ?? '';

    return FutureBuilder(
      future: _events,
      builder: (context, snapshot) {
        final events = _rows(snapshot.data);
        final confirmed = {
          for (final event in events)
            if (event['kind'] == 'payment_confirm') event['reportId'],
        };
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          spacing: AppLayout.itemGap,
          children: [
            if (_failed)
              AppStateMessage.inline(
                icon: LucideIcons.circleAlert,
                title: l10n.commonSomethingWentWrong,
                actionLabel: l10n.commonRetry,
                onAction: () => unawaited(_send(_pending ?? {})),
              ),
            AppButton.secondary(
              onPressed: _busy || _pending != null
                  ? null
                  : () async {
                      final comment = await _value(
                        context,
                        title: l10n.financeBillSplitComment,
                        comment: true,
                      );
                      if (mounted && comment != null && comment.isNotEmpty) {
                        await _send({'kind': 'comment', 'comment': comment});
                      }
                    },
              child: Text(l10n.financeBillSplitComment),
            ),
            if (widget.split['finalized'] == true)
              for (final transfer in _rows(plan['transfers']))
                if (participants[transfer['from']]?['canReport'] == true)
                  AppGroupedCard(
                    children: [
                      AppRichRow(
                        title: l10n.financeBillSplitPays(
                          name(transfer['from']),
                          name(transfer['to']),
                        ),
                        trailing: AppButton.secondary(
                          onPressed: _busy || _pending != null
                              ? null
                              : () async {
                                  final amount = await _value(
                                    context,
                                    title: l10n.financeBillSplitAmount(code),
                                    comment: false,
                                  );
                                  if (!mounted || amount == null) return;
                                  final minor = billSplitMinorAmount(
                                    amount,
                                    digits,
                                  );
                                  if (minor == null ||
                                      minor >
                                          (transfer['amountMinor'] as num)) {
                                    return;
                                  }
                                  await _send({
                                    'kind': 'payment_report',
                                    'from': transfer['from'] as String,
                                    'to': transfer['to'] as String,
                                    'amountMinor': minor,
                                  });
                                },
                          child: Text(l10n.financeBillSplitPaid),
                        ),
                      ),
                    ],
                  ),
            if (snapshot.connectionState != ConnectionState.done)
              const AppSkeletonRows(),
            if (snapshot.hasError)
              AppStateMessage.inline(
                icon: LucideIcons.circleAlert,
                title: l10n.commonSomethingWentWrong,
                actionLabel: l10n.commonRetry,
                onAction: () => setState(() => _events = _read()),
              ),
            if (events.isNotEmpty)
              AppGroupedSection(
                caption: l10n.financeBillSplitActivity,
                children: [
                  for (final event in events)
                    if (event['kind'] == 'comment')
                      AppRichRow(title: event['comment'] as String)
                    else if (event['kind'] == 'payment_report')
                      AppRichRow(
                        title: l10n.financeBillSplitPays(
                          name(event['from']),
                          name(event['to']),
                        ),
                        subtitle: confirmed.contains(event['id'])
                            ? l10n.financeBillSplitConfirmed
                            : l10n.financeBillSplitPending,
                        trailing:
                            participants[event['to']]?['canConfirm'] == true &&
                                !confirmed.contains(event['id'])
                            ? AppButton.secondary(
                                onPressed: _busy || _pending != null
                                    ? null
                                    : () => _send({
                                        'kind': 'payment_confirm',
                                        'reportId': event['id'] as String,
                                      }),
                                child: Text(l10n.financeBillSplitConfirm),
                              )
                            : FinanceAmountText(
                                (event['amountMinor'] as num) /
                                    math.pow(10, digits),
                                code,
                              ),
                      ),
                ],
              ),
          ],
        );
      },
    );
  }
}

Iterable<Map<String, dynamic>> _rows(Object? value) =>
    value is List<Object?> ? value.whereType<Map<String, dynamic>>() : const [];
