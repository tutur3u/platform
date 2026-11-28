import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/report/mira_response_report.dart';
import 'package:mobile/l10n/l10n.dart';

/// Opens "Report this response" for one saved Mira reply. Resolves true
/// once the server accepted the report.
Future<bool> showMiraResponseReportSheet(
  BuildContext context, {
  required AssistantReplyReportTarget target,
  required MiraResponseReportRepository repository,
}) async {
  final sent = await showAppSheet<bool>(
    context: context,
    size: AppSheetSize.large,
    builder: (_) =>
        MiraResponseReportSheet(target: target, repository: repository),
  );
  return sent ?? false;
}

class MiraResponseReportSheet extends StatefulWidget {
  const MiraResponseReportSheet({
    required this.target,
    required this.repository,
    super.key,
  });

  final AssistantReplyReportTarget target;
  final MiraResponseReportRepository repository;

  @override
  State<MiraResponseReportSheet> createState() =>
      _MiraResponseReportSheetState();
}

class _MiraResponseReportSheetState extends State<MiraResponseReportSheet> {
  final _details = TextEditingController();
  MiraResponseReportReason? _reason;
  bool _sending = false;
  String? _error;

  @override
  void dispose() {
    _details.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final reason = _reason;
    if (reason == null || _sending) return;
    final l10n = context.l10n;
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      await widget.repository.submit(
        wsId: widget.target.wsId,
        conversationId: widget.target.conversationId,
        messageId: widget.target.messageId,
        reason: reason,
        details: _details.text,
      );
      if (mounted) Navigator.of(context).pop(true);
    } on Object catch (error) {
      if (!mounted) return;
      setState(() {
        _sending = false;
        _error = error is ApiException && error.statusCode == 429
            ? l10n.miraReportRateLimited
            : l10n.miraReportFailed;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final error = _error;
    return AppSheetScaffold(
      key: const ValueKey('mira-report-sheet'),
      title: l10n.miraReportTitle,
      description: l10n.miraReportDescription,
      icon: LucideIcons.flag,
      actions: [
        SizedBox(
          width: double.infinity,
          child: AppButton.primary(
            key: const ValueKey('mira-report-send'),
            loading: _sending,
            onPressed: _reason == null ? null : () => unawaited(_send()),
            child: Text(l10n.miraReportSend),
          ),
        ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final reason in MiraResponseReportReason.values)
            AppOptionTile(
              key: ValueKey('mira-report-reason-${reason.name}'),
              title: reason.label(l10n),
              selected: _reason == reason,
              onTap: _sending ? null : () => setState(() => _reason = reason),
            ),
          const SizedBox(height: AppSpacing.md),
          AppTextField(
            key: const ValueKey('mira-report-details'),
            controller: _details,
            label: l10n.miraReportDetailsLabel,
            placeholder: l10n.miraReportDetailsPlaceholder,
            minLines: 3,
            maxLines: 6,
            maxLength: MiraResponseReportRepository.maxDetailsLength,
            enabled: !_sending,
            textCapitalization: TextCapitalization.sentences,
          ),
          if (error != null) ...[
            const SizedBox(height: AppSpacing.md),
            AppAlert.destructive(
              key: const ValueKey('mira-report-error'),
              content: Text(error),
            ),
          ],
          const SizedBox(height: AppSpacing.md),
        ],
      ),
    );
  }
}
