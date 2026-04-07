import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:mobile/data/repositories/inventory_access_repository.dart';

const _sentinel = Object();

enum InventoryAccessStatus { initial, loading, loaded, error }

class InventoryAccessState extends Equatable {
  const InventoryAccessState({
    this.status = InventoryAccessStatus.initial,
    this.enabled = false,
    this.wsId,
  });

  final InventoryAccessStatus status;
  final bool enabled;
  final String? wsId;

  InventoryAccessState copyWith({
    InventoryAccessStatus? status,
    bool? enabled,
    Object? wsId = _sentinel,
  }) {
    return InventoryAccessState(
      status: status ?? this.status,
      enabled: enabled ?? this.enabled,
      wsId: wsId == _sentinel ? this.wsId : wsId as String?,
    );
  }

  @override
  List<Object?> get props => [status, enabled, wsId];
}

class InventoryAccessCubit extends Cubit<InventoryAccessState> {
  InventoryAccessCubit({required InventoryAccessRepository repository})
    : _repository = repository,
      super(const InventoryAccessState());

  final InventoryAccessRepository _repository;

  Future<void> syncWorkspace(String? wsId) async {
    final trimmed = wsId?.trim();
    if (trimmed == null || trimmed.isEmpty) {
      emit(
        state.copyWith(
          status: InventoryAccessStatus.loaded,
          wsId: null,
        ),
      );
      return;
    }

    if (state.wsId == trimmed && state.status == InventoryAccessStatus.loaded) {
      return;
    }

    emit(
      state.copyWith(
        status: InventoryAccessStatus.loading,
        enabled: false,
        wsId: trimmed,
      ),
    );

    try {
      final enabled = await _repository.isInventoryEnabled(trimmed);
      if (state.wsId != trimmed) {
        return;
      }
      emit(
        state.copyWith(
          status: InventoryAccessStatus.loaded,
          enabled: enabled,
          wsId: trimmed,
        ),
      );
    } on Exception {
      if (state.wsId != trimmed) {
        return;
      }
      emit(
        state.copyWith(
          status: InventoryAccessStatus.error,
          enabled: false,
          wsId: trimmed,
        ),
      );
    }
  }
}
