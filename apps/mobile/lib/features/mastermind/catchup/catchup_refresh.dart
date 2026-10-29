import 'dart:async';

import 'package:flutter/foundation.dart';

enum CatchupRefreshStatus { idle, refreshing, upToDate, failed }

/// Progress, success and failure of a manual snapshot refetch, whether it came
/// from "Catch me up" or pull-to-refresh. No LLM is involved: it is the same
/// `GET /v1/snapshot` the scheduler polls.
final class CatchupRefreshController extends ChangeNotifier {
  CatchupRefreshController({this.successDuration = const Duration(seconds: 4)});

  final Duration successDuration;
  CatchupRefreshStatus _status = CatchupRefreshStatus.idle;
  Timer? _reset;
  int _runs = 0;
  bool _disposed = false;

  CatchupRefreshStatus get status => _status;

  /// Follows [refresh] (true when it succeeded). The status of a newer run
  /// replaces an older one's.
  Future<bool> track(Future<bool> refresh) async {
    final run = ++_runs;
    _reset?.cancel();
    _set(CatchupRefreshStatus.refreshing);
    var ok = false;
    try {
      ok = await refresh;
    } on Object {
      ok = false;
    }
    if (run != _runs || _disposed) return ok;
    _set(ok ? CatchupRefreshStatus.upToDate : CatchupRefreshStatus.failed);
    if (ok) {
      _reset = Timer(successDuration, () => _set(CatchupRefreshStatus.idle));
    }
    return ok;
  }

  void _set(CatchupRefreshStatus status) {
    if (_disposed || _status == status) return;
    _status = status;
    notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _reset?.cancel();
    super.dispose();
  }
}
