import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/chat/widgets/chat_blocked_people_sheet.dart';
import 'package:mobile/features/settings/view/settings_widgets.dart';
import 'package:mobile/l10n/l10n.dart';

/// Settings > Privacy row that opens the people blocked in chat.
class BlockedPeopleSettingsTile extends StatelessWidget {
  const BlockedPeopleSettingsTile({required this.workspaceId, super.key});

  final String workspaceId;

  @override
  Widget build(BuildContext context) => SettingsTile(
    key: const ValueKey('settings-blocked-people-row'),
    grouped: true,
    icon: LucideIcons.ban,
    title: context.l10n.chatSafetyBlockedPeople,
    onTap: () =>
        unawaited(showChatBlockedPeopleSheet(context, wsId: workspaceId)),
  );
}
