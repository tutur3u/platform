import 'package:mobile/core/platform/device_platform.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class OAuthUrlLauncher {
  const OAuthUrlLauncher();

  Future<bool> launchProviderSignIn({
    required GoTrueClient authClient,
    required OAuthProvider provider,
    required String redirectTo,
    required Map<String, String> queryParams,
    String? scopes,
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
    String? scopes,
  }) async {
    return authClient.signInWithOAuth(
      provider,
      redirectTo: redirectTo,
      authScreenLaunchMode: _devicePlatform.isAndroid
          ? LaunchMode.externalApplication
          : LaunchMode.platformDefault,
      queryParams: queryParams,
      scopes: scopes,
    );
  }
}
