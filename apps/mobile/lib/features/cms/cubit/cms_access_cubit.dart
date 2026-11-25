import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/data/repositories/cms_access_repository.dart';

const _sentinel = Object();

enum CmsAccessStatus { initial, loading, loaded, error }

class CmsAccessState extends Equatable {
  const CmsAccessState({
    this.status = CmsAccessStatus.initial,
    this.enabled = false,
    this.wsId,
  });

  final CmsAccessStatus status;
  final bool enabled;
  final String? wsId;

  /// True once the workspace is known to have no CMS for this actor.
  bool get isUnavailable => status == CmsAccessStatus.loaded && !enabled;

  CmsAccessState copyWith({
    CmsAccessStatus? status,
    bool? enabled,
    Object? wsId = _sentinel,
  }) => CmsAccessState(
    status: status ?? this.status,
    enabled: enabled ?? this.enabled,
    wsId: wsId == _sentinel ? this.wsId : wsId as String?,
  );

  @override
  List<Object?> get props => [status, enabled, wsId];
}

/// Gates the CMS app per workspace (see [CmsAccessRepository]): shown only
/// when the external-project studio is enabled for an actor who can use it.
class CmsAccessCubit extends Cubit<CmsAccessState> {
  CmsAccessCubit({
    required CmsAccessRepository repository,
    String? Function()? currentUserId,
  }) : _repository = repository,
       _currentUserId = currentUserId ?? currentCacheUserId,
       super(const CmsAccessState());

  final CmsAccessRepository _repository;
  final String? Function() _currentUserId;
  String? _loadedActor;
  int _generation = 0;

  /// Shows the stored answer for [wsId] at once, then always revalidates it
  /// with the server, so a studio disabled since the last visit disappears.
  Future<void> syncWorkspace(String? wsId) async {
    final actor = _currentUserId();
    final generation = ++_generation;
    final trimmed = wsId?.trim();
    final sameScope = state.wsId == trimmed && _loadedActor == actor;
    _loadedActor = actor;
    bool current() =>
        !isClosed && generation == _generation && _currentUserId() == actor;

    if (actor == null || trimmed == null || trimmed.isEmpty) {
      emit(const CmsAccessState(status: CmsAccessStatus.loaded));
      return;
    }
    if (!sameScope) {
      emit(CmsAccessState(status: CmsAccessStatus.loading, wsId: trimmed));
    }

    final cached = await _repository.readCachedCmsAccess(trimmed);
    if (!current()) return;
    final cachedEnabled = cached.hasValue ? cached.data : null;
    if (cachedEnabled != null) {
      emit(
        CmsAccessState(
          status: CmsAccessStatus.loaded,
          enabled: cachedEnabled,
          wsId: trimmed,
        ),
      );
    }

    try {
      final enabled = await _repository.isCmsEnabled(
        trimmed,
        forceRefresh: true,
      );
      if (!current()) return;
      emit(
        CmsAccessState(
          status: CmsAccessStatus.loaded,
          enabled: enabled,
          wsId: trimmed,
        ),
      );
    } on Object {
      // Keep a stored answer through a transient failure; with none, the app
      // stays hidden and deep links stay open until a later sync succeeds.
      if (!current() || cachedEnabled != null) return;
      emit(CmsAccessState(status: CmsAccessStatus.error, wsId: trimmed));
    }
  }

  /// Records that a CMS read for [wsId] reported the studio as unavailable:
  /// the server is asked again, bypassing any stored answer.
  Future<void> markUnavailable(String wsId) async {
    if (isClosed || state.wsId != wsId || state.isUnavailable) return;
    await syncWorkspace(wsId);
  }
}
