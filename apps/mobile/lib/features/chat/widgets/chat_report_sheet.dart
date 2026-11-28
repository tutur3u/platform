import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/chat/cubit/chat_cubit.dart';
import 'package:mobile/features/chat/models/chat_models.dart';
import 'package:mobile/l10n/l10n.dart';

/// Opens the report sheet for [subject], or for [message] when given (its
/// sender is [subject]). With [offerBlock] the sheet offers to block them
/// too, checked by default. A sent report ends with a toast.
Future<void> showChatReportSheet(
  BuildContext context, {
  required ChatCubit cubit,
  required ChatUserProfile subject,
  ChatMessage? message,
  bool offerBlock = true,
}) async {
  final sentLabel = context.l10n.chatSafetyReportSent;
  final sent = await showAppSheet<bool>(
    context: context,
    useRootNavigator: true,
    size: AppSheetSize.large,
    builder: (_) => ChatReportSheet(
      cubit: cubit,
      subject: subject,
      message: message,
      offerBlock: offerBlock,
    ),
  );
  if (sent == true && context.mounted) {
    showAppToast(context, message: sentLabel, variant: AppAlertVariant.success);
  }
}

/// Localized label for a report [reason].
String chatReportReasonLabel(BuildContext context, ChatReportReason reason) {
  final l10n = context.l10n;
  return switch (reason) {
    ChatReportReason.spam => l10n.chatSafetyReasonSpam,
    ChatReportReason.harassment => l10n.chatSafetyReasonHarassment,
    ChatReportReason.hate => l10n.chatSafetyReasonHate,
    ChatReportReason.sexual => l10n.chatSafetyReasonSexual,
    ChatReportReason.violence => l10n.chatSafetyReasonViolence,
    ChatReportReason.impersonation => l10n.chatSafetyReasonImpersonation,
    ChatReportReason.other => l10n.chatSafetyReasonOther,
  };
}

class ChatReportSheet extends StatefulWidget {
  const ChatReportSheet({
    required this.cubit,
    required this.subject,
    this.message,
    this.offerBlock = true,
    super.key,
  });

  final ChatCubit cubit;
  final ChatUserProfile subject;
  final ChatMessage? message;
  final bool offerBlock;

  @override
  State<ChatReportSheet> createState() => _ChatReportSheetState();
}

class _ChatReportSheetState extends State<ChatReportSheet> {
  final TextEditingController _details = TextEditingController();
  ChatReportReason? _reason;
  late bool _alsoBlock = widget.offerBlock;
  bool _sending = false;
  String? _error;

  @override
  void dispose() {
    _details.dispose();
    super.dispose();
  }

  ChatReportDraft _draft(ChatReportReason reason) {
    final message = widget.message;
    final alsoBlock = widget.offerBlock && _alsoBlock;
    return message == null
        ? ChatReportDraft.user(
            reportedUserId: widget.subject.id,
            reason: reason,
            details: _details.text,
            alsoBlock: alsoBlock,
          )
        : ChatReportDraft.message(
            conversationId: message.conversationId,
            messageId: message.id,
            reason: reason,
            details: _details.text,
            alsoBlock: alsoBlock,
          );
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
      await widget.cubit.submitReport(_draft(reason), subject: widget.subject);
      if (mounted) Navigator.of(context).pop(true);
    } on Object catch (error) {
      if (!mounted) return;
      setState(() {
        _sending = false;
        _error = error is ApiException && error.statusCode == 429
            ? l10n.chatSafetyReportRateLimited
            : l10n.chatSafetyReportFailed;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final name = widget.subject.displayName;
    final error = _error;
    return AppSheetScaffold(
      title: widget.message == null
          ? l10n.chatSafetyReportUser(name)
          : l10n.chatSafetyReportMessage,
      description: l10n.chatSafetyReportDescription(name),
      icon: LucideIcons.flag,
      actions: [
        SizedBox(
          width: double.infinity,
          child: AppButton.primary(
            key: const ValueKey('chat-report-send'),
            loading: _sending,
            onPressed: _reason == null ? null : () => unawaited(_send()),
            child: Text(l10n.chatSafetySendReport),
          ),
        ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            l10n.chatSafetyReasonLabel,
            style: tokens.typography.label.copyWith(
              color: tokens.colorScheme.mutedForeground,
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          for (final reason in ChatReportReason.values)
            AppOptionTile(
              key: ValueKey('chat-report-reason-${reason.name}'),
              title: chatReportReasonLabel(context, reason),
              selected: _reason == reason,
              onTap: _sending ? null : () => setState(() => _reason = reason),
            ),
          const SizedBox(height: AppSpacing.md),
          AppTextField(
            key: const ValueKey('chat-report-details'),
            controller: _details,
            label: l10n.chatSafetyDetailsLabel,
            placeholder: l10n.chatSafetyDetailsPlaceholder,
            minLines: 3,
            maxLines: 6,
            maxLength: ChatReportDraft.maxDetailsLength,
            enabled: !_sending,
            textCapitalization: TextCapitalization.sentences,
          ),
          if (widget.offerBlock) ...[
            const SizedBox(height: AppSpacing.sm),
            AppCheckboxRow(
              key: const ValueKey('chat-report-also-block'),
              value: _alsoBlock,
              onChanged: _sending
                  ? null
                  : (value) => setState(() => _alsoBlock = value ?? false),
              title: Text(l10n.chatSafetyAlsoBlock(name)),
            ),
          ],
          if (error != null) ...[
            const SizedBox(height: AppSpacing.md),
            AppAlert.destructive(content: Text(error)),
          ],
        ],
      ),
    );
  }
}
