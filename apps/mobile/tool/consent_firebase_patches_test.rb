require 'minitest/autorun'
require_relative '../ios/ConsentFirebasePatches'

class ConsentFirebasePatchesTest < Minitest::Test
  ROOT = File.expand_path('..', __dir__)
  PODS = ENV['FIREBASE_FIXTURE_PODS']

  def patch(name, source)
    ConsentFirebasePatches.patch(name, source)
  end

  def test_core_registration_never_configures
    source = <<~SWIFT
          if FirebaseOptions.defaultOptions() != nil,
            FirebaseApp.allApps?["__FIRAPP_DEFAULT"] == nil
          {
            FirebaseApp.configure()
          }
    SWIFT
    source = source.lines.map { |line| '    ' + line }.join
    refute_includes patch('FLTFirebaseCorePlugin.swift', source), 'FirebaseApp.configure()'
  end

  def test_messaging_component_and_constants_are_lazy
    assert_includes patch('FIRMessaging.m',
      'instantiationTiming:FIRInstantiationTimingEagerInDefaultApp'), 'FIRInstantiationTimingLazy'
    refute_includes patch('FLTFirebaseMessagingPlugin.m',
      '@([FIRMessaging messaging].isAutoInitEnabled)'), '[FIRMessaging messaging]'
  end

  def test_crashlytics_registration_does_not_touch_an_unconfigured_app
    source = <<~SWIFT
          CrashlyticsPlatformHelpers.setDevelopmentPlatformName("Flutter", version: "-1")
        public func pluginConstants(for firebaseApp: FirebaseApp) -> [AnyHashable: Any] {
          [
            "isCrashlyticsCollectionEnabled": Crashlytics.crashlytics().isCrashlyticsCollectionEnabled()
          ]
        }
    SWIFT
    source = source.lines.map { |line| '  ' + line }.join
    patched = patch('FirebaseCrashlyticsPlugin.swift', source)
    assert_operator patched.index('public func pluginConstants'), :<,
      patched.index('CrashlyticsPlatformHelpers.setDevelopmentPlatformName')
    assert_includes patched, 'return ['
  end

  def test_installation_recreation_is_blocked_but_delete_remains_available
    source = <<~OBJC
      - (void)installationIDWithCompletion:(FIRInstallationsIDHandler)completion {
        [controller getInstallationItem];
      }
      - (void)authTokenForcingRefresh:(BOOL)forceRefresh
                           completion:(FIRInstallationsTokenHandler)completion {
        [controller getAuthToken];
      }
      - (void)deleteWithCompletion:(id)completion { [controller deleteInstallation]; }
    OBJC
    updated = patch('FIRInstallations.m', source)
    assert_equal 2, updated.scan('MobileFirebaseConsent').length
    assert_operator updated.index('installations-admitted'), :<, updated.index('[controller getInstallationItem]')
    assert_includes updated, '- (void)deleteWithCompletion:(id)completion { [controller deleteInstallation]; }'
  end

  def test_native_start_and_withdraw_order
    source = File.read(File.join(ROOT, 'ios/Runner/AppDelegate.swift'))
    launch = source[/willFinishLaunchingWithOptions.*?return super\.application/m]
    assert_includes launch, 'FirebaseAdmissionGate.reset()'
    refute_match(/FirebaseApp\.configure|Messaging\.messaging|Analytics\.set/, launch)
    assert_operator source.index('guard FirebaseAdmissionGate.allowsStartup'), :<,
      source.index('FirebaseApp.configure()')
    enable = source[/if enabled \{.*?\} else \{/m]
    assert_operator enable.index('analyticsKey'), :<, enable.index('MobileStartAdmittedAnalytics')
    assert_operator enable.index('MobileStartAdmittedAnalytics'), :<, enable.index('setAnalyticsCollectionEnabled(true)')
    disable = source[/\} else \{\n      if analyticsStarted.*?\n    \}/m]
    assert_operator disable.index('setAnalyticsCollectionEnabled(false)'), :<, disable.index('MobileTelemetryAdmissionChanged')
  end

  def test_unknown_upstream_source_fails_closed
    ConsentFirebasePatches::SOURCES.each_value do |name|
      assert_raises(RuntimeError) { patch(name, '// unknown SDK') }
    end
  end

  def test_installed_sdk_sources_when_available
    skip 'Set FIREBASE_FIXTURE_PODS to exercise the installed pinned SDK sources' unless PODS
    paths = {
      'FIRApp.m' => 'FirebaseCore/FirebaseCore/Sources/FIRApp.m',
      'FIRMessaging.m' => 'FirebaseMessaging/FirebaseMessaging/Sources/FIRMessaging.m',
      'FIRInstallations.m' => 'FirebaseInstallations/FirebaseInstallations/Source/Library/FIRInstallations.m',
      'GULReachabilityChecker.m' => 'GoogleUtilities/GoogleUtilities/Reachability/GULReachabilityChecker.m',
    }
    paths.each do |name, relative|
      updated = patch(name, File.read(File.join(PODS, relative)))
      assert_includes updated, name == 'FIRMessaging.m' ? 'FIRInstantiationTimingLazy' : 'mobile.firebase.'
      if name == 'FIRApp.m'
        assert_operator updated.index('addObserverForName:@"MobileStartAdmittedAnalytics"'), :<,
          updated.index('[firAnalyticsClass performSelector:startWithConfigurationSelector')
      elsif name == 'GULReachabilityChecker.m'
        assert_operator updated.index('return YES;'), :<, updated.index('reachabilityApi_->createWithNameFn')
        assert_includes updated, '[self stop];'
      end
    end
    Dir.glob(File.join(ENV.fetch('PUB_CACHE', File.expand_path('~/.pub-cache')),
      'hosted/pub.dev/firebase_crashlytics-5.3.0/ios/**/FirebaseCrashlyticsPlugin.swift')).each do |file|
      updated = patch('FirebaseCrashlyticsPlugin.swift', File.read(file))
      assert_operator updated.index('public func pluginConstants'), :<,
        updated.index('CrashlyticsPlatformHelpers.setDevelopmentPlatformName')
    end
    Dir.glob(File.join(ENV.fetch('PUB_CACHE', File.expand_path('~/.pub-cache')),
      'hosted/pub.dev/firebase_core-4.14.0/ios/**/FLTFirebaseCorePlugin.swift')).each do |file|
      refute_includes patch('FLTFirebaseCorePlugin.swift', File.read(file)), '      FirebaseApp.configure()'
    end
  end
end
