import 'dart:async';
import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/repositories/calendar_repository.dart';
import 'package:mobile/features/calendar/cubit/calendar_cubit.dart';
import 'package:mocktail/mocktail.dart';

class _Repository extends Mock implements CalendarRepository {}

class _SecureStorage extends Mock implements FlutterSecureStorage {}

class _ObservedCacheStore extends CacheStore {
  _ObservedCacheStore({
    required super.secureStorage,
    required super.directoryResolver,
    super.persistenceCheckpoint,
  }) : super.forTesting();
  int cancelledWrites = 0;
  @override
  Future<void> write({
    required CacheKey key,
    required CachePolicy policy,
    required Object? payload,
    String? etag,
    List<String> tags = const [],
    int? expectedRevision,
    void Function()? checkScope,
    bool requirePublication = false,
  }) async {
    await super
        .write(
          key: key,
          policy: policy,
          payload: payload,
          etag: etag,
          tags: tags,
          expectedRevision: expectedRevision,
          checkScope: checkScope,
          requirePublication: requirePublication,
        )
        .onError<StateError>((error, stack) {
          cancelledWrites++;
          Error.throwWithStackTrace(error, stack);
        });
  }
}

void main() {
  setUpAll(() => registerFallbackValue(DateTime(2030)));
  for (final mode in ['workspace', 'logout', 'programmer']) {
    test('cache admission handles only owned cancellation: $mode', () async {
      CalendarCubit.clearCache();
      final directory = await Directory.systemTemp.createTemp(
        'calendar-zoom-cache-',
      );
      final secure = _SecureStorage();
      final values = <String, String>{};
      when(
        () => secure.read(key: any(named: 'key')),
      ).thenAnswer((call) async => values[call.namedArguments[#key] as String]);
      when(
        () => secure.write(
          key: any(named: 'key'),
          value: any(named: 'value'),
        ),
      ).thenAnswer((call) async {
        values[call.namedArguments[#key] as String] =
            call.namedArguments[#value] as String;
      });
      final admission = Completer<void>();
      final release = Completer<void>();
      var delay = false;
      var failPublication = false;
      final cache = _ObservedCacheStore(
        secureStorage: secure,
        persistenceCheckpoint: (stage) {
          if (failPublication && stage == 'snapshot') {
            throw StateError('Fixture programmer failure');
          }
        },
        directoryResolver: () async {
          if (delay) {
            admission.complete();
            await release.future;
          }
          return directory;
        },
      );
      final repository = _Repository();
      when(
        () => repository.getEvents(
          any(),
          start: any(named: 'start'),
          end: any(named: 'end'),
        ),
      ).thenAnswer((_) async => []);
      final cubit = CalendarCubit(
        calendarRepository: repository,
        cacheStore: cache,
      );
      addTearDown(() async {
        await cubit.close();
        await cache.closeForTesting();
        await directory.delete(recursive: true);
      });
      await cubit.loadEvents('a');
      if (mode == 'programmer') {
        failPublication = true;
        await expectLater(
          cubit.setTimelineZoom(
            1.7,
            expectedUserId: null,
            expectedWorkspaceId: 'a',
            expectedScope: cubit.timelineZoomScope,
          ),
          throwsA(
            isA<StateError>().having(
              (error) => error.message,
              'message',
              'Fixture programmer failure',
            ),
          ),
        );
        return;
      }
      await cache.closeForTesting();
      delay = true;
      final saving = cubit.setTimelineZoom(
        1.7,
        expectedUserId: null,
        expectedWorkspaceId: 'a',
        expectedScope: cubit.timelineZoomScope,
      );
      final completion = expectLater(saving, completes);
      await admission.future;
      final switching = <Future<void>>[];
      if (mode == 'logout') {
        CalendarCubit.clearCache();
      } else {
        switching
          ..add(cubit.loadEvents('b'))
          ..add(cubit.loadEvents('a'));
      }
      release.complete();
      try {
        await completion;
      } finally {
        await Future.wait(switching);
      }
      expect(cache.cancelledWrites, 1);
    });
  }
}
