import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/safe_error_diagnostics.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/widgets/internal_diagnostics_copy.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show User;

import '../helpers/pump_app.dart';

class TestAuth extends Cubit<AuthState> implements AuthCubit {
  TestAuth(super.initialState);
  void change(AuthState state) => emit(state);
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

User user({
  String id = 'synthetic-a',
  String email = 'agent@tuturuuu.com',
  bool confirmed = true,
}) => User(
  id: id,
  appMetadata: const {},
  userMetadata: const {},
  aud: 'authenticated',
  createdAt: '2026-01-01T00:00:00Z',
  email: email,
  emailConfirmedAt: confirmed ? '2026-01-01T00:00:00Z' : null,
);

void main() {
  const diagnostics = SafeErrorDiagnostics.streamFailure();
  final copied = <String>[];
  setUp(() {
    copied.clear();
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform, (call) async {
          if (call.method == 'Clipboard.setData') {
            copied.add((call.arguments as Map)['text'] as String);
          }
          return null;
        });
  });
  tearDown(
    () => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(SystemChannels.platform, null),
  );

  Future<void> render(
    WidgetTester tester,
    TestAuth auth, {
    String? owner,
  }) async {
    await tester.pumpApp(
      BlocProvider<AuthCubit>.value(
        value: auth,
        child: Scaffold(
          body: InternalDiagnosticsCopy(
            diagnostics: diagnostics,
            userId: owner,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('missing auth provider is safe and hides copy', (tester) async {
    await tester.pumpApp(
      const Scaffold(body: InternalDiagnosticsCopy(diagnostics: diagnostics)),
    );
    await tester.pumpAndSettle();
    expect(find.byType(IconButton), findsNothing);
  });
  testWidgets(
    'only confirmed internal authenticated owner can copy fixed fields',
    (tester) async {
      final auth = TestAuth(AuthState.authenticated(user()));
      addTearDown(auth.close);
      await render(tester, auth, owner: 'synthetic-a');
      await tester.tap(find.byType(IconButton));
      expect(copied, [diagnostics.summary]);
      expect(copied.single, isNot(contains('agent@')));
      for (final state in [
        AuthState.authenticated(user(email: 'outside@example.test')),
        AuthState.authenticated(user(confirmed: false)),
        AuthState.mfaRequired(user()),
        const AuthState.unauthenticated(),
        AuthState.authenticated(user(id: 'synthetic-b')),
      ]) {
        auth.change(state);
        await tester.pumpAndSettle();
        expect(find.byType(IconButton), findsNothing);
      }
    },
  );
  testWidgets('same actor email and confirmation changes revoke copy', (
    tester,
  ) async {
    final auth = TestAuth(AuthState.authenticated(user()));
    addTearDown(auth.close);
    await render(tester, auth);
    final callback = tester
        .widget<IconButton>(find.byType(IconButton))
        .onPressed!;
    auth.change(AuthState.authenticated(user(email: 'outside@example.test')));
    expect(auth.state.user?.email, 'outside@example.test');
    callback();
    expect(copied, isEmpty);
    await tester.pumpAndSettle();
    expect(find.byType(IconButton), findsNothing);
    auth.change(AuthState.authenticated(user()));
    await tester.pumpAndSettle();
    expect(find.byType(IconButton), findsOneWidget);
    auth.change(AuthState.authenticated(user(confirmed: false)));
    expect(auth.state.user?.emailConfirmedAt, isNull);
    await tester.pumpAndSettle();
    expect(find.byType(IconButton), findsNothing);
  });
  testWidgets(
    'logout and actor changes reject stale callbacks before rebuild',
    (tester) async {
      final auth = TestAuth(AuthState.authenticated(user()));
      addTearDown(auth.close);
      await render(tester, auth);
      final callback = tester
          .widget<IconButton>(find.byType(IconButton))
          .onPressed!;
      auth.change(const AuthState.unauthenticated());
      callback();
      expect(copied, isEmpty);
      await tester.pumpAndSettle();
      expect(find.byType(IconButton), findsNothing);
      auth.change(AuthState.authenticated(user(id: 'synthetic-b')));
      callback();
      expect(copied, isEmpty);
      await tester.pumpAndSettle();
    },
  );
}
