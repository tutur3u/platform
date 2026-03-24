import 'package:mobile/core/platform/device_platform.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

class OAuthUrlLauncher {
  const OAuthUrlLauncher();

  Future<bool> launchProviderSignIn({
    required GoTrueClient authClient,
    required OAuthProvider provider,
    required String redirectTo,
    required Map<String, String> queryParams,
  }) {
    throw UnimplementedError();
  }
}

class SupabaseOAuthUrlLauncher extends OAuthUrlLauncher {
  const SupabaseOAuthUrlLauncher({
    required DevicePlatform devicePlatform,
  }) : _devicePlatform = devicePlatform,
       super();

  final DevicePlatform _devicePlatform;

  @override
  Future<bool> launchProviderSignIn({
    required GoTrueClient authClient,
    required OAuthProvider provider,
    required String redirectTo,
    required Map<String, String> queryParams,
  }) async {
    final response = await authClient.getOAuthSignInUrl(
      provider: provider,
      redirectTo: redirectTo,
      queryParams: queryParams,
    );

    return launchUrl(
      Uri.parse(response.url),
      mode: _devicePlatform.isAndroid
          ? LaunchMode.externalApplication
          : LaunchMode.platformDefault,
      webOnlyWindowName: '_self',
    );
  }
}
