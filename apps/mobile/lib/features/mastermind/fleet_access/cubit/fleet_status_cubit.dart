import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:mobile/features/mastermind/fleet_access/data/fleet_access_models.dart';
import 'package:mobile/features/mastermind/fleet_access/data/fleet_access_repository.dart';

final class FleetStatusState extends Equatable {
  const FleetStatusState({this.digest, this.failure, this.loading = false});

  /// The last digest read, kept on screen while a refresh runs or fails.
  final FleetDigest? digest;

  /// The latest read's failure; null after a successful read.
  final FleetAccessFailure? failure;
  final bool loading;

  @override
  List<Object?> get props => [digest, failure, loading];
}

/// The scoped digest behind Status. Read on open and on pull to refresh; a
/// 403 has the access gate check again.
final class FleetStatusCubit extends Cubit<FleetStatusState> {
  FleetStatusCubit({
    required FleetAccessSource source,
    required Future<void> Function() onForbidden,
  }) : _source = source,
       _onForbidden = onForbidden,
       super(const FleetStatusState());

  final FleetAccessSource _source;
  final Future<void> Function() _onForbidden;
  int _generation = 0;

  Future<void> load() async {
    final generation = ++_generation;
    emit(FleetStatusState(digest: state.digest, loading: true));
    try {
      final digest = await _source.digest();
      if (isClosed || generation != _generation) return;
      emit(FleetStatusState(digest: digest));
    } on Object catch (error) {
      if (isClosed || generation != _generation) return;
      final failure = FleetAccessException.from(error).failure;
      // A refused read must not keep showing what it can no longer read.
      final forbidden = failure == FleetAccessFailure.forbidden;
      emit(
        FleetStatusState(
          digest: forbidden ? null : state.digest,
          failure: failure,
        ),
      );
      if (forbidden) await _onForbidden();
    }
  }
}
