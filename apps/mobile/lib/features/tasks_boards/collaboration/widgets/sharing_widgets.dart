import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/tasks_boards/collaboration/models/task_sharing_models.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:share_plus/share_plus.dart';

/// Hands [url] to the system share sheet, anchored to [context]'s widget on
/// tablets.
Future<void> shareLinkNatively(
  BuildContext context,
  String url, {
  String? subject,
}) async {
  try {
    final box = context.findRenderObject() as RenderBox?;
    await SharePlus.instance.share(
      ShareParams(
        text: url,
        subject: subject,
        sharePositionOrigin: box == null
            ? null
            : box.localToGlobal(Offset.zero) & box.size,
      ),
    );
  } on Object {
    if (!context.mounted) return;
    showAppToast(
      context,
      message: context.l10n.commonSomethingWentWrong,
      variant: AppAlertVariant.destructive,
    );
  }
}

Future<void> copyShareLink(
  BuildContext context,
  String url, {
  required String copiedMessage,
}) async {
  await Clipboard.setData(ClipboardData(text: url));
  if (context.mounted) showAppToast(context, message: copiedMessage);
}

/// The link's actions: the system share sheet first, then copy.
class ShareLinkActions extends StatelessWidget {
  const ShareLinkActions({
    required this.url,
    required this.copiedMessage,
    required this.enabled,
    this.subject,
    super.key,
  });

  final String url;
  final String copiedMessage;
  final bool enabled;
  final String? subject;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Row(
      spacing: AppSpacing.sm,
      children: [
        Expanded(
          child: Builder(
            builder: (anchor) => AppButton.primary(
              key: const ValueKey('share-link-native'),
              onPressed: enabled
                  ? () => unawaited(
                      shareLinkNatively(anchor, url, subject: subject),
                    )
                  : null,
              leading: const Icon(LucideIcons.share2, size: 16),
              child: Text(l10n.taskShareShareLink),
            ),
          ),
        ),
        Expanded(
          child: AppButton.outline(
            key: const ValueKey('share-link-copy'),
            onPressed: enabled
                ? () => unawaited(
                    copyShareLink(context, url, copiedMessage: copiedMessage),
                  )
                : null,
            leading: const Icon(LucideIcons.copy, size: 16),
            child: Text(l10n.taskShareCopyLink),
          ),
        ),
      ],
    );
  }
}

/// An email field and its invite button.
class ShareInviteField extends StatefulWidget {
  const ShareInviteField({
    required this.placeholder,
    required this.enabled,
    required this.busy,
    required this.onInvite,
    this.trailing,
    super.key,
  });

  final String placeholder;
  final bool enabled;
  final bool busy;

  /// Resolves true when the invite saved, which clears the field.
  final Future<bool> Function(String email) onInvite;

  /// Shown between the field and the button, such as a permission choice.
  final Widget? trailing;

  @override
  State<ShareInviteField> createState() => _ShareInviteFieldState();
}

class _ShareInviteFieldState extends State<ShareInviteField> {
  final _email = TextEditingController();

  @override
  void initState() {
    super.initState();
    _email.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  Future<void> _invite() async {
    final saved = await widget.onInvite(_email.text);
    if (saved && mounted) _email.clear();
  }

  @override
  Widget build(BuildContext context) {
    final ready =
        widget.enabled && !widget.busy && _email.text.trim().isNotEmpty;
    return Row(
      spacing: AppSpacing.xs,
      children: [
        Expanded(
          child: AppTextField(
            key: const ValueKey('share-invite-email'),
            controller: _email,
            placeholder: widget.placeholder,
            enabled: widget.enabled && !widget.busy,
            keyboardType: TextInputType.emailAddress,
            textInputAction: TextInputAction.done,
            autocorrect: false,
            onSubmitted: ready ? (_) => unawaited(_invite()) : null,
          ),
        ),
        ?widget.trailing,
        AppIconButton(
          key: const ValueKey('share-invite-add'),
          variant: AppButtonVariant.primary,
          tooltip: context.l10n.taskShareAddPeople,
          icon: const Icon(LucideIcons.userPlus, size: 18),
          onPressed: ready ? () => unawaited(_invite()) : null,
        ),
      ],
    );
  }
}

/// People a task or board is shared with: each permission opens a choice,
/// and each person can be removed.
class ShareGrantList extends StatelessWidget {
  const ShareGrantList({
    required this.shares,
    required this.enabled,
    required this.viewLabel,
    required this.editLabel,
    required this.onPermission,
    required this.onRemove,
    super.key,
  });

  final List<ShareGrant> shares;
  final bool enabled;
  final String viewLabel;
  final String editLabel;
  final void Function(ShareGrant share, SharePermission permission)
  onPermission;
  final ValueChanged<ShareGrant> onRemove;

  Future<void> _choose(BuildContext context, ShareGrant share) async {
    final picked = await showAppSelectSheet<SharePermission>(
      context: context,
      title: share.label,
      value: share.permission,
      options: [
        AppSelectOption(value: SharePermission.view, label: viewLabel),
        AppSelectOption(value: SharePermission.edit, label: editLabel),
      ],
    );
    if (picked == null || picked.value == share.permission) return;
    onPermission(share, picked.value);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppGroupedCard(
      children: [
        for (final share in shares)
          AppGroupedRow(
            key: ValueKey('share-grant-${share.id}'),
            leading: AppIconTile(
              icon: share.isEmailInvite ? LucideIcons.mail : LucideIcons.user,
            ),
            title: Text(
              share.label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            trailing: Row(
              mainAxisSize: MainAxisSize.min,
              spacing: AppSpacing.xs,
              children: [
                AppButton.outline(
                  key: ValueKey('share-grant-permission-${share.id}'),
                  size: AppButtonSize.small,
                  onPressed: enabled
                      ? () => unawaited(_choose(context, share))
                      : null,
                  trailing: const Icon(LucideIcons.chevronDown, size: 14),
                  child: Text(
                    share.permission == SharePermission.edit
                        ? editLabel
                        : viewLabel,
                  ),
                ),
                AppIconButton(
                  key: ValueKey('share-grant-remove-${share.id}'),
                  tooltip: l10n.taskShareRemove,
                  icon: const Icon(LucideIcons.x, size: 16),
                  onPressed: enabled ? () => onRemove(share) : null,
                ),
              ],
            ),
          ),
      ],
    );
  }
}
