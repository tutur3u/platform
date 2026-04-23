import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:mobile/data/repositories/habits_access_repository.dart';

const _sentinel = Object();

enum HabitsAccessStatus { initial, loading, loaded, error }

class HabitsAccessState extends Equatable {
  const HabitsAccessState({
    this.status = HabitsAccessStatus.initial,
    this.enabled = false,
    this.wsId,
  });

  final HabitsAccessStatus status;
  final bool enabled;
  final String? wsId;

  HabitsAccessState copyWith({
    HabitsAccessStatus? status,
    bool? enabled,
    Object? wsId = _sentinel,
  }) {
    return HabitsAccessState(
      status: status ?? this.status,
      enabled: enabled ?? this.enabled,
      wsId: wsId == _sentinel ? this.wsId : wsId as String?,
    );
  }

  @override
  List<Object?> get props => [status, enabled, wsId];
}

class HabitsAccessCubit extends Cubit<HabitsAccessState> {
  HabitsAccessCubit({required HabitsAccessRepository repository})
    : _repository = repository,
      super(const HabitsAccessState());

  final HabitsAccessRepository _repository;

  Future<void> syncWorkspace(String? wsId) async {
    final trimmed = wsId?.trim();
    if (trimmed == null || trimmed.isEmpty) {
      emit(
        state.copyWith(
          status: HabitsAccessStatus.loaded,
          enabled: false,
          wsId: null,
        ),
      );
      return;
    }

    if (state.wsId == trimmed && state.status == HabitsAccessStatus.loaded) {
      return;
    }

    final cached = await _repository.readCachedHabitsAccess(trimmed);
    final hasCachedValue = cached.hasValue && cached.data != null;

    if (hasCachedValue) {
      final cachedEnabled = cached.data;
      emit(
        state.copyWith(
          status: HabitsAccessStatus.loaded,
          enabled: cachedEnabled ?? false,
          wsId: trimmed,
        ),
      );

      if (cached.isFresh) {
        return;
      }
    } else {
      emit(
        state.copyWith(
          status: HabitsAccessStatus.loading,
          enabled: false,
          wsId: trimmed,
        ),
      );
    }

    try {
      final enabled = await _repository.isHabitsEnabled(trimmed);
      if (isClosed || state.wsId != trimmed) {
        return;
      }
      emit(
        state.copyWith(
          status: HabitsAccessStatus.loaded,
          enabled: enabled,
          wsId: trimmed,
        ),
      );
    } on Exception {
      if (isClosed || state.wsId != trimmed) {
        return;
      }
      if (hasCachedValue) {
        return;
      }
      emit(
        state.copyWith(
          status: HabitsAccessStatus.error,
          enabled: false,
          wsId: trimmed,
        ),
      );
    }
  }
}
