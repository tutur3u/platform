import 'dart:convert';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/data/models/documents/workspace_document.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/document_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/documents/document_media_upload.dart';
import 'package:mobile/features/documents/document_mentions.dart';
import 'package:mobile/features/documents/view/document_detail_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/helpers.dart';

class _Workspace extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

class _Repository extends Mock implements DocumentRepository {}

class _Api extends Mock implements ApiClient {}

Map<String, dynamic> _p(String value) => {
  'type': 'paragraph',
  'attrs': {'textAlign': null},
  'content': [
    {'type': 'text', 'text': value},
  ],
};

final Map<String, dynamic> _image = {
  'type': 'imageResize',
  'attrs': {
    'src': '/api/v1/workspaces/ws/storage/share?path=ws%2Fdocuments%2Fa.png',
    'alt': null,
    'title': null,
    'width': 480,
    'height': null,
    'containerStyle': null,
    'wrapperStyle': null,
  },
};

const _members = [
  DocumentMentionOption(
    id: 'u1',
    label: 'Linh',
    type: DocumentMentionType.user,
  ),
  DocumentMentionOption(
    id: 'u2',
    label: 'Minh',
    type: DocumentMentionType.user,
  ),
];

/// Pumps the document page on a phone and returns what it saves.
Future<List<Map<String, dynamic>>> _pump(
  WidgetTester tester,
  List<Map<String, dynamic>> content,
) async {
  tester.view
    ..devicePixelRatio = 1
    ..physicalSize = const Size(390, 844);
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final saved = <Map<String, dynamic>>[];
  final repository = _Repository();
  when(() => repository.getDocument(any(), any())).thenAnswer(
    (_) async => WorkspaceDocument(
      id: 'doc-1',
      name: 'Plan',
      content: jsonEncode({'type': 'doc', 'content': content}),
      isPublic: false,
      updatedAt: '2026-11-19T02:00:00.000Z',
      ownerIsViewer: true,
    ),
  );
  when(
    () => repository.updateDocument(
      any(),
      any(),
      name: any(named: 'name'),
      content: any(named: 'content'),
      isPublic: any(named: 'isPublic'),
    ),
  ).thenAnswer((invocation) async {
    saved.add(
      (invocation.namedArguments[#content] as Map).cast<String, dynamic>(),
    );
  });
  final workspace = _Workspace();
  whenListen(
    workspace,
    const Stream<WorkspaceState>.empty(),
    initialState: const WorkspaceState(
      status: WorkspaceStatus.loaded,
      currentWorkspace: Workspace(id: 'ws', name: 'Studio'),
    ),
  );
  addTearDown(workspace.close);
  await tester.pumpApp(
    BlocProvider<WorkspaceCubit>.value(
      value: workspace,
      child: DocumentDetailPage(
        documentId: 'doc-1',
        repository: repository,
        mentionOptions: (_) async => _members,
      ),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
  return saved;
}

QuillController _editor(WidgetTester tester) =>
    tester.widget<QuillEditor>(find.byType(QuillEditor)).controller;

Future<void> _settle(WidgetTester tester) async {
  await tester.pumpAndSettle();
  await tester.pump(const Duration(seconds: 1));
}

void main() {
  testWidgets('the toolbar inserts a table and edits its cells', (
    tester,
  ) async {
    final saved = await _pump(tester, [_p('Intro')]);
    _editor(tester).updateSelection(
      const TextSelection.collapsed(offset: 5),
      ChangeSource.local,
    );
    await tester.ensureVisible(find.byTooltip('Table'));
    await tester.tap(find.byTooltip('Table'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('document-table-cell-2-2')));
    await tester.tap(find.byKey(const ValueKey('document-table-insert')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const ValueKey('document-table-field-0-0')),
      'Owner',
    );
    await tester.tap(find.byKey(const ValueKey('document-table-done')));
    await _settle(tester);

    final table = (saved.last['content'] as List)[1] as Map;
    expect(table['type'], 'table');
    final rows = table['content'] as List;
    expect(rows, hasLength(2));
    final header = (rows.first as Map)['content'] as List;
    expect(header, hasLength(2));
    expect((header.first as Map)['type'], 'tableHeader');
    expect(jsonEncode(header.first), contains('"text":"Owner"'));
    expect(jsonEncode(header.last), isNot(contains('"text"')));
  });

  testWidgets('typing @ picks a member and writes the web mention', (
    tester,
  ) async {
    final saved = await _pump(tester, [_p('Ask ')]);
    _editor(
      tester,
    ).replaceText(4, 0, '@', const TextSelection.collapsed(offset: 5));
    await tester.pumpAndSettle();
    expect(find.text('Linh'), findsOneWidget);
    await tester.tap(find.text('Linh'));
    await _settle(tester);

    final paragraph = (saved.last['content'] as List).single as Map;
    final inline = paragraph['content'] as List;
    expect((inline[1] as Map)['type'], 'mention');
    expect(((inline[1] as Map)['attrs'] as Map)['userId'], 'u1');
    expect(inline.last, {'type': 'text', 'text': ' '});
    expect(jsonEncode(inline), isNot(contains('@')));
  });

  testWidgets('tapping an image resizes it to a web preset', (tester) async {
    final saved = await _pump(tester, [_image, _p('After')]);
    await tester.tap(find.byKey(const ValueKey('document-image')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('document-image-size-xl')));
    await _settle(tester);

    final image = (saved.last['content'] as List).first as Map;
    expect(image['attrs'], {...(_image['attrs'] as Map), 'width': 800});
  });

  test(
    'uploads go through the workspace storage flow into documents',
    () async {
      final api = _Api();
      when(() => api.postJson(any(), any())).thenAnswer((invocation) async {
        final path = invocation.positionalArguments.first as String;
        if (path.endsWith('/upload-url')) {
          final body = invocation.positionalArguments[1] as Map;
          expect(body['path'], 'documents');
          return {
            'signedUrl': 'https://storage.test/upload',
            'token': 'upload-token',
            'path': 'documents/${body['filename']}',
          };
        }
        expect(path, '/api/v1/workspaces/ws/storage/finalize-upload');
        return <String, dynamic>{};
      });
      when(api.dispose).thenReturn(null);
      final uploads = <http.Request>[];
      final uploader = DocumentMediaUploader(
        api: api,
        httpClient: MockClient((request) async {
          uploads.add(request);
          return http.Response('', 200);
        }),
      );
      final url = await uploader.upload(
        'ws',
        name: 'photo.png',
        bytes: utf8.encode('png'),
      );
      expect(uploads.single.headers['Content-Type'], 'image/png');
      expect(
        url,
        matches(
          RegExp(
            r'^/api/v1/workspaces/ws/storage/share\?path=documents%2F\d+-'
            r'[0-9a-z]{11}\.png$',
          ),
        ),
      );
      uploader.dispose();
    },
  );
}
