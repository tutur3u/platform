import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/crm/utils/contact_sections.dart';
import 'package:mobile/l10n/l10n.dart';

class ContactApprovalPreview extends StatefulWidget {
  const ContactApprovalPreview({
    required this.record,
    required this.approval,
    required this.onReview,
    super.key,
  });

  final ContactSectionRecord record;
  final ContactApprovalDetails approval;
  final Future<void> Function(ContactApprovalDecision, String?)? onReview;

  @override
  State<ContactApprovalPreview> createState() => _ContactApprovalPreviewState();
}

class _ContactApprovalPreviewState extends State<ContactApprovalPreview> {
  static const _reasonLimit = 512;
  String _reason = '';
  bool _rejecting = false;
  bool _saving = false;
  bool _confirming = false;
  bool _feedbackRequired = false;
  bool _failed = false;

  Future<void> _submit(ContactApprovalDecision decision) async {
    final review = widget.onReview;
    if (review == null || _saving || _confirming) return;
    final reason = _reason.trim();
    final rejecting = decision == ContactApprovalDecision.reject;
    if (rejecting && (reason.isEmpty || reason.length > _reasonLimit)) return;
    if (!rejecting) {
      final l10n = context.l10n;
      _confirming = true;
      final confirmed = await showAppConfirmDialog(
        context: context,
        title: l10n.contactsApprovalApprove,
        message: l10n.contactsApprovalConfirm,
        confirmLabel: l10n.contactsApprovalApprove,
        cancelLabel: l10n.commonCancel,
      );
      _confirming = false;
      if (!mounted || !confirmed) return;
    }
    setState(() {
      _saving = true;
      _failed = false;
      _feedbackRequired = false;
    });
    try {
      await review(decision, rejecting ? reason : null);
      if (mounted && ModalRoute.of(context)?.isCurrent == true) {
        Navigator.of(context).pop();
      }
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _feedbackRequired = error.statusCode == 422;
        _failed = !_feedbackRequired;
      });
    } on Exception {
      if (mounted) setState(() => _failed = true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final approval = widget.approval;
    final isReport = approval.kind == ContactApprovalKind.reports;
    return AppSheetScaffold(
      title: widget.record.title,
      description: widget.record.subtitle,
      actions: widget.onReview == null
          ? const []
          : [
              if (_rejecting) ...[
                AppButton.outline(
                  onPressed: _saving
                      ? null
                      : () => setState(() {
                          _rejecting = false;
                          _reason = '';
                        }),
                  child: Text(l10n.commonCancel),
                ),
                AppButton.destructive(
                  onPressed:
                      _saving ||
                          _reason.trim().isEmpty ||
                          _reason.trim().length > _reasonLimit
                      ? null
                      : () => _submit(ContactApprovalDecision.reject),
                  child: Text(l10n.contactsApprovalReject),
                ),
              ] else ...[
                AppButton.outline(
                  onPressed: _saving
                      ? null
                      : () => setState(() => _rejecting = true),
                  child: Text(l10n.contactsApprovalReject),
                ),
                AppButton.primary(
                  onPressed: _saving
                      ? null
                      : () => _submit(ContactApprovalDecision.approve),
                  child: Text(l10n.contactsApprovalApprove),
                ),
              ],
            ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: AppSpacing.lg,
        children: [
          if (approval.group case final group?)
            AppPanel(
              child: AppKeyValueRow(label: l10n.contactsGroups, value: group),
            ),
          if (approval.content case final content?)
            AppPanel(
              title: l10n.contactsReportContent,
              child: SelectableText(content),
            ),
          if (approval.comment case final comment?)
            AppPanel(
              title: isReport ? l10n.crmFeedback : l10n.contactsApprovalNotes,
              child: SelectableText(comment),
            ),
          if (_rejecting)
            AppTextField(
              key: const ValueKey('approval-rejection-reason'),
              label: l10n.contactsApprovalReason,
              minLines: 2,
              maxLines: 4,
              maxLength: _reasonLimit,
              enabled: !_saving,
              onChanged: (reason) => setState(() => _reason = reason),
            ),
          if (_failed || _feedbackRequired)
            AppStateMessage(
              icon: LucideIcons.circleAlert,
              title: _feedbackRequired
                  ? l10n.contactsApprovalFeedbackRequired
                  : l10n.commonSomethingWentWrong,
            ),
        ],
      ),
    );
  }
}
