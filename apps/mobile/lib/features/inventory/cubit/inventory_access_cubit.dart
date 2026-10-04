import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:mobile/core/cache/cache_context.dart';
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
  InventoryAccessCubit({
    required InventoryAccessRepository repository,
    String? Function()? currentUserId,
  }) : _repository = repository,
       _currentUserId = currentUserId ?? currentCacheUserId,
       super(const InventoryAccessState());

  final InventoryAccessRepository _repository;
  final String? Function() _currentUserId;
  String? _loadedActor;
  int _generation = 0;

  Future<void> syncWorkspace(String? wsId) async {
    final actor = _currentUserId();
    final generation = ++_generation;
    final trimmed = wsId?.trim();
    final sameScope = state.wsId == trimmed && _loadedActor == actor;
    _loadedActor = actor;
    bool current() =>
        !isClosed && generation == _generation && _currentUserId() == actor;
    if (actor == null || trimmed == null || trimmed.isEmpty) {
      emit(
        state.copyWith(
          status: InventoryAccessStatus.loaded,
          enabled: false,
          wsId: null,
        ),
      );
      return;
    }

    if (!sameScope) {
      emit(
        state.copyWith(
          status: InventoryAccessStatus.loading,
          enabled: false,
          wsId: trimmed,
        ),
      );
    }

    final cached = await _repository.readCachedInventoryAccess(trimmed);
    if (!current()) return;
    final hasCachedValue = cached.hasValue && cached.data != null;

    if (hasCachedValue) {
      final cachedEnabled = cached.data;
      emit(
        state.copyWith(
          status: InventoryAccessStatus.loaded,
          enabled: cachedEnabled ?? false,
          wsId: trimmed,
        ),
      );
    } else {
      emit(
        state.copyWith(
          status: InventoryAccessStatus.loading,
          enabled: false,
          wsId: trimmed,
        ),
      );
    }

    try {
      final enabled = await _repository.isInventoryEnabled(trimmed);
      if (!current() || state.wsId != trimmed) {
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
      if (!current() || state.wsId != trimmed) {
        return;
      }
      if (hasCachedValue) {
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
