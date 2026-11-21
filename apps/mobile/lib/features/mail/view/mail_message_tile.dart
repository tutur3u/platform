import 'dart:async';

import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:mobile/core/interaction/app_haptics.dart';
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
    final colors = Theme.of(context).colorScheme;
    final unread =
        item['unread'] == true || (item['unreadCount'] as int? ?? 0) > 0;
    final subject = item['subject'] as String?;
    final sender = thread
        ? mailRows(
            item['participants'],
          ).map((p) => p['displayName'] ?? p['address']).join(', ')
        : (item['fromName'] ?? item['fromAddress']) as String? ?? '';
    final date = mailMessageDate(item, thread: thread);
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
              ? colors.secondaryContainer
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
                padding: const EdgeInsets.fromLTRB(12, 10, 16, 10),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SizedBox(
                      width: 20,
                      child: Padding(
                        padding: const EdgeInsets.only(top: 5),
                        child: selected
                            ? Icon(
                                Icons.check_circle,
                                size: 16,
                                color: colors.primary,
                              )
                            : Icon(
                                Icons.circle,
                                size: 7,
                                color: unread
                                    ? colors.primary
                                    : Colors.transparent,
                              ),
                      ),
                    ),
                    const SizedBox(width: 4),
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
                                  style: TextStyle(
                                    fontSize: 15,
                                    fontWeight: unread
                                        ? FontWeight.w700
                                        : FontWeight.w500,
                                  ),
                                ),
                              ),
                              if (date != null) ...[
                                const SizedBox(width: 8),
                                Text(
                                  formatMailMessageDate(
                                    context,
                                    date,
                                    compact: true,
                                  ),
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: colors.onSurfaceVariant,
                                  ),
                                ),
                              ],
                              if (item['starred'] == true) ...[
                                const SizedBox(width: 4),
                                Icon(
                                  Icons.star_rounded,
                                  size: 14,
                                  color: colors.primary,
                                ),
                              ],
                              if (item['hasAttachments'] == true) ...[
                                const SizedBox(width: 4),
                                Icon(
                                  Icons.attach_file,
                                  size: 13,
                                  color: colors.onSurfaceVariant,
                                ),
                              ],
                            ],
                          ),
                          const SizedBox(height: 3),
                          Text(
                            subject?.isNotEmpty == true
                                ? subject!
                                : context.l10n.mailNoSubject,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 15,
                              fontWeight: unread
                                  ? FontWeight.w600
                                  : FontWeight.w400,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            (item[thread ? 'latestSnippet' : 'snippet']
                                    as String?) ??
                                '',
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 14,
                              height: 1.35,
                              color: colors.onSurfaceVariant,
                            ),
                          ),
                          if (item['deliveryRecipient'] != null)
                            Text(
                              item['deliveryRecipient'] as String,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                fontSize: 12,
                                color: colors.onSurfaceVariant,
                              ),
                            ),
                          if (mailRows(item['labels']).isNotEmpty)
                            Text(
                              mailRows(
                                item['labels'],
                              ).map((label) => label['name']).join(' · '),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                fontSize: 12,
                                color: colors.primary,
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
