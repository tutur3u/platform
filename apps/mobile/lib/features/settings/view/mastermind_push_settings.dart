import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/repositories/notification_push_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/notifications/push/mastermind_push_category.dart';
import 'package:mobile/features/settings/view/settings_widgets.dart';
import 'package:mobile/l10n/l10n.dart';

class MastermindPushSettings extends StatefulWidget {
  const MastermindPushSettings({required this.userId, super.key});

  final String userId;

  @override
  State<MastermindPushSettings> createState() => _MastermindPushSettingsState();
}

class _MastermindPushSettingsState extends State<MastermindPushSettings> {
  final _repository = NotificationPushRepository();
  Map<String, bool>? _preferences;
  bool _loadFailed = false;
  MastermindPushCategory? _saving;
  MastermindPushCategory? _saveFailed;

  bool get _isCurrent =>
      mounted && context.read<AuthCubit?>()?.state.user?.id == widget.userId;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  @override
  void dispose() {
    _repository.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    if (!_isCurrent) return;
    setState(() => _loadFailed = false);
    try {
      final preferences = await _repository.getAccountPreferences();
      if (_isCurrent) setState(() => _preferences = preferences);
    } on Exception {
      if (_isCurrent) setState(() => _loadFailed = true);
    }
  }

  Future<void> _change(MastermindPushCategory category, bool enabled) async {
    if (!_isCurrent || _saving != null) return;
    setState(() => _saving = category);
    try {
      await _repository.setAccountPreference(
        eventType: category.eventType,
        enabled: enabled,
        admission: ApiMutationAdmission(
          actorId: widget.userId,
          isCurrent: () => _isCurrent,
        ),
      );
      if (_isCurrent) {
        setState(() {
          _preferences = {...?_preferences, category.eventType: enabled};
          _saveFailed = null;
        });
      }
    } on Exception {
      if (_isCurrent) setState(() => _saveFailed = category);
    } finally {
      if (_isCurrent) setState(() => _saving = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    if (_loadFailed) {
      return SettingsTile(
        grouped: true,
        icon: LucideIcons.bellRing,
        title: l10n.settingsMastermindPushLoadError,
        onTap: _load,
      );
    }
    return Column(
      children: [
        for (final category in MastermindPushCategory.values)
          SettingsTile(
            grouped: true,
            icon: LucideIcons.bellRing,
            title: category.label(l10n),
            subtitle: _saveFailed == category
                ? l10n.settingsMastermindPushSaveError
                : null,
            showChevron: false,
            trailing: AppSwitch(
              value: _preferences?[category.eventType] ?? true,
              semanticLabel: category.label(l10n),
              onChanged: _preferences == null || _saving != null
                  ? null
                  : (enabled) => _change(category, enabled),
            ),
          ),
      ],
    );
  }
}
