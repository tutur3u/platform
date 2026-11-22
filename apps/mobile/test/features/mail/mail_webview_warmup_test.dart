import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/mail/view/mail_page.dart';
import 'package:mobile/features/mail/view/mail_webview_warmup.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/phone_surface.dart';
import '../../helpers/pump_app.dart';

class _Repository extends Mock implements MailRepository {}

void main() {
  usePhoneSurface();
  final platformEngine = MailWebViewWarmup.engine;
  var loads = 0;

  setUp(() {
    loads = 0;
    MailWebViewWarmup.reset();
    MailWebViewWarmup.engine = () async => loads++;
  });
  tearDown(() {
    MailWebViewWarmup.reset();
    MailWebViewWarmup.engine = platformEngine;
  });

  test('the engine loads once however often it is asked for', () async {
    await Future.wait([MailWebViewWarmup.start(), MailWebViewWarmup.start()]);
    await MailWebViewWarmup.start();
    expect(loads, 1);
  });

  test('a platform without a WebView is not an error', () async {
    MailWebViewWarmup.engine = () async => throw UnimplementedError();
    await expectLater(MailWebViewWarmup.start(), completes);
  });

  testWidgets('the engine loads after the first inbox result, not before', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({});
    final repository = _Repository();
    final inbox = Completer<void>();
    when(() => repository.savedView(any())).thenAnswer((_) async => null);
    when(() => repository.saveView(any(), any())).thenAnswer((_) async {});
    when(() => repository.bootstrap('ws')).thenAnswer(
      (_) async => {
        'mailboxes': [
          {'id': 'box', 'address': 'me@tuturuuu.com'},
        ],
      },
    );
    when(
      () => repository.organization('ws', 'box'),
    ).thenAnswer((_) async => <String, dynamic>{});
    when(
      () => repository.list(
        'ws',
        'box',
        folder: any(named: 'folder'),
        query: any(named: 'query'),
        page: any(named: 'page'),
        label: any(named: 'label'),
        folderId: any(named: 'folderId'),
        forceRefresh: any(named: 'forceRefresh'),
      ),
    ).thenAnswer((_) async {
      await inbox.future;
      return {
        'threads': <dynamic>[],
        'pagination': {'hasMore': false},
      };
    });
    await tester.pumpApp(
      MailWorkspace(workspaceId: 'ws', repository: repository),
    );
    await tester.pump(const Duration(milliseconds: 200));
    // Nothing loads while the inbox is still on its way.
    expect(loads, 0);
    inbox.complete();
    await tester.pumpAndSettle();
    verify(
      () => repository.list(
        'ws',
        'box',
        folder: any(named: 'folder'),
        query: any(named: 'query'),
        page: any(named: 'page'),
        label: any(named: 'label'),
        folderId: any(named: 'folderId'),
        forceRefresh: any(named: 'forceRefresh'),
      ),
    ).called(greaterThan(0));
    expect(loads, 1);
    expect(tester.takeException(), isNull);
  });
}
