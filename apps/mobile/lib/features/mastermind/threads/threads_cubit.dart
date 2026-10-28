import 'package:bloc/bloc.dart';
import 'package:mobile/features/mastermind/threads/threads_models.dart';
import 'package:mobile/features/mastermind/threads/threads_repository.dart';

enum ThreadsStatus { loading, ready, fallback, error }

class ThreadsState {
  const ThreadsState(this.status, {this.entries = const [], this.failure});
  final ThreadsStatus status;
  final List<ThreadEntry> entries;
  final ThreadsFailure? failure;
}

class ThreadsCubit extends Cubit<ThreadsState> {
  ThreadsCubit(this.repository)
    : super(const ThreadsState(ThreadsStatus.loading));
  final ThreadsRepository repository;
  bool _busy = false;
  Future<void> refresh() async {
    if (_busy || isClosed) return;
    _busy = true;
    try {
      if (!await repository.capabilities()) {
        if (!isClosed) emit(const ThreadsState(ThreadsStatus.fallback));
        return;
      }
      final entries = await repository.loadIndex();
      if (!isClosed) emit(ThreadsState(ThreadsStatus.ready, entries: entries));
    } on Object catch (e) {
      if (!isClosed) {
        emit(
          ThreadsState(
            ThreadsStatus.error,
            entries: repository.index,
            failure: e is ThreadsFailure ? e : const ThreadsFailure(503),
          ),
        );
      }
    } finally {
      _busy = false;
    }
  }
}
