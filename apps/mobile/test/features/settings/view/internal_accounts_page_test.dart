import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/repositories/internal_account_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/settings/view/internal_account_editor.dart';
import 'package:mobile/features/settings/view/internal_accounts_page.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/helpers.dart';

class _Repository extends Mock implements InternalAccountRepository {}

const _account = InternalAccount(
  id: 'target',
  email: 'target@tuturuuu.com',
  isDisabled: false,
  isSelf: false,
  displayName: 'Target',
);

InternalAccountPage _page(List<InternalAccount> accounts) =>
    InternalAccountPage(
      accounts: accounts,
      count: accounts.length,
      nextCursor: null,
    );

void main() {
  late _Repository repository;
  setUp(() {
    repository = _Repository();
    when(
      () => repository.list(
        query: any(named: 'query'),
        cursor: any(named: 'cursor'),
      ),
    ).thenAnswer((_) async => _page([_account]));
  });

  testWidgets('shows account actions after expanding the account', (
    tester,
  ) async {
    await tester.pumpApp(InternalAccountsPage(repository: repository));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Target'));
    await tester.pumpAndSettle();
    expect(find.text('Reset password'), findsOneWidget);
    expect(find.text('Reset authenticators'), findsOneWidget);
    expect(find.text('Disable access'), findsOneWidget);
    expect(find.text('Edit profile'), findsOneWidget);
  });

  testWidgets('does not offer self password or access administration', (
    tester,
  ) async {
    when(() => repository.list()).thenAnswer(
      (_) async => _page([
        const InternalAccount(
          id: 'self',
          email: 'self@tuturuuu.com',
          isDisabled: false,
          isSelf: true,
        ),
      ]),
    );
    await tester.pumpApp(InternalAccountsPage(repository: repository));
    await tester.pumpAndSettle();
    await tester.tap(find.text('self@tuturuuu.com').first);
    await tester.pumpAndSettle();
    expect(find.text('Reset password'), findsNothing);
    expect(find.text('Reset authenticators'), findsNothing);
    expect(find.text('Disable access'), findsNothing);
    expect(find.text('Edit profile'), findsOneWidget);
  });

  testWidgets('shows a bounded permission error without provider details', (
    tester,
  ) async {
    when(() => repository.list()).thenThrow(
      const ApiException(message: 'private provider details', statusCode: 403),
    );
    await tester.pumpApp(InternalAccountsPage(repository: repository));
    await tester.pumpAndSettle();
    expect(find.textContaining('Unable to load accounts'), findsOneWidget);
    expect(find.textContaining('private provider'), findsNothing);
    expect(find.text('Target'), findsNothing);
  });

  testWidgets('does not display stale results after the query changes', (
    tester,
  ) async {
    final initial = Completer<InternalAccountPage>();
    when(() => repository.list()).thenAnswer((_) => initial.future);
    when(
      () => repository.list(query: 'new'),
    ).thenAnswer((_) async => _page([]));
    await tester.pumpApp(InternalAccountsPage(repository: repository));
    await tester.enterText(find.byType(TextField), 'new');
    initial.complete(_page([_account]));
    await tester.pump(const Duration(milliseconds: 350));
    await tester.pumpAndSettle();
    expect(find.text('Target'), findsNothing);
    expect(find.text('No accounts found'), findsOneWidget);
  });

  testWidgets('validates exact confirmation and password before sending', (
    tester,
  ) async {
    await tester.pumpApp(
      InternalAccountEditor(
        account: _account,
        action: InternalAccountEdit.password,
        repository: repository,
      ),
    );
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byType(TextFormField).first,
      'other@tuturuuu.com',
    );
    await tester.enterText(find.byType(TextFormField).last, 'short');
    await tester.tap(find.text('Save changes'));
    await tester.pumpAndSettle();
    verifyNever(
      () => repository.resetPassword(
        _account,
        password: any(named: 'password'),
        confirmationEmail: any(named: 'confirmationEmail'),
      ),
    );
    expect(find.text('Type the account email to confirm'), findsWidgets);
  });

  testWidgets('prevents duplicate password resets while saving', (
    tester,
  ) async {
    final pending = Completer<InternalAccount>();
    when(
      () => repository.resetPassword(
        _account,
        password: 'test-only-password',
        confirmationEmail: _account.email,
      ),
    ).thenAnswer((_) => pending.future);
    await tester.pumpApp(
      InternalAccountEditor(
        account: _account,
        action: InternalAccountEdit.password,
        repository: repository,
      ),
    );
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextFormField).first, _account.email);
    await tester.enterText(
      find.byType(TextFormField).last,
      'test-only-password',
    );
    await tester.tap(find.text('Save changes'));
    await tester.pump();
    expect(
      tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
      isNull,
    );
    verify(
      () => repository.resetPassword(
        _account,
        password: 'test-only-password',
        confirmationEmail: _account.email,
      ),
    ).called(1);
    pending.completeError(
      const ApiException(message: 'failed', statusCode: 503),
    );
    await tester.pumpAndSettle();
    expect(
      find.text('The change could not be saved. Try again.'),
      findsOneWidget,
    );
  });
}
