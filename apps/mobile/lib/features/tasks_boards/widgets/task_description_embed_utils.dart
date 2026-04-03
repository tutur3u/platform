import 'package:flutter/material.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/core/config/env.dart';
import 'package:mobile/data/sources/supabase_client.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

Widget buildEmbedFallback(
  BuildContext context, {
  required shad.ThemeData theme,
  required IconData icon,
  required String label,
}) {
  return Container(
    height: 72,
    decoration: BoxDecoration(
      color: theme.colorScheme.secondary.withValues(alpha: 0.25),
      borderRadius: BorderRadius.circular(8),
      border: Border.all(
        color: theme.colorScheme.border.withValues(alpha: 0.6),
      ),
    ),
    child: Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(icon, size: 20, color: theme.colorScheme.mutedForeground),
        const SizedBox(width: 8),
        Flexible(
          child: Text(
            label,
            style: theme.typography.small.copyWith(
              color: theme.colorScheme.mutedForeground,
            ),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ),
      ],
    ),
  );
}

String resolveTaskDescriptionUrl(String value) {
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return value;
  }

  if (value.startsWith('/')) {
    return '${ApiConfig.baseUrl}$value';
  }

  return value;
}

Map<String, String>? taskDescriptionAuthHeaders() {
  final token = currentSessionAccessToken();
  if (token == null || token.isEmpty) {
    return null;
  }

  return {'Authorization': 'Bearer $token'};
}

String? currentSessionAccessToken() {
  return maybeSupabase?.auth.currentSession?.accessToken;
}

Map<String, String>? trustedAuthHeadersForUrl(String? resolvedUrl) {
  if (!isTrustedTaskDescriptionUrl(resolvedUrl)) {
    return null;
  }

  return taskDescriptionAuthHeaders();
}

bool isTrustedTaskDescriptionUrl(String? value) {
  final raw = value?.trim();
  if (raw == null || raw.isEmpty) return false;

  if (raw.startsWith('/')) {
    return true;
  }

  final uri = Uri.tryParse(raw);
  if (uri == null) {
    return false;
  }

  if (!uri.hasScheme || uri.scheme.isEmpty) {
    return false;
  }

  final scheme = uri.scheme.toLowerCase();
  if (scheme != 'http' && scheme != 'https') {
    return false;
  }

  final trustedHosts = trustedTaskDescriptionHosts;
  if (uri.host.isEmpty) {
    return false;
  }

  return trustedHosts.contains(uri.host.toLowerCase());
}

Set<String> get trustedTaskDescriptionHosts {
  final hosts = <String>{};

  void addHostFromUrl(String url) {
    final uri = Uri.tryParse(url.trim());
    final host = uri?.host;
    if (host == null || host.isEmpty) return;
    hosts.add(host.toLowerCase());
  }

  addHostFromUrl(ApiConfig.baseUrl);
  addHostFromUrl(Env.supabaseUrl);
  return hosts;
}
