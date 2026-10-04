import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/meet/data/meet_collaboration_policy.dart';

void main() {
  final editor = Uri.parse(
    'https://meet.example/en/native-collaboration?meetingId=room',
  );
  final policy = MeetCollaborationPolicy(
    editor: editor,
    nonce: 'native-secret',
  );
  ({String action, Object? payload}) authorize(
    List<dynamic> args, {
    Uri? url,
    bool ended = false,
    String admission = 'admitted',
  }) => policy.authorize(
    arguments: args,
    currentUrl: url ?? editor,
    ended: ended,
    admission: admission,
  );

  test('only the admitted room can invoke an allowlisted native action', () {
    expect(authorize(['native-secret', 'document']).action, 'document');
    for (final args in [
      <dynamic>[],
      ['preview-capability', 'document'],
      [
        'native-secret',
        'fetch',
        {'url': '/api/admin'},
      ],
      ['native-secret', 'document', null, 'extra'],
    ]) {
      expect(
        () => authorize(args),
        throwsA(anyOf(isA<StateError>(), isA<FormatException>())),
      );
    }
    expect(
      () => authorize(['native-secret', 'document'], ended: true),
      throwsStateError,
    );
    expect(
      () => authorize(['native-secret', 'document'], admission: 'waiting'),
      throwsStateError,
    );
  });
  test('denies external origins, alternate rooms and unrelated app paths', () {
    for (final url in [
      Uri.parse('https://evil.example/en/native-collaboration?meetingId=room'),
      Uri.parse('https://meet.example/en/native-collaboration?meetingId=other'),
      Uri.parse('https://meet.example/api/admin?meetingId=room'),
      Uri.parse('http://meet.example/en/native-collaboration?meetingId=room'),
    ]) {
      expect(policy.allowsNavigation(url), isFalse);
      expect(
        () => authorize(['native-secret', 'document'], url: url),
        throwsStateError,
      );
    }
    expect(
      policy.allowsNavigation(editor.replace(fragment: 'removed-nonce')),
      isTrue,
    );
  });
  test('unsupported and malformed navigation always returns a denial', () {
    for (final raw in [
      null,
      'about:blank',
      'data:text/html,x',
      'javascript:alert(1)',
      'file:///tmp/editor',
      '//meet.example/en/native-collaboration',
      'https:/en/native-collaboration',
      'https://meet.example:invalid/',
    ]) {
      expect(policy.allowsNavigationRequest(raw, isMainFrame: true), isFalse);
      expect(policy.allowsNavigationRequest(raw, isMainFrame: false), isFalse);
    }
    for (final raw in ['about:blank', 'data:text/html,x', 'https:/no-host']) {
      expect(policy.allowsNavigation(Uri.parse(raw)), isFalse);
    }
    expect(
      policy.allowsNavigationRequest(editor.toString(), isMainFrame: true),
      isTrue,
    );
    expect(
      policy.allowsNavigationRequest(
        'http://127.0.0.1:3000/preview',
        isMainFrame: false,
      ),
      isTrue,
    );
    expect(
      policy.allowsNavigationRequest(
        'https://evil.example/editor',
        isMainFrame: true,
      ),
      isFalse,
    );
  });
  test('bounds UTF-8 bytes and rejects malformed run identifiers', () {
    expect(
      () => authorize(['native-secret', 'checkpoint', '界' * 1000001]),
      throwsFormatException,
    );
    expect(
      () => authorize([
        'native-secret',
        'readRun',
        {'id': '-' * 36},
      ]),
      throwsFormatException,
    );
    final payload = {'id': 'c2d0ff76-8196-4cce-a9ca-1c447df23b67'};
    expect(authorize(['native-secret', 'readRun', payload]).payload, payload);
  });
}
