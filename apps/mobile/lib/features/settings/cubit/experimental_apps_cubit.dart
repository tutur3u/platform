import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:mobile/data/repositories/settings_repository.dart';

class ExperimentalAppsState extends Equatable {
  const ExperimentalAppsState({
    this.enabledModuleIds = const <String>{},
    this.loaded = false,
  });

  final Set<String> enabledModuleIds;
  final bool loaded;

  bool isEnabled(String moduleId) => enabledModuleIds.contains(moduleId);

  ExperimentalAppsState copyWith({
    Set<String>? enabledModuleIds,
    bool? loaded,
  }) {
    return ExperimentalAppsState(
      enabledModuleIds: enabledModuleIds ?? this.enabledModuleIds,
      loaded: loaded ?? this.loaded,
    );
  }

  @override
  List<Object?> get props => [
    enabledModuleIds.toList(growable: false)..sort(),
    loaded,
  ];
}

class ExperimentalAppsCubit extends Cubit<ExperimentalAppsState> {
  ExperimentalAppsCubit({required SettingsRepository settingsRepository})
    : _settingsRepository = settingsRepository,
      super(const ExperimentalAppsState());

  final SettingsRepository _settingsRepository;

  Future<void> load() async {
    final enabledModuleIds = await _settingsRepository
        .getEnabledExperimentalAppIds();
    emit(state.copyWith(enabledModuleIds: enabledModuleIds, loaded: true));
  }

  Future<void> setModuleEnabled({
    required String moduleId,
    required bool enabled,
  }) async {
    final normalizedModuleId = moduleId.trim();
    if (normalizedModuleId.isEmpty) {
      return;
    }

    final nextModuleIds = Set<String>.from(state.enabledModuleIds);
    if (enabled) {
      nextModuleIds.add(normalizedModuleId);
    } else {
      nextModuleIds.remove(normalizedModuleId);
    }

    emit(state.copyWith(enabledModuleIds: nextModuleIds, loaded: true));
    await _settingsRepository.setExperimentalAppEnabled(
      moduleId: normalizedModuleId,
      enabled: enabled,
    );
  }

  Future<void> toggleModule(String moduleId) async {
    await setModuleEnabled(
      moduleId: moduleId,
      enabled: !state.isEnabled(moduleId),
    );
  }
}
