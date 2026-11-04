import 'dart:async';
import 'dart:developer';

import 'package:flutter/widgets.dart';

/// Starts best-effort recovery only after the first frame has been painted.
///
/// Required identity, appearance and offline state must remain in bootstrap.
/// Optional work never delays painting or sends failures to the startup zone;
/// Its owning feature exposes errors and permits retries.
void scheduleOptionalStartup(Future<void> Function() initialize) {
  WidgetsBinding.instance.addPostFrameCallback((_) {
    unawaited(
      Future<void>.sync(initialize).catchError((
        Object error,
        StackTrace stack,
      ) {
        // Never include the message: it may carry user or token content.
        log('Optional startup failed: ${error.runtimeType}', stackTrace: stack);
      }),
    );
  });
}
