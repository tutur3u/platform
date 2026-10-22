import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/product_feedback/product_feedback_page.dart';
import 'package:mobile/features/product_feedback/product_feedback_repository.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _Repository extends Mock implements ProductFeedbackRepository {}

const actor = '11111111-1111-4111-8111-111111111111';
const key = '33333333-3333-4333-8333-333333333333';
const pending = 'product-feedback.pending.$actor';
void main() {
  late _Repository repository;
  setUpAll(
    () => registerFallbackValue(
      ProductFeedbackDraft(title: 'fallback', body: 'fallback'),
    ),
  );
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    repository = _Repository();
  });
  Future<void> pump(WidgetTester tester) async {
    await tester.pumpWidget(
      MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(
          body: ProductFeedbackForm(
            actor: actor,
            isCurrent: () => true,
            repository: repository,
            verify: (_) async => 'fresh-token',
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  Future<void> fill(WidgetTester tester) async {
    await tester.enterText(find.byType(TextFormField).at(0), 'Subject');
    await tester.enterText(find.byType(TextFormField).at(1), 'Private details');
    await tester.ensureVisible(
      find.widgetWithText(FilledButton, 'Send feedback'),
    );
    await tester.tap(find.widgetWithText(FilledButton, 'Send feedback'));
    await tester.pumpAndSettle();
  }

  testWidgets('unknown write retains original key, locks the draft and '
      'explicitly retries the same payload', (tester) async {
    final keys = <String>[];
    final drafts = <ProductFeedbackDraft>[];
    when(
      () => repository.submit(
        draft: any(named: 'draft'),
        key: any(named: 'key'),
        token: any(named: 'token'),
      ),
    ).thenAnswer((invocation) async {
      keys.add(invocation.namedArguments[#key] as String);
      drafts.add(invocation.namedArguments[#draft] as ProductFeedbackDraft);
      throw const ApiException(message: 'unavailable', statusCode: 503);
    });
    await pump(tester);
    await fill(tester);
    expect(keys, hasLength(1));
    final preferences = await SharedPreferences.getInstance();
    expect(preferences.getString(pending), keys.single);
    expect(
      tester.widget<TextFormField>(find.byType(TextFormField).first).enabled,
      isFalse,
    );
    await tester.ensureVisible(
      find.widgetWithText(FilledButton, 'Retry same submission'),
    );
    await tester.pumpAndSettle();
    await tester.tap(
      find.widgetWithText(FilledButton, 'Retry same submission'),
    );
    await tester.pumpAndSettle();
    expect(keys, hasLength(2));
    expect(keys.first, keys.last);
    expect(identical(drafts.first, drafts.last), isTrue);
    expect(preferences.getKeys(), {pending});
  });
  testWidgets('restored pending reference only observes on explicit '
      'action; absence never creates another report', (tester) async {
    SharedPreferences.setMockInitialValues({pending: key});
    when(() => repository.receipt(key)).thenAnswer((_) async => null);
    await pump(tester);
    verifyNever(() => repository.receipt(any()));
    expect(
      tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
      isNull,
    );
    await tester.ensureVisible(find.text('Check original receipt'));
    await tester.tap(find.text('Check original receipt'));
    await tester.pumpAndSettle();
    verify(() => repository.receipt(key)).called(1);
    verifyNever(
      () => repository.submit(
        draft: any(named: 'draft'),
        key: any(named: 'key'),
        token: any(named: 'token'),
      ),
    );
    expect((await SharedPreferences.getInstance()).getString(pending), key);
  });
  testWidgets('confirmed receipt clears the original reference and removes '
      'the private form', (tester) async {
    when(
      () => repository.submit(
        draft: any(named: 'draft'),
        key: any(named: 'key'),
        token: any(named: 'token'),
      ),
    ).thenAnswer(
      (_) async =>
          ProductFeedbackReceipt(id: key, createdAt: DateTime.utc(2026)),
    );
    await pump(tester);
    await fill(tester);
    expect(find.text('Feedback received. Your receipt:'), findsOneWidget);
    expect(find.byType(TextFormField), findsNothing);
    expect((await SharedPreferences.getInstance()).getString(pending), isNull);
    expect(find.byType(AppBar), findsNothing);
  });
}
