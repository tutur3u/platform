import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:http/http.dart' as http;
import 'package:mobile/features/desktop_update/desktop_release.dart';

class DesktopUpdateRepository {
  DesktopUpdateRepository({required this.directory, http.Client? client})
    : _client = client ?? http.Client();

  final Directory directory;
  final http.Client _client;

  Future<DesktopRelease?> latest(String platform) async {
    final response = await _client
        .get(
          Uri.https(
            'api.github.com',
            '/repos/$desktopReleaseRepository/releases',
            {'per_page': '100'},
          ),
          headers: {'Accept': 'application/vnd.github+json'},
        )
        .timeout(const Duration(seconds: 20));
    if (response.statusCode != 200 ||
        response.bodyBytes.length > 4 * 1024 * 1024) {
      throw const HttpException('Desktop release metadata unavailable');
    }
    final data = jsonDecode(response.body);
    if (data is! List<dynamic>) throw const FormatException('Invalid releases');
    final releases =
        data
            .map((value) => DesktopRelease.parse(value, platform))
            .whereType<DesktopRelease>()
            .toList()
          ..sort((a, b) => b.run.compareTo(a.run));
    return releases.firstOrNull;
  }

  File package(DesktopRelease release) =>
      File('${directory.path}/${release.tag}/${release.name}');

  Future<bool> verified(DesktopRelease release) async {
    final file = package(release);
    if (!file.existsSync() || await file.length() != release.size) {
      return false;
    }
    return (await sha256.bind(file.openRead()).first).toString() ==
        release.digest;
  }

  Future<File> download(DesktopRelease release) async {
    final file = package(release);
    if (await verified(release)) {
      await _pruneOtherReleases(release);
      return file;
    }
    await file.parent.create(recursive: true);
    final partial = File('${file.path}.part');
    try {
      var uri = release.url;
      http.StreamedResponse? response;
      for (var redirects = 0; redirects < 5; redirects++) {
        if (!_allowedDownload(uri)) {
          throw const FormatException('Unsafe redirect');
        }
        response = await _client
            .send(http.Request('GET', uri)..followRedirects = false)
            .timeout(const Duration(seconds: 30));
        if (![301, 302, 303, 307, 308].contains(response.statusCode)) break;
        final location = response.headers['location'];
        await response.stream.listen((_) {}).cancel();
        if (location == null) throw const FormatException('Missing redirect');
        uri = uri.resolve(location);
        response = null;
      }
      if (response == null ||
          response.statusCode != 200 ||
          (response.contentLength != null &&
              response.contentLength != release.size)) {
        if (response != null) await response.stream.listen((_) {}).cancel();
        throw const HttpException('Desktop download unavailable');
      }
      final sink = partial.openWrite();
      var received = 0;
      try {
        await sink.addStream(
          response.stream.timeout(const Duration(seconds: 30)).map((bytes) {
            received += bytes.length;
            if (received > release.size) {
              throw const FormatException('Oversized update');
            }
            return bytes;
          }),
        );
      } finally {
        await sink.close();
      }
      if (received != release.size ||
          (await sha256.bind(partial.openRead()).first).toString() !=
              release.digest) {
        throw const FormatException('Update integrity check failed');
      }
      final completed = await partial.rename(file.path);
      await _pruneOtherReleases(release);
      return completed;
    } on Object {
      if (partial.existsSync()) await partial.delete();
      rethrow;
    }
  }

  Future<void> _pruneOtherReleases(DesktopRelease keep) async {
    // This directory belongs exclusively to the updater. Do not follow links
    // or remove unrecognized user files. Retain only the current verified tag.
    await for (final entity in directory.list(followLinks: false)) {
      final name = entity.uri.pathSegments
          .where((part) => part.isNotEmpty)
          .last;
      if (entity is Directory &&
          name != keep.tag &&
          RegExp(r'^desktop-v\d+\.\d+\.\d+-\d+$').hasMatch(name)) {
        try {
          await entity.delete(recursive: true);
        } on FileSystemException {
          // Retention failure must not invalidate an already verified update.
        }
      }
    }
  }

  static bool _allowedDownload(Uri uri) =>
      uri.scheme == 'https' &&
      uri.userInfo.isEmpty &&
      uri.port == 443 &&
      {
        'github.com',
        'release-assets.githubusercontent.com',
        'objects.githubusercontent.com',
      }.contains(uri.host);

  void close() => _client.close();
}
