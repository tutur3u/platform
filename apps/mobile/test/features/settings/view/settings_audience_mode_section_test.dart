import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/audience_mode/audience_mode.dart';
import 'package:mobile/features/audience_mode/audience_mode_cubit.dart';
import 'package:mobile/features/settings/view/settings_audience_mode_section.dart';

import '../../../helpers/pump_app.dart';
import '../../audience_mode/audience_mode_fakes.dart';

void main() {
  Future<void> pumpSection(
    WidgetTester tester, {
    required bool admin,
    bool personal = false,
    AudienceModeCubit? cubit,
  }) async {
    await tester.pumpThemedHome(
      Material(
        child: SingleChildScrollView(
          child: cubit == null
              ? SettingsAudienceModeSection(
                  canManageWorkspaceSettings: admin,
                  isPersonalWorkspace: personal,
                )
              : BlocProvider.value(
                  value: cubit,
                  child: SettingsAudienceModeSection(
                    canManageWorkspaceSettings: admin,
                    isPersonalWorkspace: personal,
                  ),
                ),
        ),
      ),
    );
    await tester.pump();
  }

  Future<AudienceModeCubit> boundCubit(
    FakeAudienceModeRepository repository,
    String wsId,
  ) async {
    final cubit = AudienceModeCubit(
      repository: repository,
      store: MemoryAudienceModeStore(),
    );
    addTearDown(cubit.close);
    await cubit.bind(userId: 'u1', wsId: wsId);
    return cubit;
  }

  testWidgets('members see their mode and what the default resolves to', (
    tester,
  ) async {
    final repository = FakeAudienceModeRepository()
      ..defaults['ec'] = AudienceMode.education;
    await pumpSection(
      tester,
      admin: false,
      cubit: await boundCubit(repository, 'ec'),
    );
    expect(find.text('Mode'), findsOneWidget);
    expect(find.text('Your mode here'), findsOneWidget);
    expect(find.text('Workspace default (Education)'), findsOneWidget);
    expect(find.text('Default for members'), findsNothing);
  });

  testWidgets('admins also set the default for members', (tester) async {
    final repository = FakeAudienceModeRepository();
    await pumpSection(
      tester,
      admin: true,
      cubit: await boundCubit(repository, 'ec'),
    );
    expect(find.text('Default for members'), findsOneWidget);
    expect(find.text('Not set'), findsOneWidget);
  });

  testWidgets('a personal workspace has no member default', (tester) async {
    final repository = FakeAudienceModeRepository()
      ..account = AudienceMode.education;
    await pumpSection(
      tester,
      admin: true,
      personal: true,
      cubit: await boundCubit(repository, 'personal'),
    );
    expect(find.text('Default for members'), findsNothing);
    expect(find.text('Your default (Education)'), findsOneWidget);
  });

  testWidgets('renders nothing before a workspace is bound', (tester) async {
    await pumpSection(tester, admin: true);
    expect(find.text('Mode'), findsNothing);
  });
}
