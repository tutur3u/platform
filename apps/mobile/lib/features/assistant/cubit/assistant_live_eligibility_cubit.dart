import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:mobile/features/assistant/models/assistant_live_eligibility.dart';

class AssistantLiveEligibilityState extends Equatable {
  const AssistantLiveEligibilityState({
    this.scope,
    this.eligibility,
    this.loading = false,
    this.fetchedAt,
  });

  /// Actor and workspace the decision belongs to.
  final String? scope;
  final AssistantLiveEligibility? eligibility;
  final bool loading;
  final DateTime? fetchedAt;

  /// Locked only on a known refusal; unknown leaves the token route to decide.
  bool blockedFor(String scope) =>
      this.scope == scope && (eligibility?.blocked ?? false);

  @override
  List<Object?> get props => [scope, eligibility, loading, fetchedAt];
}

/// Caches the server's Live decision briefly per actor and workspace, so the
/// Live entry can show a lock before the user taps Start.
class AssistantLiveEligibilityCubit
    extends Cubit<AssistantLiveEligibilityState> {
  AssistantLiveEligibilityCubit({
    required Future<AssistantLiveEligibility> Function(String wsId) fetch,
    DateTime Function()? now,
    this.ttl = const Duration(seconds: 30),
  }) : _fetch = fetch,
       _now = now ?? DateTime.now,
       super(const AssistantLiveEligibilityState());

  final Future<AssistantLiveEligibility> Function(String wsId) _fetch;
  final DateTime Function() _now;
  final Duration ttl;
  int _version = 0;

  bool _fresh(String scope) {
    final fetchedAt = state.fetchedAt;
    return state.scope == scope &&
        state.eligibility != null &&
        fetchedAt != null &&
        _now().difference(fetchedAt) < ttl;
  }

  /// Returns the cached decision when fresh, otherwise asks the server.
  /// A failed check returns null: the start proceeds and the token route
  /// makes the same decision authoritatively.
  Future<AssistantLiveEligibility?> ensure({
    required String actorId,
    required String wsId,
    bool force = false,
  }) async {
    final scope = '$actorId:$wsId';
    if (!force && _fresh(scope)) return state.eligibility;
    final version = ++_version;
    final keep = state.scope == scope ? state.eligibility : null;
    emit(
      AssistantLiveEligibilityState(
        scope: scope,
        eligibility: keep,
        loading: true,
        fetchedAt: state.scope == scope ? state.fetchedAt : null,
      ),
    );
    try {
      final eligibility = await _fetch(wsId);
      if (isClosed || version != _version) return eligibility;
      emit(
        AssistantLiveEligibilityState(
          scope: scope,
          eligibility: eligibility,
          fetchedAt: _now(),
        ),
      );
      return eligibility;
    } on Exception {
      if (!isClosed && version == _version) {
        emit(AssistantLiveEligibilityState(scope: scope, eligibility: keep));
      }
      return null;
    }
  }

  /// Records a refusal the token route returned after a stale pre-check.
  void recordRefusal({
    required String actorId,
    required String wsId,
    required AssistantLiveEligibility refusal,
  }) {
    if (isClosed) return;
    _version++;
    emit(
      AssistantLiveEligibilityState(
        scope: '$actorId:$wsId',
        eligibility: refusal,
        fetchedAt: _now(),
      ),
    );
  }
}
