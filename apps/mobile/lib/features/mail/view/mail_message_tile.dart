import 'dart:async';

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:mobile/core/interaction/app_haptics.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/mail/view/mail_message_date.dart';
import 'package:mobile/features/mail/view/mail_row_parts.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/pending_sync_frame.dart';

/// One conversation or message in the Mail list, laid out like web Mail's
/// rows: avatar, sender and date; subject; snippet; then label badges.
class MailMessageTile extends StatelessWidget {
  const MailMessageTile({
    required this.item,
    required this.thread,
    required this.selected,
    required this.onTap,
    required this.onSelect,
    required this.workspaceId,
    this.folder,
    this.active = false,
    this.desktop = false,
    this.keyboardActive = false,
    this.onPressStart,
    this.now,
    super.key,
  });
  final Map<String, dynamic> item;
  final bool thread;
  final bool selected;
  final VoidCallback onTap;
  final VoidCallback onSelect;
  final String workspaceId;

  /// The folder on screen; its own system label is not repeated as a badge.
  final String? folder;

  /// Fires once a press holds still briefly, ahead of [onTap], so the body
  /// can start loading. A press that turns into a scroll never fires it.
  final VoidCallback? onPressStart;

  /// The conversation open in a split layout's detail pane.
  final bool active;
  final bool desktop;
  final bool keyboardActive;

  /// The clock the date is formatted against; the current time when null.
  final DateTime? now;

  static const radius = BorderRadius.all(Radius.circular(8));

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final colors = tokens.colorScheme;
    final l10n = context.l10n;
    final unread =
        item['unread'] == true || (item['unreadCount'] as int? ?? 0) > 0;
    final participants = thread
        ? mailRows(item['participants'])
        : const <Map<String, dynamic>>[];
    final first = participants.firstOrNull ?? const <String, dynamic>{};
    final address =
        (thread ? first['address'] : item['fromAddress']) as String? ?? '';
    final name = (thread ? first['displayName'] : item['fromName']) as String?;
    final senderName = name?.trim().isNotEmpty == true
        ? name!.trim()
        : address.isNotEmpty
        ? address
        : l10n.mailUnknownSender;
    final extraParticipants = participants.length > 1
        ? participants.length - 1
        : 0;
    final messageCount = item['messageCount'] as int? ?? 0;
    final subject = item['subject'] as String?;
    final date = mailMessageDate(item, thread: thread);
    final labels = visibleMailLabels(mailRows(item['labels']), folder);
    final delivery = item['deliveryRecipient'] as String?;
    final snippet =
        (item[thread ? 'latestSnippet' : 'snippet'] as String?) ?? '';
    final text = unread ? colors.foreground : colors.mutedForeground;
    final weight = unread ? FontWeight.w600 : FontWeight.w400;
    final ui = tokens.typography.ui.copyWith(height: 1.35);
    final primarySize = desktop ? 14.0 : 15.0;
    final secondarySize = desktop ? 12.0 : 13.0;
    final locale = Localizations.localeOf(context).toLanguageTag();
    final use24Hour = MediaQuery.alwaysUse24HourFormatOf(context);
    final fill = active || keyboardActive
        ? colors.accent
        : selected
        ? colors.accent.withValues(alpha: 0.8)
        : colors.accent.withValues(alpha: 0);

    final leading = !desktop && selected
        ? SizedBox.square(
            dimension: 24,
            child: Icon(Icons.check_circle, size: 22, color: colors.primary),
          )
        : MailParticipantAvatar(address: address, name: name);

    final header = Row(
      children: [
        leading,
        const SizedBox(width: AppSpacing.sm),
        if (unread) ...[
          Semantics(
            label: l10n.mailFilterUnread,
            child: MailDot(color: colors.foreground),
          ),
          const SizedBox(width: AppSpacing.sm),
        ],
        Expanded(
          child: Text.rich(
            TextSpan(
              text: senderName,
              children: [
                if (extraParticipants > 0)
                  TextSpan(text: ' +$extraParticipants'),
              ],
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: ui.copyWith(
              fontSize: primarySize,
              color: text,
              fontWeight: weight,
            ),
          ),
        ),
        if (messageCount > 1) ...[
          const SizedBox(width: AppSpacing.sm),
          Semantics(
            label: l10n.mailMessageCount(messageCount),
            child: ExcludeSemantics(
              child: Text(
                '$messageCount',
                style: ui.copyWith(
                  fontSize: 12,
                  color: colors.mutedForeground,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
            ),
          ),
        ],
        if (date != null) ...[
          const SizedBox(width: AppSpacing.sm),
          AppTooltip(
            message: formatMailThreadDateTitle(
              date,
              locale: locale,
              use24HourFormat: use24Hour,
            ),
            child: Text(
              formatMailThreadDate(
                date,
                locale: locale,
                use24HourFormat: use24Hour,
                now: now,
              ),
              key: const ValueKey('mail-row-date'),
              style: ui.copyWith(
                fontSize: 12,
                color: unread ? colors.foreground : colors.mutedForeground,
                fontWeight: unread ? FontWeight.w500 : FontWeight.w400,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
          ),
        ],
      ],
    );

    final subjectRow = Row(
      children: [
        Expanded(
          child: Text(
            subject?.isNotEmpty == true ? subject! : l10n.mailNoSubject,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: ui.copyWith(fontSize: 14, color: text, fontWeight: weight),
          ),
        ),
        if (item['hasAttachments'] == true) ...[
          const SizedBox(width: AppSpacing.sm),
          Icon(
            LucideIcons.paperclip,
            key: const ValueKey('mail-row-attachment'),
            size: 14,
            color: colors.mutedForeground,
          ),
        ],
        if (item['starred'] == true) ...[
          const SizedBox(width: AppSpacing.sm),
          Icon(
            LucideIcons.star,
            key: const ValueKey('mail-row-star'),
            size: 14,
            color: text,
          ),
        ],
      ],
    );

    final content = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        header,
        const SizedBox(height: AppSpacing.xs),
        subjectRow,
        const SizedBox(height: 2),
        Text(
          snippet,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: ui.copyWith(
            fontSize: secondarySize,
            color: colors.mutedForeground,
          ),
        ),
        if (delivery != null && delivery.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.xs),
          Text(
            '${l10n.mailTo}: $delivery',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: ui.copyWith(fontSize: 12, color: colors.mutedForeground),
          ),
        ],
        if (labels.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.sm),
          MailLabelBadges(labels: labels),
        ],
      ],
    );

    return PendingSyncFrame(
      workspaceId: workspaceId,
      entityId: item['id'] as String? ?? '',
      feature: 'mail',
      child: Semantics(
        selected: selected || active,
        child: Material(
          color: fill,
          borderRadius: radius,
          clipBehavior: Clip.antiAlias,
          child: _PressWarmup(
            onPressStart: onPressStart,
            child: InkWell(
              onTap: onTap,
              borderRadius: radius,
              hoverColor: colors.accent.withValues(alpha: 0.6),
              onLongPress: () {
                unawaited(AppHaptics.pickup());
                onSelect();
              },
              child: ConstrainedBox(
                constraints: const BoxConstraints(minHeight: 48),
                child: Padding(
                  padding: desktop
                      ? const EdgeInsets.fromLTRB(4, 10, 12, 10)
                      : const EdgeInsets.fromLTRB(12, 12, 12, 12),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (desktop) ...[
                        _SelectBox(selected: selected, onSelect: onSelect),
                        const SizedBox(width: AppSpacing.xs),
                      ],
                      Expanded(child: content),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// The desktop row's selection checkbox, beside the avatar as on web.
class _SelectBox extends StatelessWidget {
  const _SelectBox({required this.selected, required this.onSelect});

  final bool selected;
  final VoidCallback onSelect;

  @override
  Widget build(BuildContext context) {
    final colors = AppTokens.of(context).colorScheme;
    final label = context.l10n.mailKeyboardSelect;
    return AppTooltip(
      message: label,
      excludeFromSemantics: true,
      child: Semantics(
        button: true,
        checked: selected,
        label: label,
        child: InkWell(
          onTap: onSelect,
          customBorder: const CircleBorder(),
          child: SizedBox(
            width: 32,
            height: 24,
            child: Center(
              child: Icon(
                selected
                    ? Icons.check_box_outlined
                    : Icons.check_box_outline_blank,
                size: 16,
                color: selected ? colors.primary : colors.mutedForeground,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Calls [onPressStart] when a pointer stays within touch slop for
/// [holdDelay] or lifts before then; moving past the slop cancels it.
class _PressWarmup extends StatefulWidget {
  const _PressWarmup({required this.onPressStart, required this.child});

  static const holdDelay = Duration(milliseconds: 40);

  final VoidCallback? onPressStart;
  final Widget child;

  @override
  State<_PressWarmup> createState() => _PressWarmupState();
}

class _PressWarmupState extends State<_PressWarmup> {
  Timer? _timer;
  Offset? _origin;

  void _fire() {
    _timer?.cancel();
    _timer = null;
    if (_origin == null) return;
    _origin = null;
    widget.onPressStart?.call();
  }

  void _cancel() {
    _timer?.cancel();
    _timer = null;
    _origin = null;
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.onPressStart == null) return widget.child;
    return Listener(
      onPointerDown: (event) {
        _cancel();
        _origin = event.position;
        _timer = Timer(_PressWarmup.holdDelay, _fire);
      },
      onPointerMove: (event) {
        final origin = _origin;
        if (origin != null && (event.position - origin).distance > kTouchSlop) {
          _cancel();
        }
      },
      onPointerUp: (_) => _fire(),
      onPointerCancel: (_) => _cancel(),
      child: widget.child,
    );
  }
}
