import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';

/// Reload visible projections once replay and cache revalidation finish.
mixin OfflineSyncRefresh<T extends StatefulWidget> on State<T> {
  Future<void> refreshAfterOfflineSync();

  @override
  void initState() {
    super.initState();
    OfflineMutationQueue.instance.syncRevision.addListener(_onOfflineSync);
  }

  void _onOfflineSync() {
    if (!mounted) return;
    unawaited(
      Future<void>.sync(
        refreshAfterOfflineSync,
      ).then<void>((_) {}, onError: (Object _) {}),
    );
  }

  @override
  void dispose() {
    OfflineMutationQueue.instance.syncRevision.removeListener(_onOfflineSync);
    super.dispose();
  }
}
