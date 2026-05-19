import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:mobile/data/repositories/education_access_repository.dart';

const _sentinel = Object();

enum EducationAccessStatus { initial, loading, loaded, error }

class EducationAccessState extends Equatable {
  const EducationAccessState({
    this.status = EducationAccessStatus.initial,
    this.enabled = false,
    this.wsId,
  });

  final EducationAccessStatus status;
  final bool enabled;
  final String? wsId;

  EducationAccessState copyWith({
    EducationAccessStatus? status,
    bool? enabled,
    Object? wsId = _sentinel,
  }) {
    return EducationAccessState(
      status: status ?? this.status,
      enabled: enabled ?? this.enabled,
      wsId: wsId == _sentinel ? this.wsId : wsId as String?,
    );
  }

  @override
  List<Object?> get props => [status, enabled, wsId];
}

class EducationAccessCubit extends Cubit<EducationAccessState> {
  EducationAccessCubit({required EducationAccessRepository repository})
    : _repository = repository,
      super(const EducationAccessState());

  final EducationAccessRepository _repository;

  Future<void> syncWorkspace(String? wsId) async {
    final trimmed = wsId?.trim();
    if (trimmed == null || trimmed.isEmpty) {
      emit(
        state.copyWith(
          status: EducationAccessStatus.loaded,
          enabled: false,
          wsId: null,
        ),
      );
      return;
    }

    emit(
      state.copyWith(
        status: EducationAccessStatus.loading,
        enabled: false,
        wsId: trimmed,
      ),
    );

    try {
      final enabled = await _repository.isEducationEnabled(trimmed);
      if (isClosed || state.wsId != trimmed) {
        return;
      }
      emit(
        state.copyWith(
          status: EducationAccessStatus.loaded,
          enabled: enabled,
          wsId: trimmed,
        ),
      );
    } on Exception {
      if (isClosed || state.wsId != trimmed) {
        return;
      }
      emit(
        state.copyWith(
          status: EducationAccessStatus.error,
          enabled: false,
          wsId: trimmed,
        ),
      );
    }
  }
}
