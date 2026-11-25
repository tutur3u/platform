import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/l10n/l10n.dart';

enum MailKeyboardCommand {
  next,
  previous,
  open,
  archive,
  trash,
  reply,
  replyAll,
  forward,
  unread,
  star,
  compose,
  search,
  help,
  back,
  select,
  selectAll,
}

MailKeyboardCommand? mailKeyboardCommand(
  LogicalKeyboardKey key, {
  String? character,
  bool shift = false,
  bool control = false,
  bool meta = false,
  bool alt = false,
}) {
  if (control || meta || alt) return null;
  if (character == '?' ||
      (character == null && shift && key == LogicalKeyboardKey.slash)) {
    return MailKeyboardCommand.help;
  }
  if (character == '#' ||
      (character == null && shift && key == LogicalKeyboardKey.digit3)) {
    return MailKeyboardCommand.trash;
  }
  if (key == LogicalKeyboardKey.escape) return MailKeyboardCommand.back;
  if (character == '/') return MailKeyboardCommand.search;
  if (shift) {
    return switch (key) {
      LogicalKeyboardKey.keyU => MailKeyboardCommand.unread,
      LogicalKeyboardKey.keyX => MailKeyboardCommand.selectAll,
      _ => null,
    };
  }
  return switch (key) {
    LogicalKeyboardKey.keyJ => MailKeyboardCommand.next,
    LogicalKeyboardKey.keyK => MailKeyboardCommand.previous,
    LogicalKeyboardKey.enter ||
    LogicalKeyboardKey.numpadEnter ||
    LogicalKeyboardKey.keyO => MailKeyboardCommand.open,
    LogicalKeyboardKey.keyE => MailKeyboardCommand.archive,
    LogicalKeyboardKey.keyR => MailKeyboardCommand.reply,
    LogicalKeyboardKey.keyA => MailKeyboardCommand.replyAll,
    LogicalKeyboardKey.keyF => MailKeyboardCommand.forward,
    LogicalKeyboardKey.keyU => MailKeyboardCommand.unread,
    LogicalKeyboardKey.keyS => MailKeyboardCommand.star,
    LogicalKeyboardKey.keyC => MailKeyboardCommand.compose,
    LogicalKeyboardKey.slash => MailKeyboardCommand.search,
    LogicalKeyboardKey.keyX => MailKeyboardCommand.select,
    _ => null,
  };
}

Future<void> showMailKeyboardHelp(BuildContext context) => showAppSheet<void>(
  context: context,
  useRootNavigator: true,
  builder: (context) {
    final l10n = context.l10n;
    return AppSheetScaffold(
      title: l10n.mailKeyboardShortcuts,
      child: Column(
        children: [
          for (final (keys, label) in [
            ('J / K', l10n.mailKeyboardNavigate),
            ('Enter / O', l10n.commonOpen),
            ('E', l10n.mailArchive),
            ('#', l10n.commonDelete),
            ('R', l10n.mailReply),
            ('A', l10n.mailReplyAll),
            ('F', l10n.mailForward),
            ('U', l10n.mailMarkUnread),
            ('S', l10n.mailSwipeStar),
            ('X', l10n.mailKeyboardSelect),
            ('Shift + X', l10n.mailSelectAll),
            ('C', l10n.mailCompose),
            ('/', l10n.mailSearch),
            ('?', l10n.mailKeyboardShortcuts),
            ('Esc', l10n.mailKeyboardBack),
          ])
            ListTile(dense: true, title: Text(label), trailing: Text(keys)),
        ],
      ),
    );
  },
);
