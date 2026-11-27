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
    this.isReviewCurrent,
    this.onUncertain,
    super.key,
  });

  final ContactSectionRecord record;
  final ContactApprovalDetails approval;
  final Future<void> Function(ContactApprovalDecision, String?)? onReview;

  /// Resolves the originating workspace, actor and permission at submit time.
  final bool Function()? isReviewCurrent;
  final Future<void> Function()? onUncertain;

  @override
  State<ContactApprovalPreview> createState() => _ContactApprovalPreviewState();
}

enum _ReviewFailure { feedbackRequired, uncertain, unavailable, other }

class _ContactApprovalPreviewState extends State<ContactApprovalPreview> {
  static const _reasonLimit = 512;
  String _reason = '';
  bool _rejecting = false;
  bool _saving = false;
  bool _confirming = false;
  bool _reviewed = false;
  _ReviewFailure? _failure;

  bool get _canReview =>
      !_reviewed &&
      _failure != _ReviewFailure.uncertain &&
      _failure != _ReviewFailure.unavailable &&
      widget.onReview != null &&
      (widget.isReviewCurrent?.call() ?? true);

  Future<void> _submit(ContactApprovalDecision decision) async {
    if (!_canReview || _saving || _confirming) return;
    final original = widget;
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
      if (!_canReview ||
          !identical(original.record, widget.record) ||
          !identical(original.approval, widget.approval) ||
          !(original.isReviewCurrent?.call() ?? true)) {
        setState(() {});
        return;
      }
    }
    setState(() {
      _saving = true;
      _failure = null;
    });
    try {
      await widget.onReview!(decision, rejecting ? reason : null);
      if (!mounted) return;
      _reviewed = true;
      if (ModalRoute.of(context)?.isCurrent == true) {
        Navigator.of(context).pop();
      }
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _failure = switch (error) {
          ApiMutationScopeChanged() => _ReviewFailure.unavailable,
          ApiMutationNotDispatched() => _ReviewFailure.other,
          ApiException(failureKind: ApiFailureKind.transport) =>
            _ReviewFailure.uncertain,
          ApiException(statusCode: >= 500) => _ReviewFailure.uncertain,
          ApiException(statusCode: 401 || 403 || 404 || 409) =>
            _ReviewFailure.unavailable,
          ApiException(statusCode: 422)
              when !rejecting &&
                  original.approval.kind == ContactApprovalKind.reports =>
            _ReviewFailure.feedbackRequired,
          _ => _ReviewFailure.other,
        };
      });
    } on Object {
      if (mounted) setState(() => _failure = _ReviewFailure.uncertain);
    } finally {
      if (_failure == _ReviewFailure.uncertain) {
        await original.onUncertain?.call();
      }
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
      actions: !_canReview
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
          if (_rejecting && _canReview)
            AppTextField(
              key: const ValueKey('approval-rejection-reason'),
              label: l10n.contactsApprovalReason,
              placeholder: l10n.inputPlaceholderRejectionReason,
              minLines: 2,
              maxLines: 4,
              maxLength: _reasonLimit,
              enabled: !_saving,
              onChanged: (reason) => setState(() => _reason = reason),
            ),
          if (_failure case final failure?)
            AppStateMessage(
              icon: LucideIcons.circleAlert,
              title: switch (failure) {
                _ReviewFailure.feedbackRequired =>
                  l10n.contactsApprovalFeedbackRequired,
                _ReviewFailure.uncertain => l10n.offlineChangesReview,
                _ => l10n.commonSomethingWentWrong,
              },
            ),
        ],
      ),
    );
  }
}
