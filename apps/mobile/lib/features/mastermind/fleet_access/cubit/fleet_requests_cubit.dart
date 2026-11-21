import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:mobile/features/mastermind/fleet_access/data/fleet_access_models.dart';
import 'package:mobile/features/mastermind/fleet_access/data/fleet_access_repository.dart';
import 'package:mobile/features/mastermind/fleet_access/data/fleet_intent_draft.dart';

final class FleetRequestsState extends Equatable {
  const FleetRequestsState({
    this.receipts,
    this.nextBefore,
    this.failure,
    this.loading = false,
    this.loadingMore = false,
  });

  /// Null until the first page arrives.
  final List<FleetIntentReceipt>? receipts;
  final String? nextBefore;
  final FleetAccessFailure? failure;
  final bool loading;
  final bool loadingMore;

  bool get hasMore => nextBefore != null;

  @override
  List<Object?> get props => [
    receipts,
    nextBefore,
    failure,
    loading,
    loadingMore,
  ];
}

/// The person's own receipts, newest first, and request submission.
final class FleetRequestsCubit extends Cubit<FleetRequestsState> {
  FleetRequestsCubit({
    required FleetAccessSource source,
    required Future<void> Function() onForbidden,
  }) : _source = source,
       _onForbidden = onForbidden,
       super(const FleetRequestsState());

  final FleetAccessSource _source;
  final Future<void> Function() _onForbidden;
  int _generation = 0;

  Future<void> load() async {
    final generation = ++_generation;
    emit(
      FleetRequestsState(
        receipts: state.receipts,
        nextBefore: state.nextBefore,
        loading: true,
      ),
    );
    try {
      final page = await _source.intents();
      if (isClosed || generation != _generation) return;
      emit(
        FleetRequestsState(receipts: page.intents, nextBefore: page.nextBefore),
      );
    } on Object catch (error) {
      if (isClosed || generation != _generation) return;
      await _fail(error);
    }
  }

  Future<void> loadMore() async {
    final before = state.nextBefore;
    final held = state.receipts;
    if (before == null || held == null || state.loadingMore || state.loading) {
      return;
    }
    final generation = _generation;
    emit(
      FleetRequestsState(receipts: held, nextBefore: before, loadingMore: true),
    );
    try {
      final page = await _source.intents(before: before);
      if (isClosed || generation != _generation) return;
      emit(
        FleetRequestsState(
          receipts: [...held, ...page.intents],
          nextBefore: page.nextBefore,
        ),
      );
    } on Object catch (error) {
      if (isClosed || generation != _generation) return;
      await _fail(error);
    }
  }

  /// Files [draft]; on success the list reloads so the new receipt shows
  /// with the state the server gave it. Throws [FleetAccessException].
  Future<void> submit(FleetIntentDraft draft) async {
    try {
      await _source.submit(draft);
    } on Object catch (error) {
      final failure = FleetAccessException.from(error);
      if (failure.failure == FleetAccessFailure.forbidden) {
        await _onForbidden();
      }
      throw failure;
    }
    await load();
  }

  Future<void> _fail(Object error) async {
    final failure = FleetAccessException.from(error).failure;
    final forbidden = failure == FleetAccessFailure.forbidden;
    emit(
      FleetRequestsState(
        receipts: forbidden ? null : state.receipts,
        nextBefore: forbidden ? null : state.nextBefore,
        failure: failure,
      ),
    );
    if (forbidden) await _onForbidden();
  }
}
