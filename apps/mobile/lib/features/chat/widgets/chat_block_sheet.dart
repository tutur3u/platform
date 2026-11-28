import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/chat/cubit/chat_cubit.dart';
import 'package:mobile/features/chat/models/chat_models.dart';
import 'package:mobile/features/chat/widgets/chat_report_sheet.dart';
import 'package:mobile/l10n/l10n.dart';

/// Asks to block [user] and explains what blocking does. A confirmed block
/// ends with a toast, then the report sheet when "Also report" was checked.
Future<void> showChatBlockSheet(
  BuildContext context, {
  required ChatCubit cubit,
  required ChatUserProfile user,
}) async {
  final blockedLabel = context.l10n.chatSafetyBlocked(user.displayName);
  final result = await showAppSheet<({bool alsoReport})>(
    context: context,
    useRootNavigator: true,
    builder: (_) => ChatBlockSheet(cubit: cubit, user: user),
  );
  if (result == null || !context.mounted) return;
  showAppToast(
    context,
    message: blockedLabel,
    variant: AppAlertVariant.success,
  );
  if (result.alsoReport) {
    await showChatReportSheet(
      context,
      cubit: cubit,
      subject: user,
      offerBlock: false,
    );
  }
}

class ChatBlockSheet extends StatefulWidget {
  const ChatBlockSheet({required this.cubit, required this.user, super.key});

  final ChatCubit cubit;
  final ChatUserProfile user;

  @override
  State<ChatBlockSheet> createState() => _ChatBlockSheetState();
}

class _ChatBlockSheetState extends State<ChatBlockSheet> {
  bool _alsoReport = false;
  bool _blocking = false;
  String? _error;

  Future<void> _block() async {
    if (_blocking) return;
    final failed = context.l10n.chatSafetyBlockFailed;
    setState(() {
      _blocking = true;
      _error = null;
    });
    try {
      await widget.cubit.blockUser(widget.user);
      if (mounted) Navigator.of(context).pop((alsoReport: _alsoReport));
    } on Object {
      if (!mounted) return;
      setState(() {
        _blocking = false;
        _error = failed;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final name = widget.user.displayName;
    final error = _error;
    return AppSheetScaffold(
      title: l10n.chatSafetyBlockTitle(name),
      icon: LucideIcons.ban,
      actions: [
        SizedBox(
          width: double.infinity,
          child: AppButton.destructive(
            key: const ValueKey('chat-block-confirm'),
            loading: _blocking,
            onPressed: () => unawaited(_block()),
            child: Text(l10n.chatSafetyBlock),
          ),
        ),
        SizedBox(
          width: double.infinity,
          child: AppButton.ghost(
            onPressed: _blocking ? null : () => Navigator.of(context).pop(),
            child: Text(l10n.commonCancel),
          ),
        ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _Bullet(
            icon: LucideIcons.messageSquareOff,
            text: l10n.chatSafetyBlockNoMessages,
          ),
          _Bullet(icon: LucideIcons.eyeOff, text: l10n.chatSafetyBlockHidden),
          _Bullet(icon: LucideIcons.userX, text: l10n.chatSafetyBlockUnfriend),
          _Bullet(icon: LucideIcons.settings, text: l10n.chatSafetyBlockUndo),
          const SizedBox(height: AppSpacing.sm),
          AppCheckboxRow(
            key: const ValueKey('chat-block-also-report'),
            value: _alsoReport,
            onChanged: _blocking
                ? null
                : (value) => setState(() => _alsoReport = value ?? false),
            title: Text(l10n.chatSafetyAlsoReport(name)),
          ),
          if (error != null) ...[
            const SizedBox(height: AppSpacing.md),
            AppAlert.destructive(content: Text(error)),
          ],
        ],
      ),
    );
  }
}

class _Bullet extends StatelessWidget {
  const _Bullet({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: tokens.colorScheme.mutedForeground),
          const SizedBox(width: AppSpacing.md),
          Expanded(child: Text(text, style: tokens.typography.small)),
        ],
      ),
    );
  }
}
