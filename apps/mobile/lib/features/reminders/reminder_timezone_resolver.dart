import 'dart:async';

import 'package:mobile/core/utils/timezone.dart';
import 'package:mobile/data/repositories/timezone_settings_repository.dart';
import 'package:mobile/features/settings/cubit/timezone_settings_cubit.dart';

/// Reuses Calendar settings precedence and retains only same-scope resolutions.
class ReminderTimezoneResolver {
  ReminderTimezoneResolver({
    TimezoneSettingsRepository? repository,
    Future<String> Function()? deviceLoader,
  }) : _repository = repository ?? TimezoneSettingsRepository(),
       _ownsRepository = repository == null,
       _deviceLoader = deviceLoader ?? getCurrentTimezoneIdentifier;

  final TimezoneSettingsRepository _repository;
  final bool _ownsRepository;
  final Future<String> Function() _deviceLoader;
  final Map<String, TimezoneSettingsCubit> _settings = {};
  String? _userId;
  int _generation = 0;

  Future<String> resolve({
    required String userId,
    required String workspaceId,
  }) async {
    if (_userId != userId) {
      clear();
      _userId = userId;
    }
    final generation = _generation;
    final cubit = _settings.putIfAbsent(
      workspaceId,
      () => TimezoneSettingsCubit(
        repository: _repository,
        deviceLoader: _deviceLoader,
      ),
    );
    await cubit.load(userId: userId, workspaceId: workspaceId);
    if (generation != _generation || _userId != userId) {
      throw StateError('Reminder timezone scope changed');
    }
    final state = cubit.state;
    if (!state.resolved) {
      // Abort scheduling with an explicit error instead of cancelling existing
      // valid reminders using an assumed zone after a cold settings failure.
      throw StateError('Reminder timezone settings are unavailable');
    }
    return state.effective;
  }

  void clear() {
    _generation++;
    _userId = null;
    for (final cubit in _settings.values) {
      unawaited(cubit.close());
    }
    _settings.clear();
  }

  void dispose() {
    clear();
    if (_ownsRepository) _repository.dispose();
  }
}
