import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/features/desktop_update/desktop_release.dart';
import 'package:mobile/features/desktop_update/desktop_update_repository.dart';

Map<String, dynamic> fixture({String tag = 'desktop-v0.10.1-200'}) => {
  'draft': false,
  'prerelease': true,
  'tag_name': tag,
  'html_url': 'https://github.com/tutur3u/platform/releases/tag/$tag',
  'assets': desktopAssets.values
      .map(
        (name) => <String, dynamic>{
          'name': name,
          'state': 'uploaded',
          'browser_download_url':
              'https://github.com/tutur3u/platform/releases/download/$tag/$name',
          'size': 3,
          'digest': 'sha256:${sha256.convert([1, 2, 3])}',
        },
      )
      .toList(),
};

void main() {
  group('release trust boundary', () {
    test('accepts complete beta release and same-version newer build', () {
      final release = DesktopRelease.parse(fixture(), 'macos')!;
      expect(release.newerThan('0.10.1', '199'), isTrue);
      expect(release.newerThan('0.10.1', '200'), isFalse);
      expect(release.newerThan('0.10.2', '100'), isFalse);
      expect(release.newerThan('0.9.9', '900'), isTrue);
      expect(release.newerThan('invalid', '100'), isFalse);
      expect(release.newerThan('0.10.1', ''), isFalse);
    });

    test(
      'accepts independently published platforms without inventing others',
      () {
        final value = fixture();
        value['assets'] = (value['assets'] as List<Map<String, dynamic>>)
            .where((item) => item['name'] == desktopAssets['linux'])
            .toList();
        expect(DesktopRelease.parse(value, 'linux'), isNotNull);
        expect(DesktopRelease.parse(value, 'macos'), isNull);
        value['assets'] = <Object>[];
        expect(DesktopRelease.parse(value, 'linux'), isNull);
      },
    );

    test('rejects drafts, stable releases and foreign repositories', () {
      for (final patch in [
        {'draft': true},
        {'prerelease': false},
        {
          'html_url':
              'https://github.com/other/repository/releases/tag/desktop-v0.10.1-200',
        },
        {'tag_name': '../../escape'},
      ]) {
        expect(DesktopRelease.parse({...fixture(), ...patch}, 'linux'), isNull);
      }
    });

    test('rejects absent, duplicate, malformed and oversized packages', () {
      for (final mode in ['duplicate', 'url', 'size', 'digest']) {
        final value = fixture();
        final assets = value['assets'] as List<Map<String, dynamic>>;
        switch (mode) {
          case 'duplicate':
            assets.add({...assets.first});
          case 'url':
            assets.first['browser_download_url'] = 'https://evil.test/file';
          case 'size':
            assets.first['size'] = 3 * 1024 * 1024 * 1024;
          case 'digest':
            assets.first['digest'] = 'sha256:unverified';
        }
        expect(DesktopRelease.parse(value, 'macos'), isNull, reason: mode);
      }
    });
  });

  group('verified downloads', () {
    late Directory directory;
    setUp(
      () async =>
          directory = await Directory.systemTemp.createTemp('update-test-'),
    );
    tearDown(() => directory.delete(recursive: true));

    test(
      'downloads, verifies and reuses cached package without network',
      () async {
        var requests = 0;
        final repository = DesktopUpdateRepository(
          directory: directory,
          client: MockClient((request) async {
            requests++;
            if (request.url.host == 'api.github.com') {
              return http.Response(jsonEncode([fixture()]), 200);
            }
            return http.Response.bytes([1, 2, 3], 200);
          }),
        );
        addTearDown(repository.close);
        final release = (await repository.latest('linux'))!;
        final package = await repository.download(release);
        expect(await package.readAsBytes(), [1, 2, 3]);
        expect(await repository.verified(release), isTrue);
        await repository.download(release);
        expect(requests, 2);
        await package.writeAsBytes([3, 2, 1]);
        expect(await repository.verified(release), isFalse);
        await repository.download(release);
        expect(requests, 3);
      },
    );

    test(
      'retains only verified release cache and preserves unrelated files',
      () async {
        final repository = DesktopUpdateRepository(
          directory: directory,
          client: MockClient((_) async => http.Response.bytes([1, 2, 3], 200)),
        );
        addTearDown(repository.close);
        final old = Directory('${directory.path}/desktop-v0.10.1-100');
        await old.create();
        final unrelated = File('${directory.path}/notes.txt');
        await unrelated.writeAsString('keep');
        final release = DesktopRelease.parse(fixture(), 'linux')!;
        await repository.download(release);
        expect(old.existsSync(), isFalse);
        expect(unrelated.existsSync(), isTrue);
        expect(repository.package(release).existsSync(), isTrue);
      },
    );

    test('rejects checksum mismatch and removes incomplete data', () async {
      final repository = DesktopUpdateRepository(
        directory: directory,
        client: MockClient((_) async => http.Response.bytes([3, 2, 1], 200)),
      );
      addTearDown(repository.close);
      final release = DesktopRelease.parse(fixture(), 'linux')!;
      await expectLater(repository.download(release), throwsFormatException);
      expect(repository.package(release).existsSync(), isFalse);
      expect(
        File('${repository.package(release).path}.part').existsSync(),
        isFalse,
      );
    });

    test('rejects redirect to unrelated host before requesting it', () async {
      var requests = 0;
      final repository = DesktopUpdateRepository(
        directory: directory,
        client: MockClient((_) async {
          requests++;
          return http.Response(
            '',
            302,
            headers: {'location': 'https://evil.test/update'},
          );
        }),
      );
      addTearDown(repository.close);
      await expectLater(
        repository.download(DesktopRelease.parse(fixture(), 'linux')!),
        throwsFormatException,
      );
      expect(requests, 1);
    });

    test('finds desktop updates beyond the first 100 releases', () async {
      var requests = 0;
      final repository = DesktopUpdateRepository(
        directory: directory,
        client: MockClient((request) async {
          requests++;
          expect(request.url.queryParameters['page'], '$requests');
          return http.Response(
            jsonEncode(
              requests <= 11
                  ? List.generate(
                      10,
                      (_) => {'draft': false, 'prerelease': false},
                    )
                  : [fixture()],
            ),
            200,
          );
        }),
      );
      addTearDown(repository.close);
      expect((await repository.latest('linux'))?.tag, 'desktop-v0.10.1-200');
      expect(requests, 12);
    });

    test('rejects truncated or oversized chunked bodies', () async {
      for (final bytes in [
        [1],
        [1, 2, 3, 4],
      ]) {
        final repository = DesktopUpdateRepository(
          directory: directory,
          client: MockClient.streaming(
            (_, _) async => http.StreamedResponse(Stream.value(bytes), 200),
          ),
        );
        addTearDown(repository.close);
        final release = DesktopRelease.parse(fixture(), 'linux')!;
        await expectLater(repository.download(release), throwsFormatException);
        expect(
          File('${repository.package(release).path}.part').existsSync(),
          isFalse,
        );
      }
    });

    test('rejects truncated or oversized download bodies', () async {
      for (final bytes in [
        [1],
        [1, 2, 3, 4],
      ]) {
        final repository = DesktopUpdateRepository(
          directory: directory,
          client: MockClient((_) async => http.Response.bytes(bytes, 200)),
        );
        addTearDown(repository.close);
        await expectLater(
          repository.download(DesktopRelease.parse(fixture(), 'linux')!),
          throwsA(isA<HttpException>()),
        );
      }
    });
  });
}
