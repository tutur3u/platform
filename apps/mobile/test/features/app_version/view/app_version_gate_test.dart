import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/mobile_version_check.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/data/repositories/version_check_repository.dart';
import 'package:mobile/features/app_version/cubit/app_version_cubit.dart';
import 'package:mobile/features/app_version/view/app_version_gate.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class _MockVersionCheckRepository extends Mock
    implements VersionCheckRepository {}

class _MockSettingsRepository extends Mock implements SettingsRepository {}

void main() {
  group('AppVersionGate', () {
    late _MockVersionCheckRepository versionCheckRepository;
    late _MockSettingsRepository settingsRepository;

    setUp(() {
      versionCheckRepository = _MockVersionCheckRepository();
      settingsRepository = _MockSettingsRepository();
    });

    testWidgets('renders child immediately before version checks complete', (
      tester,
    ) async {
      final cubit = AppVersionCubit(
        versionCheckRepository: versionCheckRepository,
        settingsRepository: settingsRepository,
      );

      await tester.pumpWidget(_buildTestApp(cubit));

      expect(find.text('Home'), findsOneWidget);
    });

    testWidgets('renders the blocking update screen for required updates', (
      tester,
    ) async {
      when(
        () => versionCheckRepository.checkCurrentVersion(),
      ).thenAnswer(
        (_) async => const MobileVersionCheck(
          platform: 'ios',
          currentVersion: '1.0.0',
          effectiveVersion: '1.3.0',
          minimumVersion: '1.1.0',
          otpEnabled: false,
          storeUrl: 'https://apps.apple.com/app/id1',
          status: MobileUpdateStatus.updateRequired,
          shouldUpdate: true,
          requiresUpdate: true,
        ),
      );
      when(
        () => settingsRepository.getDismissedRecommendedVersion(any()),
      ).thenAnswer((_) async => null);

      final cubit = AppVersionCubit(
        versionCheckRepository: versionCheckRepository,
        settingsRepository: settingsRepository,
      );

      await tester.pumpWidget(_buildTestApp(cubit));
      unawaited(cubit.checkVersion());
      await tester.pumpAndSettle();

      expect(find.text('Update required'), findsOneWidget);
      expect(find.text('Home'), findsNothing);
    });

    testWidgets('shows the recommended update dialog when needed', (
      tester,
    ) async {
      when(
        () => versionCheckRepository.checkCurrentVersion(),
      ).thenAnswer(
        (_) async => const MobileVersionCheck(
          platform: 'android',
          currentVersion: '1.2.0',
          effectiveVersion: '1.3.0',
          minimumVersion: '1.1.0',
          otpEnabled: false,
          storeUrl: 'https://play.google.com/store/apps/details?id=example.app',
          status: MobileUpdateStatus.updateRecommended,
          shouldUpdate: true,
          requiresUpdate: false,
        ),
      );
      when(
        () => settingsRepository.getDismissedRecommendedVersion('android'),
      ).thenAnswer((_) async => null);
      when(
        () => settingsRepository.setDismissedRecommendedVersion(
          'android',
          '1.3.0',
        ),
      ).thenAnswer((_) async {});

      final cubit = AppVersionCubit(
        versionCheckRepository: versionCheckRepository,
        settingsRepository: settingsRepository,
      );

      await tester.pumpWidget(_buildTestApp(cubit));
      unawaited(cubit.checkVersion());
      await tester.pumpAndSettle();

      expect(find.text('Update available'), findsOneWidget);
      expect(find.text('Later'), findsOneWidget);
    });
  });
}

Widget _buildTestApp(AppVersionCubit cubit) {
  return shad.ShadcnApp(
    locale: const Locale('en'),
    localizationsDelegates: const [
      ...AppLocalizations.localizationsDelegates,
      shad.ShadcnLocalizations.delegate,
    ],
    supportedLocales: AppLocalizations.supportedLocales,
    home: BlocProvider.value(
      value: cubit,
      child: const AppVersionGate(child: Text('Home')),
    ),
  );
}
