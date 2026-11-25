import 'dart:async';

import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/command_palette/palette_repository.dart';

enum PaletteSearchStatus { idle, loading, ready, failed }

class PaletteState {
  const PaletteState({
    this.query = '',
    this.status = PaletteSearchStatus.idle,
    this.results = const [],
    this.recentIds = const [],
  });

  final String query;
  final PaletteSearchStatus status;
  final List<PaletteRecord> results;
  final List<String> recentIds;

  PaletteState withRecents(List<String> ids) => PaletteState(
    query: query,
    status: status,
    results: results,
    recentIds: ids,
  );
}

class PaletteCubit extends Cubit<PaletteState> {
  PaletteCubit({
    required PaletteRepository repository,
    required PaletteRecents recents,
    this.debounce = const Duration(milliseconds: 300),
  }) : _repository = repository,
       _recents = recents,
       super(const PaletteState());

  final PaletteRepository _repository;
  final PaletteRecents _recents;
  final Duration debounce;
  Timer? _timer;
  int _revision = 0;

  Future<void> loadRecents() async {
    try {
      final ids = await _recents.read();
      if (!isClosed) emit(state.withRecents(ids.take(8).toList()));
    } on Exception {
      // The palette works without history when preferences are unavailable.
    }
  }

  static Future<void> remember(PaletteRecents recents, String id) async {
    try {
      await recents.remember(id);
    } on Exception {
      // Failure to save history must not block the chosen command.
    }
  }

  void setQuery(String value) {
    final query = value.trim();
    if (query == state.query) return;
    _timer?.cancel();
    final revision = ++_revision;
    emit(
      PaletteState(
        query: query,
        status: query.isEmpty
            ? PaletteSearchStatus.idle
            : PaletteSearchStatus.loading,
        recentIds: state.recentIds,
      ),
    );
    if (query.isEmpty) return;
    _timer = Timer(debounce, () => unawaited(_search(query, revision)));
  }

  Future<void> _search(String query, int revision) async {
    PaletteSearchResult result;
    try {
      result = await _repository.search(query);
    } on Exception {
      result = (records: const [], failed: true);
    }
    if (isClosed || revision != _revision) return;
    emit(
      PaletteState(
        query: query,
        status: result.failed
            ? PaletteSearchStatus.failed
            : PaletteSearchStatus.ready,
        recentIds: state.recentIds,
        results: result.records,
      ),
    );
  }

  @override
  Future<void> close() {
    _timer?.cancel();
    return super.close();
  }
}
