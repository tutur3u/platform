import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

Future<String> resolveTaskDescriptionVideoUrl(
  String url,
  Map<String, String>? headers,
) async {
  if (url.contains('/sign/') ||
      url.contains('token=') ||
      url.contains('signature=')) {
    return url;
  }

  if (url.contains('.supabase.co/storage/v1/object/public/')) {
    return url;
  }

  if (url.contains('/storage/share') ||
      (url.contains('/api/v1/') && url.contains('path='))) {
    try {
      final internalUri = Uri.parse(url);

      final httpClient = HttpClient();
      try {
        final request = await httpClient
            .openUrl('HEAD', internalUri)
            .timeout(const Duration(seconds: 10));
        request
          ..followRedirects = false
          ..maxRedirects = 0;
        for (final entry in {...?headers, 'Accept': '*/*'}.entries) {
          request.headers.set(entry.key, entry.value);
        }

        final response = await request.close().timeout(
          const Duration(seconds: 10),
        );

        final location = response.headers.value(HttpHeaders.locationHeader);
        if (location != null && location.isNotEmpty) {
          return sanitizeResolvedTaskDescriptionVideoUrl(
                internalUri.resolve(location).toString(),
              ) ??
              url;
        }
      } finally {
        httpClient.close(force: true);
      }

      final headResponse = await http
          .head(
            internalUri,
            headers: {
              ...?headers,
              'Accept': '*/*',
            },
          )
          .timeout(const Duration(seconds: 10));

      final sanitizedHeadUrl = sanitizeResolvedTaskDescriptionVideoUrl(
        headResponse.request?.url.toString(),
      );
      if (sanitizedHeadUrl != null) {
        return sanitizedHeadUrl;
      }

      if (headResponse.statusCode == 200) {
        final client = http.Client();
        try {
          final request = http.Request('GET', internalUri)
            ..headers.addAll({
              ...?headers,
              'Accept': '*/*',
              'Range': 'bytes=0-0',
            });
          final getResponse = await client
              .send(request)
              .timeout(const Duration(seconds: 30));

          final redirectedGetUrl = sanitizeResolvedTaskDescriptionVideoUrl(
            getResponse.request?.url.toString(),
          );
          if (redirectedGetUrl != null) {
            return redirectedGetUrl;
          }

          final contentType = getResponse.headers['content-type'] ?? '';
          if (contentType.contains('application/json')) {
            try {
              final body = await getResponse.stream.bytesToString();
              final decoded = jsonDecode(body);
              if (decoded is Map) {
                for (final key in const ['signedUrl', 'url', 'downloadUrl']) {
                  final candidate = decoded[key];
                  if (candidate is String && candidate.isNotEmpty) {
                    return candidate;
                  }
                }
              }
            } on FormatException {
              // Not valid JSON, fall through.
            }
          }
        } finally {
          client.close();
        }
      }
    } on Exception catch (error) {
      debugPrint('Failed to resolve video URL: $error');
    }
  }

  return url;
}

String? sanitizeResolvedTaskDescriptionVideoUrl(String? resolvedUrl) {
  if (resolvedUrl == null || resolvedUrl.isEmpty) {
    return null;
  }
  if (resolvedUrl.contains('10.0.2.2')) {
    return null;
  }
  return resolvedUrl;
}
