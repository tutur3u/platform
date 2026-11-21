import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:mobile/features/mastermind/fleet_access/data/fleet_access_models.dart';
import 'package:mobile/features/mastermind/fleet_access/data/fleet_access_repository.dart';

enum FleetAccessStatus { initial, loading, loaded, error }

final class FleetAccessState extends Equatable {
  const FleetAccessState({
    this.status = FleetAccessStatus.initial,
    this.access = const FleetAccess.disabled(),
  });

  final FleetAccessStatus status;
  final FleetAccess access;

  /// Whether the Fleet view and its entry points show.
  bool get visible => status == FleetAccessStatus.loaded && access.enabled;

  @override
  List<Object?> get props => [status, access];
}

/// Cosmetic discovery gate for the Fleet view; it grants nothing.
///
/// Separate from `MastermindAccessCubit`: Fleet follows only
/// `GET /api/v1/fleet/access`, for anyone, in any workspace. There is no
/// offline fallback: a failed check hides the view, so a revoked grant never
/// shows from a stored answer.
final class FleetAccessCubit extends Cubit<FleetAccessState> {
  FleetAccessCubit({required FleetAccessSource source})
    : _source = source,
      super(const FleetAccessState());

  final FleetAccessSource _source;
  int _generation = 0;

  /// The same API client for the Fleet view's reads and writes.
  FleetAccessSource get source => _source;

  /// Checks once; later calls reuse the answer until [sync] or [reset].
  Future<void> ensureLoaded() async {
    if (state.status == FleetAccessStatus.initial) await sync();
  }

  /// Re-checks access. A [quiet] check keeps the current answer on screen
  /// while it runs, so a refresh never makes the entry blink, but a denial
  /// still applies at once.
  Future<void> sync({bool quiet = false}) async {
    final generation = ++_generation;
    final keep = quiet && state.status == FleetAccessStatus.loaded;
    if (!keep) emit(const FleetAccessState(status: FleetAccessStatus.loading));
    try {
      final access = await _source.access();
      if (isClosed || generation != _generation) return;
      emit(FleetAccessState(status: FleetAccessStatus.loaded, access: access));
    } on Object catch (error) {
      if (isClosed || generation != _generation) return;
      final failure = FleetAccessException.from(error).failure;
      // A refused session or grant hides the view even on a quiet check.
      if (keep &&
          failure != FleetAccessFailure.session &&
          failure != FleetAccessFailure.forbidden) {
        return;
      }
      emit(const FleetAccessState(status: FleetAccessStatus.error));
    }
  }

  /// A Fleet read or write answered 403: the grant may have ended, so ask
  /// again and let the answer decide.
  Future<void> handleForbidden() => sync(quiet: true);

  /// Logout or account switch: forget the answer; the next screen asks again.
  void reset() {
    _generation++;
    if (!isClosed) emit(const FleetAccessState());
  }
}
