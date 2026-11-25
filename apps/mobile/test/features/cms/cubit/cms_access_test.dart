import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cached_resource_record.dart';
import 'package:mobile/core/router/app_router_access_redirects.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/repositories/cms_access_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/apps/registry/app_registry.dart';
import 'package:mobile/features/cms/cubit/cms_access_cubit.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/pump_app.dart';

class _MockRepository extends Mock implements CmsAccessRepository {}

class _MockCmsAccessCubit extends MockCubit<CmsAccessState>
    implements CmsAccessCubit {}

const _missing = CacheReadResult<bool>(state: CacheEntryState.missing);

void main() {
  group('CmsAccessRepository.isUnavailableError', () {
    test('treats the unavailable studio and plain denial as no CMS', () {
      expect(
        CmsAccessRepository.isUnavailableError(
          const ApiException(
            message: 'External project studio unavailable for this workspace',
            statusCode: 404,
          ),
        ),
        isTrue,
      );
      expect(
        CmsAccessRepository.isUnavailableError(
          const ApiException(message: 'Forbidden', statusCode: 403),
        ),
        isTrue,
      );
    });

    test('keeps re-authentication and transient failures visible', () {
      for (final error in const [
        ApiException(message: 'mfa', statusCode: 403, code: 'MFA_REQUIRED'),
        ApiException(
          message: 'verify',
          statusCode: 403,
          isVerificationRequired: true,
        ),
        ApiException(message: 'session', statusCode: 401),
        ApiException(message: 'boom', statusCode: 500),
      ]) {
        expect(CmsAccessRepository.isUnavailableError(error), isFalse);
      }
    });
  });

  group('CmsAccessCubit', () {
    late _MockRepository repository;
    var actor = 'actor';
    CmsAccessCubit build() =>
        CmsAccessCubit(repository: repository, currentUserId: () => actor);
    void network(String wsId, Future<bool> Function() answer) => when(
      () => repository.isCmsEnabled(
        wsId,
        forceRefresh: any(named: 'forceRefresh'),
      ),
    ).thenAnswer((_) => answer());

    setUp(() {
      actor = 'actor';
      repository = _MockRepository();
      when(
        () => repository.readCachedCmsAccess(any()),
      ).thenAnswer((_) async => _missing);
    });

    blocTest<CmsAccessCubit, CmsAccessState>(
      'resolves a workspace without CMS as unavailable',
      build: () {
        network('ws', () async => false);
        return build();
      },
      act: (cubit) => cubit.syncWorkspace('ws'),
      expect: () => const [
        CmsAccessState(status: CmsAccessStatus.loading, wsId: 'ws'),
        CmsAccessState(status: CmsAccessStatus.loaded, wsId: 'ws'),
      ],
      verify: (cubit) => expect(cubit.state.isUnavailable, isTrue),
    );

    blocTest<CmsAccessCubit, CmsAccessState>(
      'a stored "enabled" is revalidated past the cache on every entry',
      build: () {
        when(() => repository.readCachedCmsAccess('ws')).thenAnswer(
          (_) async => const CacheReadResult<bool>(
            state: CacheEntryState.fresh,
            data: true,
            hasValue: true,
          ),
        );
        network('ws', () async => false);
        return build();
      },
      act: (cubit) => cubit.syncWorkspace('ws'),
      expect: () => const [
        CmsAccessState(status: CmsAccessStatus.loading, wsId: 'ws'),
        CmsAccessState(
          status: CmsAccessStatus.loaded,
          enabled: true,
          wsId: 'ws',
        ),
        CmsAccessState(status: CmsAccessStatus.loaded, wsId: 'ws'),
      ],
      verify: (_) => verify(
        () => repository.isCmsEnabled('ws', forceRefresh: true),
      ).called(1),
    );

    blocTest<CmsAccessCubit, CmsAccessState>(
      'a page-reported unavailable studio re-checks access',
      build: () {
        var enabled = true;
        network('ws', () async {
          final value = enabled;
          enabled = false;
          return value;
        });
        return build();
      },
      act: (cubit) async {
        await cubit.syncWorkspace('ws');
        await cubit.markUnavailable('ws');
        await cubit.markUnavailable('other');
      },
      verify: (cubit) {
        expect(cubit.state.isUnavailable, isTrue);
        verify(
          () => repository.isCmsEnabled('ws', forceRefresh: true),
        ).called(2);
      },
    );

    blocTest<CmsAccessCubit, CmsAccessState>(
      'a slower earlier workspace cannot overwrite the current one',
      build: () {
        final slow = Completer<bool>();
        network('a', () => slow.future);
        network('b', () async => true);
        addTearDown(() {
          if (!slow.isCompleted) slow.complete(false);
        });
        return build();
      },
      act: (cubit) async {
        final first = cubit.syncWorkspace('a');
        await cubit.syncWorkspace('b');
        await first;
      },
      verify: (cubit) => expect(
        cubit.state,
        const CmsAccessState(
          status: CmsAccessStatus.loaded,
          enabled: true,
          wsId: 'b',
        ),
      ),
    );

    blocTest<CmsAccessCubit, CmsAccessState>(
      'a cancelled read with nothing stored settles as an error, not loading',
      build: () {
        network('ws', () async => throw StateError('Refresh gate closed'));
        return build();
      },
      act: (cubit) => cubit.syncWorkspace('ws'),
      verify: (cubit) => expect(
        cubit.state,
        const CmsAccessState(status: CmsAccessStatus.error, wsId: 'ws'),
      ),
    );

    blocTest<CmsAccessCubit, CmsAccessState>(
      "an account switch mid-read drops the previous actor's answer",
      build: () {
        network('ws', () async {
          actor = 'other';
          return true;
        });
        return build();
      },
      act: (cubit) => cubit.syncWorkspace('ws'),
      verify: (cubit) => expect(cubit.state.enabled, isFalse),
    );
  });

  test('CMS deep links fall back to Apps only once access is resolved', () {
    const unavailable = CmsAccessState(
      status: CmsAccessStatus.loaded,
      wsId: 'ws',
    );
    expect(shouldRedirectUnavailableCmsRoutes(Routes.cms, unavailable), isTrue);
    expect(
      shouldRedirectUnavailableCmsRoutes('${Routes.cms}/x', unavailable),
      isTrue,
    );
    expect(
      shouldRedirectUnavailableCmsRoutes(Routes.drive, unavailable),
      isFalse,
    );
    expect(
      shouldRedirectUnavailableCmsRoutes(
        Routes.cms,
        const CmsAccessState(status: CmsAccessStatus.loading, wsId: 'ws'),
      ),
      isFalse,
    );
    expect(
      shouldRedirectUnavailableCmsRoutes(
        Routes.cms,
        const CmsAccessState(
          status: CmsAccessStatus.loaded,
          enabled: true,
          wsId: 'ws',
        ),
      ),
      isFalse,
    );
  });

  for (final (enabled, expected) in [(true, isTrue), (false, isFalse)]) {
    testWidgets('CMS app visibility follows access (enabled: $enabled)', (
      tester,
    ) async {
      final cubit = _MockCmsAccessCubit();
      whenListen(
        cubit,
        const Stream<CmsAccessState>.empty(),
        initialState: CmsAccessState(
          status: CmsAccessStatus.loaded,
          enabled: enabled,
          wsId: 'ws',
        ),
      );
      addTearDown(cubit.close);
      late bool visible;
      await tester.pumpApp(
        BlocProvider<CmsAccessCubit>.value(
          value: cubit,
          child: Builder(
            builder: (context) {
              visible = AppRegistry.moduleById('cms')!.visibleIn(context);
              return const SizedBox.shrink();
            },
          ),
        ),
      );
      expect(visible, expected);
    });
  }
}
