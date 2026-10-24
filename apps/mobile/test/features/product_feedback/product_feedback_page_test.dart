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
    // The form uses the 480px form width, so give the whole flow room to
    // build without depending on lazy off-screen list children.
    tester.view
      ..devicePixelRatio = 1
      ..physicalSize = const Size(800, 1400);
    addTearDown(tester.view.reset);
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
  for (final unknown in [
    const ApiException(message: 'unavailable', statusCode: 503),
    Exception('transport acknowledgement lost'),
  ]) {
    for (final status in [400, 401, 403, 413, 429]) {
      testWidgets('$unknown then rejected retry $status keeps the original '
          'reference through absence and further dispatch', (tester) async {
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
          if (keys.length == 1) throw unknown;
          throw ApiException(message: 'retry denied', statusCode: status);
        });
        await pump(tester);
        await fill(tester);
        final original = keys.single;
        final preferences = await SharedPreferences.getInstance();
        when(() => repository.receipt(original)).thenAnswer((_) async => null);
        Future<void> retry() async {
          final button = find.widgetWithText(
            FilledButton,
            'Retry same submission',
          );
          await tester.ensureVisible(button);
          await tester.pumpAndSettle();
          await tester.tap(button);
          await tester.pumpAndSettle();
        }

        await retry();
        await tester.drag(find.byType(ListView), const Offset(0, -1000));
        await tester.pumpAndSettle();
        expect(find.text('Edit rejected submission'), findsNothing);
        expect(preferences.getString(pending), original);
        expect(
          tester
              .widget<TextFormField>(find.byType(TextFormField).first)
              .enabled,
          isFalse,
        );
        await tester.ensureVisible(find.text('Check original receipt'));
        await tester.tap(find.text('Check original receipt'));
        await tester.pumpAndSettle();
        verify(() => repository.receipt(original)).called(1);
        expect(preferences.getString(pending), original);
        await retry();
        expect(keys, [original, original, original]);
        expect(drafts.every((draft) => identical(draft, drafts.first)), isTrue);
        expect(find.text('Edit rejected submission'), findsNothing);
        expect(preferences.getKeys(), {pending});
      });
    }
  }
  for (final status in [400, 401, 403, 413, 429]) {
    testWidgets('initial definitive rejection $status still permits editing', (
      tester,
    ) async {
      when(
        () => repository.submit(
          draft: any(named: 'draft'),
          key: any(named: 'key'),
          token: any(named: 'token'),
        ),
      ).thenThrow(ApiException(message: 'rejected', statusCode: status));
      await pump(tester);
      await fill(tester);
      expect(
        (await SharedPreferences.getInstance()).getString(pending),
        isNotNull,
      );
      await tester.scrollUntilVisible(
        find.text('Edit rejected submission'),
        200,
        scrollable: find
            .descendant(
              of: find.byType(ListView),
              matching: find.byType(Scrollable),
            )
            .first,
      );
      await tester.tap(find.text('Edit rejected submission'));
      await tester.pumpAndSettle();
      expect(
        (await SharedPreferences.getInstance()).getString(pending),
        isNull,
      );
      expect(
        tester.widget<TextFormField>(find.byType(TextFormField).first).enabled,
        isTrue,
      );
      expect(
        find.widgetWithText(FilledButton, 'Send feedback'),
        findsOneWidget,
      );
    });
  }
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
