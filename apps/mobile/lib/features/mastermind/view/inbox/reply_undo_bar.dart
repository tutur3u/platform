import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/tokens/app_interface_tokens.dart';
import 'package:mobile/features/mastermind/view/widgets/large_text.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_group.dart';
import 'package:mobile/l10n/l10n.dart';

/// "Sending · Undo": shown for the few seconds between tapping an option and
/// the reply being queued. Announced when it appears, with a 44 pt Undo.
class ReplyUndoBar extends StatelessWidget {
  const ReplyUndoBar({required this.option, required this.onUndo, super.key});

  final String option;
  final VoidCallback? onUndo;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final undo = onUndo == null
        ? null
        : TextButton(
            style: TextButton.styleFrom(
              minimumSize: const Size(
                AppInterfaceTokens.minTouchTarget,
                AppInterfaceTokens.minTouchTarget,
              ),
            ),
            onPressed: onUndo,
            child: Text(l10n.mastermindReplyUndo),
          );
    // Large text: Undo moves under the label so a long label never clips it.
    final large = mastermindLargeText(context);
    return MastermindGroup(
      children: [
        AppGroupedRow(
          leading: const AppIconTile(icon: LucideIcons.hourglass),
          title: Semantics(
            liveRegion: true,
            child: Text(l10n.mastermindReplySendingOption(option)),
          ),
          subtitle: large && undo != null
              ? Align(alignment: AlignmentDirectional.centerStart, child: undo)
              : null,
          trailing: large ? null : undo,
        ),
      ],
    );
  }
}

/// One sticky bar for every reply still inside its 30 s undo window: how many,
/// a live countdown to the earliest send, and a single Undo-all. Hidden when
/// nothing is held. [now] is the cubit clock so tests control time.
class MastermindUndoAllBar extends StatefulWidget {
  const MastermindUndoAllBar({
    required this.count,
    required this.expiresAt,
    required this.now,
    required this.onUndoAll,
    super.key,
  });

  final int count;
  final DateTime? expiresAt;
  final DateTime Function() now;
  final VoidCallback onUndoAll;

  @override
  State<MastermindUndoAllBar> createState() => _MastermindUndoAllBarState();
}

class _MastermindUndoAllBarState extends State<MastermindUndoAllBar> {
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
    _ticker = Timer.periodic(
      const Duration(seconds: 1),
      (_) => mounted ? setState(() {}) : null,
    );
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  /// Whole seconds left, rounded up so 0:00 never shows while still undoable.
  int get _secondsLeft {
    final until = widget.expiresAt;
    if (until == null) return 0;
    final ms = until.difference(widget.now()).inMilliseconds;
    return ms <= 0 ? 0 : (ms + 999) ~/ 1000;
  }

  @override
  Widget build(BuildContext context) {
    if (widget.count == 0 || _secondsLeft == 0) return const SizedBox.shrink();
    final l10n = context.l10n;
    final left = _secondsLeft;
    final clock = '${left ~/ 60}:${(left % 60).toString().padLeft(2, '0')}';
    return MastermindGroup(
      children: [
        AppGroupedRow(
          leading: const AppIconTile(icon: LucideIcons.hourglass),
          title: Semantics(
            liveRegion: true,
            child: Text('${widget.count} · $clock'),
          ),
          trailing: TextButton(
            style: TextButton.styleFrom(
              minimumSize: const Size(
                AppInterfaceTokens.minTouchTarget,
                AppInterfaceTokens.minTouchTarget,
              ),
            ),
            onPressed: widget.onUndoAll,
            child: Text('${l10n.mastermindReplyUndo} (${widget.count})'),
          ),
        ),
      ],
    );
  }
}
