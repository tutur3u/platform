# Generated source overlays stay inside Pods; shared Pub/SDK sources are read-only.
module ConsentFirebasePatches
  ANALYTICS_KEY = 'mobile.firebase.analytics-admitted'.freeze
  INSTALLATIONS_KEY = 'mobile.firebase.installations-admitted'.freeze
  CHANGE = 'MobileTelemetryAdmissionChanged'.freeze
  START = 'MobileStartAdmittedAnalytics'.freeze

  def self.replace_once(source, original, replacement)
    raise "Firebase consent patch source changed: #{original.lines.first.strip}" unless source.scan(original).length == 1
    source.sub(original, replacement)
  end

  def self.patch(name, source)
    case name
    when 'FLTFirebaseCorePlugin.swift'
      original = <<~SWIFT
          if FirebaseOptions.defaultOptions() != nil,
            FirebaseApp.allApps?["__FIRAPP_DEFAULT"] == nil
          {
            FirebaseApp.configure()
          }
      SWIFT
      original = original.lines.map { |line| "    #{line}" }.join
      replace_once(source, original, "    // Only the authenticated native admission channel configures Firebase.\n")
    when 'FirebaseCrashlyticsPlugin.swift'
      metadata = '    CrashlyticsPlatformHelpers.setDevelopmentPlatformName("Flutter", version: "-1")'
      source = replace_once(source, metadata, '    // Flutter metadata waits for post-auth plugin constants.')
      replace_once(source,
        "  public func pluginConstants(for firebaseApp: FirebaseApp) -> [AnyHashable: Any] {\n    [",
        "  public func pluginConstants(for firebaseApp: FirebaseApp) -> [AnyHashable: Any] {\n" +
          metadata + "\n    return [")
    when 'FIRApp.m'
      start = source.index('  // Initialize the Analytics once there is a valid options under default app.')
      finish = start && source.index("\n  [self subscribeForAppDidBecomeActiveNotifications];", start)
      raise 'FirebaseCore configureCore Analytics block changed' unless start && finish
      original = source[start...finish]
      raise 'FirebaseCore Analytics start selector changed' unless original.include?('startWithConfigurationSelector')
      body = original.sub('  // Initialize the Analytics once there is a valid options under default app. Analytics should', '')
        .sub('  // always initialize first by itself before the other SDKs.', '')
        .sub('  if ([self.name isEqualToString:kFIRDefaultAppName]) {', '')
        .sub(/\n  \}\s*\z/, '').gsub('withObject:_options', 'withObject:app.options')
      deferred = <<~OBJC
          if ([self.name isEqualToString:kFIRDefaultAppName]) {
            __weak FIRApp *consentApp = self;
            __block id consentObserver = nil;
            consentObserver = [[NSNotificationCenter defaultCenter]
                addObserverForName:@"#{START}" object:nil queue:nil
                usingBlock:^(NSNotification *notification) {
              if (![[NSUserDefaults standardUserDefaults] boolForKey:@"#{ANALYTICS_KEY}"]) return;
              FIRApp *app = consentApp;
              if (!app) return;
      #{body}
              [[NSNotificationCenter defaultCenter] removeObserver:consentObserver];
              consentObserver = nil;
            }];
          }
      OBJC
      source[0...start] + deferred + source[finish..]
    when 'FIRMessaging.m'
      replace_once(source, 'instantiationTiming:FIRInstantiationTimingEagerInDefaultApp',
        'instantiationTiming:FIRInstantiationTimingLazy')
    when 'FLTFirebaseMessagingPlugin.m'
      replace_once(source, '@([FIRMessaging messaging].isAutoInitEnabled)',
        '@([[NSUserDefaults standardUserDefaults] boolForKey:@"com.firebase.messaging.auto-init.enabled"])')
    when 'GULReachabilityChecker.m'
      source = replace_once(source, '@implementation GULReachabilityChecker', <<~OBJC.rstrip)
        static BOOL MobileAnalyticsHost(NSString *host) {
          return [host hasSuffix:@"app-analytics-services.com"]
              || [host hasSuffix:@"app-analytics-services-att.com"]
              || [host hasSuffix:@"app-measurement.com"]
              || [host hasSuffix:@"google-analytics.com"];
        }

        @implementation GULReachabilityChecker
      OBJC
      source = replace_once(source, '    host_ = [host copy];', <<~OBJC.rstrip)
            host_ = [host copy];
            if (MobileAnalyticsHost(host_)) {
              [[NSNotificationCenter defaultCenter] addObserver:self
                  selector:@selector(mobileTelemetryAdmissionChanged:)
                  name:@"#{CHANGE}" object:nil];
            }
      OBJC
      source = replace_once(source, "- (void)dealloc {\n", <<~OBJC)
        - (void)dealloc {
          [[NSNotificationCenter defaultCenter] removeObserver:self name:@"#{CHANGE}" object:nil];
      OBJC
      replace_once(source, "- (BOOL)start {\n", <<~OBJC)
        - (void)mobileTelemetryAdmissionChanged:(NSNotification *)notification {
          if ([[NSUserDefaults standardUserDefaults] boolForKey:@"#{ANALYTICS_KEY}"]) {
            [self start];
          } else {
            [self stop];
          }
        }

        - (BOOL)start {
          // A successful dormant monitor must not create/schedule a hostname lookup.
          if (MobileAnalyticsHost(self.host) &&
              ![[NSUserDefaults standardUserDefaults] boolForKey:@"#{ANALYTICS_KEY}"]) return YES;
      OBJC
    when 'FIRInstallations.m'
      guard = <<~OBJC
          // Prevent SDK listeners from recreating an FID after consent withdrawal/deletion.
          if (![[NSUserDefaults standardUserDefaults] boolForKey:@"#{INSTALLATIONS_KEY}"]) {
            completion(nil, [NSError errorWithDomain:@"MobileFirebaseConsent" code:1 userInfo:nil]);
            return;
          }
      OBJC
      source = replace_once(source,
        "- (void)installationIDWithCompletion:(FIRInstallationsIDHandler)completion {\n",
        "- (void)installationIDWithCompletion:(FIRInstallationsIDHandler)completion {\n" + guard)
      replace_once(source,
        "                     completion:(FIRInstallationsTokenHandler)completion {\n",
        "                     completion:(FIRInstallationsTokenHandler)completion {\n" + guard)
    else
      raise "Unexpected Firebase consent source #{name}"
    end
  end

  SOURCES = {
    'firebase_core' => 'FLTFirebaseCorePlugin.swift',
    'firebase_crashlytics' => 'FirebaseCrashlyticsPlugin.swift',
    'FirebaseCore' => 'FIRApp.m',
    'FirebaseMessaging' => 'FIRMessaging.m',
    'firebase_messaging' => 'FLTFirebaseMessagingPlugin.m',
    'GoogleUtilities' => 'GULReachabilityChecker.m',
    'FirebaseInstallations' => 'FIRInstallations.m',
  }.freeze

  def self.install(target, pods)
    name = SOURCES[target.name]
    return unless name
    # Messaging's preceding APNs patch already points at a generated source.
    files = target.source_build_phase.files.select do |file|
      file.file_ref && ([name, 'ConsentFirebaseMessagingPlugin.m'].include?(File.basename(file.file_ref.path)))
    end
    raise "Expected one #{target.name} #{name} source" unless files.length == 1
    source = files.first.file_ref.real_path
    destination = File.join(pods, "Admission#{name}")
    File.write(destination, patch(name, File.read(source)))
    files.first.file_ref.path = destination
    files.first.file_ref.source_tree = '<absolute>'
  end
end
