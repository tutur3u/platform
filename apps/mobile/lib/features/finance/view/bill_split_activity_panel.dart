import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

import 'package:file_picker/file_picker.dart';
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

  Future<({String text, Map<String, String>? proof})?> _value(
    BuildContext context, {
    required String title,
    required bool comment,
  }) async {
    final controller = TextEditingController();
    Map<String, String>? proof;
    var reading = false;
    var rejected = false;
    try {
      return await showAppSheet<({String text, Map<String, String>? proof})>(
        context: context,
        builder: (_) => StatefulBuilder(
          builder: (context, update) => AppSheetScaffold(
            title: title,
            actions: [
              AppButton.primary(
                onPressed: reading
                    ? null
                    : () {
                        final value = (
                          text: controller.text.trim(),
                          proof: proof,
                        );
                        Navigator.of(context).pop(value);
                      },
                child: Text(context.l10n.commonSave),
              ),
            ],
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              spacing: AppLayout.itemGap,
              children: [
                AppTextField(
                  label: title,
                  controller: controller,
                  maxLength: comment ? 2000 : 24,
                  maxLines: comment ? 3 : 1,
                  keyboardType: comment
                      ? TextInputType.multiline
                      : const TextInputType.numberWithOptions(decimal: true),
                ),
                if (!comment)
                  AppButton.secondary(
                    onPressed: reading
                        ? null
                        : () async {
                            update(() {
                              reading = true;
                              rejected = false;
                            });
                            try {
                              final picked = await FilePicker.pickFiles();
                              final file = picked.firstOrNull;
                              if (file != null) {
                                final next = await _readProof(file);
                                if (context.mounted) {
                                  update(() {
                                    proof = next;
                                  });
                                }
                              }
                            } on Object {
                              if (context.mounted) {
                                update(() {
                                  rejected = true;
                                });
                              }
                            } finally {
                              if (context.mounted) {
                                update(() {
                                  reading = false;
                                });
                              }
                            }
                          },
                    child: Text(
                      proof == null
                          ? context.l10n.financeBillSplitAttachProof
                          : context.l10n.financeBillSplitProofAttached,
                    ),
                  ),
                if (rejected)
                  AppStateMessage.inline(
                    icon: LucideIcons.circleAlert,
                    title: context.l10n.financeBillSplitProofUnavailable,
                  ),
              ],
            ),
          ),
        ),
      );
    } finally {
      WidgetsBinding.instance.addPostFrameCallback((_) => controller.dispose());
    }
  }

  Future<void> _viewProof(String report) async {
    final encoded = Uri.encodeComponent(report);
    final labels = context.l10n;
    try {
      final bytes = await widget.api.getBytes(
        '${widget.path}/$encoded/proof',
        maxBytes: 262144,
      );
      if (!mounted) return;
      await showAppSheet<void>(
        context: context,
        builder: (_) => AppSheetScaffold(
          title: labels.financeBillSplitViewProof,
          child: Image.memory(
            bytes,
            cacheWidth: 1024,
            errorBuilder: (context, _, _) =>
                Text(labels.financeBillSplitProofUnavailable),
          ),
        ),
      );
    } on Object {
      if (!mounted) return;
      await showAppSheet<void>(
        context: context,
        builder: (_) => AppSheetScaffold(
          title: labels.financeBillSplitViewProof,
          child: Text(labels.financeBillSplitProofUnavailable),
        ),
      );
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
                      if (mounted &&
                          comment != null &&
                          comment.text.isNotEmpty) {
                        await _send({
                          'kind': 'comment',
                          'comment': comment.text,
                        });
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
                                    amount.text,
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
                                    if (amount.proof case final proof?)
                                      'proof': proof,
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
                        onTap: event['hasProof'] == true
                            ? () => _viewProof(event['id'] as String)
                            : null,
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

Future<Map<String, String>> _readProof(PlatformFile file) async {
  final type = switch (file.name.split('.').last.toLowerCase()) {
    'png' => 'image/png',
    'jpg' || 'jpeg' => 'image/jpeg',
    'webp' => 'image/webp',
    _ => throw const FormatException('Unsupported proof format'),
  };
  final length = await file.length();
  if (length == 0 || length > 262144) {
    throw const FormatException('Invalid proof size');
  }
  final bytes = await file.readAsBytes();
  if (bytes.isEmpty || bytes.length > 262144) {
    throw const FormatException('Invalid proof size');
  }
  return {'contentType': type, 'base64': base64Encode(bytes)};
}
