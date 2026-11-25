import 'package:mobile/data/sources/api_client.dart';

/// Messages of the client-side errors that cancel an in-flight mail read:
/// a write invalidated the mail cache, the foreground refresh gate closed
/// (app lock or resume), or the cache scope was retired mid-refresh. None of
/// them is a server verdict on the mailbox.
const _interruptions = {
  'Mail request was invalidated',
  'Refresh gate closed',
  'Cache scope retired before refresh',
  'Mailbox snapshot removed',
};

/// Whether [error] cancelled a mail read rather than failing it.
bool isMailReadInterruption(Object error) =>
    error is StateError && _interruptions.contains(error.message);

/// Whether [error] is a transport, timeout or server failure worth retrying.
bool isTransientMailFailure(Object error) =>
    error is ApiException &&
    (error.failureKind == ApiFailureKind.transport ||
        error.statusCode == 408 ||
        error.statusCode >= 500);

/// Whether [error] means mail took too long to answer, as web words it.
bool isMailReadTimeout(Object error) =>
    error is ApiException &&
    (error.statusCode == 408 || error.statusCode == 503);

/// Runs [read], re-reading at once after up to [interruptionRetries]
/// cancellations and once after [transientDelay] for a transient failure.
/// Stops retrying as soon as [isCurrent] reports that the request is stale.
Future<T> readMailListWithRetry<T>(
  Future<T> Function() read, {
  required bool Function() isCurrent,
  int interruptionRetries = 2,
  Duration transientDelay = const Duration(milliseconds: 350),
}) async {
  var interruptions = 0;
  var transients = 0;
  while (true) {
    try {
      return await read();
    } on Object catch (error) {
      final interrupted = isMailReadInterruption(error);
      final retry = interrupted
          ? interruptions++ < interruptionRetries
          : isTransientMailFailure(error) && transients++ < 1;
      if (!retry || !isCurrent()) rethrow;
      if (!interrupted) await Future<void>.delayed(transientDelay);
      if (!isCurrent()) rethrow;
    }
  }
}
