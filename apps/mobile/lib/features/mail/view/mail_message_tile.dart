import 'dart:async';

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:mobile/core/interaction/app_haptics.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/mail/view/mail_message_date.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/pending_sync_frame.dart';

class MailMessageTile extends StatelessWidget {
  const MailMessageTile({
    required this.item,
    required this.thread,
    required this.selected,
    required this.onTap,
    required this.onSelect,
    required this.workspaceId,
    this.active = false,
    this.onPressStart,
    super.key,
  });
  final Map<String, dynamic> item;
  final bool thread;
  final bool selected;
  final VoidCallback onTap;
  final VoidCallback onSelect;
  final String workspaceId;

  /// Fires once a press holds still briefly, ahead of [onTap], so the body
  /// can start loading. A press that turns into a scroll never fires it.
  final VoidCallback? onPressStart;

  /// The conversation open in a split layout's detail pane.
  final bool active;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tokens = AppTokens.of(context);
    final colors = tokens.colorScheme;
    final unread =
        item['unread'] == true || (item['unreadCount'] as int? ?? 0) > 0;
    final subject = item['subject'] as String?;
    final sender = thread
        ? mailRows(
            item['participants'],
          ).map((p) => p['displayName'] ?? p['address']).join(', ')
        : (item['fromName'] ?? item['fromAddress']) as String? ?? '';
    final date = mailMessageDate(item, thread: thread);
    final labels = mailRows(item['labels']);
    final delivery = item['deliveryRecipient'] as String?;
    final snippet =
        (item[thread ? 'latestSnippet' : 'snippet'] as String?) ?? '';
    final strong = colors.foreground;
    final muted = colors.mutedForeground;
    final body = theme.textTheme.bodyMedium;
    return PendingSyncFrame(
      workspaceId: workspaceId,
      entityId: item['id'] as String? ?? '',
      feature: 'mail',
      child: Semantics(
        selected: selected || active,
        child: Material(
          color: selected
              ? colors.primary.withValues(alpha: 0.08)
              : active
              ? colors.muted
              : Colors.transparent,
          child: _PressWarmup(
            onPressStart: onPressStart,
            child: InkWell(
              onTap: onTap,
              onLongPress: () {
                unawaited(AppHaptics.pickup());
                onSelect();
              },
              child: Padding(
                padding: const EdgeInsets.fromLTRB(10, 9, 16, 9),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SizedBox(
                      width: 16,
                      child: Padding(
                        padding: const EdgeInsets.only(top: 6),
                        child: selected
                            ? Icon(
                                Icons.check_circle,
                                size: 16,
                                color: colors.primary,
                              )
                            : unread
                            ? Center(
                                child: DecoratedBox(
                                  decoration: BoxDecoration(
                                    color: colors.info,
                                    shape: BoxShape.circle,
                                  ),
                                  child: const SizedBox.square(dimension: 8),
                                ),
                              )
                            : null,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  sender,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: body?.copyWith(
                                    fontSize: 15,
                                    height: 1.3,
                                    color: strong,
                                    fontWeight: unread
                                        ? FontWeight.w700
                                        : FontWeight.w500,
                                  ),
                                ),
                              ),
                              if (item['starred'] == true) ...[
                                const SizedBox(width: 4),
                                Icon(
                                  Icons.star_rounded,
                                  size: 14,
                                  color: colors.warning,
                                ),
                              ],
                              if (item['hasAttachments'] == true) ...[
                                const SizedBox(width: 4),
                                Icon(Icons.attach_file, size: 13, color: muted),
                              ],
                              if (date != null) ...[
                                const SizedBox(width: 8),
                                Text(
                                  formatMailMessageDate(
                                    context,
                                    date,
                                    compact: true,
                                  ),
                                  style: body?.copyWith(
                                    fontSize: 12,
                                    color: unread ? strong : muted,
                                    fontWeight: unread
                                        ? FontWeight.w600
                                        : FontWeight.w400,
                                  ),
                                ),
                              ],
                            ],
                          ),
                          const SizedBox(height: 1),
                          _SubjectBadgesRow(
                            subject: subject?.isNotEmpty == true
                                ? subject!
                                : context.l10n.mailNoSubject,
                            style: body?.copyWith(
                              fontSize: 14,
                              height: 1.3,
                              color: strong,
                              fontWeight: unread
                                  ? FontWeight.w600
                                  : FontWeight.w400,
                            ),
                            badges: [
                              for (final label in labels.take(2))
                                if (label['name'] case final String name) name,
                              if (delivery != null) delivery,
                            ],
                          ),
                          const SizedBox(height: 1),
                          Text(
                            snippet,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: body?.copyWith(
                              fontSize: 13,
                              height: 1.35,
                              color: muted,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Subject text followed by up to three badges that share a width budget so
/// narrow phones never overflow even at large text scales.
class _SubjectBadgesRow extends StatelessWidget {
  const _SubjectBadgesRow({
    required this.subject,
    required this.style,
    required this.badges,
  });

  final String subject;
  final TextStyle? style;
  final List<String> badges;

  @override
  Widget build(BuildContext context) {
    final subjectText = Text(
      subject,
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
      style: style,
    );
    if (badges.isEmpty) return subjectText;
    return LayoutBuilder(
      builder: (context, constraints) {
        final totalWidth = constraints.maxWidth.isFinite
            ? constraints.maxWidth
            : 272.0;
        final minSubjectWidth = (totalWidth * 0.38).clamp(0.0, totalWidth);
        final badgeBudget = (totalWidth - minSubjectWidth).clamp(
          0.0,
          totalWidth,
        );
        final marginTotal = 6.0 * badges.length;
        final perBadgeMax = ((badgeBudget - marginTotal) / badges.length).clamp(
          0.0,
          120.0,
        );
        return Row(
          children: [
            Flexible(child: subjectText),
            if (perBadgeMax >= 24.0)
              for (final text in badges) _RowBadge(text, maxWidth: perBadgeMax),
          ],
        );
      },
    );
  }
}

/// A small outlined label beside the subject.
class _RowBadge extends StatelessWidget {
  const _RowBadge(this.text, {this.maxWidth = 120});

  final String text;
  final double maxWidth;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    return Container(
      margin: const EdgeInsetsDirectional.only(start: 6),
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
      constraints: BoxConstraints(maxWidth: maxWidth),
      decoration: BoxDecoration(
        border: Border.all(color: tokens.colorScheme.border),
        borderRadius: BorderRadius.circular(5),
      ),
      child: Text(
        text,
        maxLines: 1,
        softWrap: false,
        overflow: TextOverflow.ellipsis,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
          fontSize: 10.5,
          color: tokens.colorScheme.mutedForeground,
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
