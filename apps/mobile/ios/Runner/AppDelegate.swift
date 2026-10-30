import DeviceCheck
import AudioToolbox
import FirebaseAnalytics
import FirebaseCore
import FirebaseMessaging
import FirebaseInstallations
import Flutter
import UIKit
import UserNotifications

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate, MessagingDelegate {
  private var analyticsStartupReady = false
  private var firebaseSessionActive = false
  private var analyticsStarted = false
  private var pushAdmitted = false
  private var meetNoticeSound: SystemSoundID = 0

  deinit {
    if meetNoticeSound != 0 { AudioServicesDisposeSystemSoundID(meetNoticeSound) }
  }

  override func application(
    _ application: UIApplication,
    willFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    // Foundation-only reset before Firebase or a plugin can construct Measurement.
    FirebaseAdmissionGate.reset()
    analyticsStartupReady = AnalyticsStartupGate.disableBeforeInitialization()
    UserDefaults.standard.set(false, forKey: "com.firebase.messaging.auto-init.enabled")
    TelemetryConsentGate.clearPersistedCrashCollection()
    return super.application(application, willFinishLaunchingWithOptions: launchOptions)
  }

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    // Dart configures Firebase after sign-in.
    UNUserNotificationCenter.current().delegate = self
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  override func application(
    _ application: UIApplication,
    didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
  ) {
    if firebaseSessionActive && pushAdmitted {
      Messaging.messaging().apnsToken = deviceToken
    }
    super.application(application, didRegisterForRemoteNotificationsWithDeviceToken: deviceToken)
  }

  private func setAnalyticsCollection(_ requested: Bool) {
    let enabled = requested && firebaseSessionActive && analyticsStartupReady
      && TelemetryConsentGate.allowsCollection { UserDefaults.standard.object(forKey: $0) }
    if enabled {
      UserDefaults.standard.set(true, forKey: FirebaseAdmissionGate.analyticsKey)
      NotificationCenter.default.post(name: NSNotification.Name("MobileStartAdmittedAnalytics"), object: nil)
      NotificationCenter.default.post(name: NSNotification.Name("MobileTelemetryAdmissionChanged"), object: nil)
      Analytics.setAnalyticsCollectionEnabled(true)
      analyticsStarted = true
    } else {
      if analyticsStarted { Analytics.setAnalyticsCollectionEnabled(false) }
      UserDefaults.standard.set(false, forKey: FirebaseAdmissionGate.analyticsKey)
      NotificationCenter.default.post(name: NSNotification.Name("MobileTelemetryAdmissionChanged"), object: nil)
      analyticsStartupReady = AnalyticsStartupGate.disableBeforeInitialization()
    }
  }

  private func pushPermission(_ complete: @escaping (Bool) -> Void) {
    UNUserNotificationCenter.current().getNotificationSettings { settings in
      let allowed = settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional
      DispatchQueue.main.async { complete(allowed) }
    }
  }

  private func initializeFirebase(_ arguments: [String: Any], result: @escaping FlutterResult) {
    guard analyticsStartupReady else {
      result(FlutterError(code: "analytics_startup_reset", message: "Analytics preferences could not be disabled", details: nil))
      return
    }
    pushPermission { permission in
      self.firebaseSessionActive = arguments["signedIn"] as? Bool == true
      self.pushAdmitted = arguments["pushAllowed"] as? Bool == true && permission && self.firebaseSessionActive
        && UserDefaults.standard.object(forKey: "flutter.push-enabled") as? Bool != false
      let telemetry = arguments["telemetryAllowed"] as? Bool == true
        && TelemetryConsentGate.allowsCollection { UserDefaults.standard.object(forKey: $0) }
      guard FirebaseAdmissionGate.allowsStartup(
        signedIn: self.firebaseSessionActive, push: self.pushAdmitted, telemetry: telemetry
      ) else { result(false); return }
      UserDefaults.standard.set(true, forKey: FirebaseAdmissionGate.installationsKey)
      if FirebaseApp.app() == nil { FirebaseApp.configure() }
      FirebaseApp.app()?.isDataCollectionDefaultEnabled = false
      result(true)
    }
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    if let registrar = engineBridge.pluginRegistry.registrar(forPlugin: "FirebaseStartupGate") {
      let channel = FlutterMethodChannel(name: "mobile/firebase_startup", binaryMessenger: registrar.messenger())
      channel.setMethodCallHandler { call, result in
        switch call.method {
        case "initialize":
          self.initializeFirebase(call.arguments as? [String: Any] ?? [:], result: result)
          return
        case "pushPermission":
          self.pushPermission { result($0) }
          return
        case "deleteInstallation":
          UserDefaults.standard.set(false, forKey: FirebaseAdmissionGate.installationsKey)
          guard FirebaseApp.app() != nil else { result(nil); return }
          Installations.installations().delete { error in
            DispatchQueue.main.async {
              if error != nil {
                NSLog("Firebase Installation deletion failed")
                result(FlutterError(code: "installation_delete", message: "Installation deletion failed", details: nil))
              } else {
                NSLog("Firebase Installation deletion completed")
                result(nil)
              }
            }
          }
          return
        case "setAnalyticsCollectionEnabled":
          self.setAnalyticsCollection(call.arguments as? Bool == true)
        case "endSession":
          self.firebaseSessionActive = false
          self.pushAdmitted = false
          UserDefaults.standard.set(false, forKey: FirebaseAdmissionGate.installationsKey)
          self.setAnalyticsCollection(false)
        default:
          result(FlutterMethodNotImplemented)
          return
        }
        result(nil)
      }
    }

    if let registrar = engineBridge.pluginRegistry.registrar(forPlugin: "NativeIntegrity") {
      NativeIntegrityChannel.install(messenger: registrar.messenger())
    }
    if let registrar = engineBridge.pluginRegistry.registrar(forPlugin: "DeliveredInboxNotificationsPlugin") {
      DeliveredInboxNotificationsPlugin.register(with: registrar)
    }
    if let registrar = engineBridge.pluginRegistry.registrar(forPlugin: "MeetNotificationSound") {
      let channel = FlutterMethodChannel(name: "mobile/meet_screen_share", binaryMessenger: registrar.messenger())
      if meetNoticeSound == 0 {
        let asset = registrar.lookupKey(forAsset: "assets/audio/meet-notice.wav")
        if let path = Bundle.main.path(forResource: asset, ofType: nil) {
          let status = AudioServicesCreateSystemSoundID(URL(fileURLWithPath: path) as CFURL, &meetNoticeSound)
          if status == kAudioServicesNoError {
            var uiSound: UInt32 = 1
            AudioServicesSetProperty(kAudioServicesPropertyIsUISound,
              UInt32(MemoryLayout<SystemSoundID>.size), &meetNoticeSound,
              UInt32(MemoryLayout<UInt32>.size), &uiSound)
          }
        }
      }
      channel.setMethodCallHandler { [weak self] call, result in
        if call.method == "sound" {
          // UI System Sound Services uses the OS sound policy, not call playback.
          if UIApplication.shared.applicationState == .active,
             let sound = self?.meetNoticeSound, sound != 0 {
            AudioServicesPlaySystemSound(sound)
          }
          result(nil)
        } else { result(FlutterMethodNotImplemented) }
      }
    }
    if let registrar = engineBridge.pluginRegistry.registrar(forPlugin: "LiveScreenCapturePlugin") {
      LiveScreenCapturePlugin.register(with: registrar)
    }
  }
}

private enum NativeIntegrityChannel {
  static func install(messenger: FlutterBinaryMessenger) {
    let channel = FlutterMethodChannel(name: "mobile/native_integrity", binaryMessenger: messenger)
    channel.setMethodCallHandler { call, result in
      guard available else {
        if call.method == "supported" { result(false) }
        else { result(FlutterError(code: "unsupported", message: "App Attest unavailable", details: nil)) }
        return
      }
      perform(call, result: result)
    }
  }

  private static var available: Bool {
    if #available(iOS 14.0, *) { return DCAppAttestService.shared.isSupported }
    return false
  }

  private static func perform(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    if #available(iOS 14.0, *) { serviceCall(call, result: result); return }
    result(FlutterError(code: "unsupported", message: "App Attest unavailable", details: nil))
  }

  @available(iOS 14.0, *)
  private static func serviceCall(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    let service = DCAppAttestService.shared
    if call.method == "supported" { result(service.isSupported); return }
    if call.method == "generateKey" {
      service.generateKey { key, error in
        DispatchQueue.main.async {
          if let key = key { result(key) }
          else { result(FlutterError(code: "key_failed", message: "App Attest key unavailable", details: nil)) }
        }
      }
      return
    }
    guard let args = call.arguments as? [String: String],
          let key = args["keyId"], let rawHash = args["requestHash"] else {
      result(FlutterError(code: "invalid_arguments", message: "Missing key or hash", details: nil)); return
    }
    let padded = rawHash.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
      + String(repeating: "=", count: (4 - rawHash.count % 4) % 4)
    guard let hash = Data(base64Encoded: padded), hash.count == 32 else {
      result(FlutterError(code: "invalid_hash", message: "Invalid request hash", details: nil)); return
    }
    let complete: (Data?, Error?) -> Void = { data, error in
      DispatchQueue.main.async {
        if let data = data { result(data.base64EncodedString()) }
        else { result(FlutterError(code: "proof_failed", message: "App Attest proof unavailable", details: nil)) }
      }
    }
    switch call.method {
    case "attestKey": service.attestKey(key, clientDataHash: hash, completionHandler: complete)
    case "generateAssertion": service.generateAssertion(key, clientDataHash: hash, completionHandler: complete)
    default: result(FlutterMethodNotImplemented)
    }
  }
}

/// Builds before the telemetry consent setting persisted Crashlytics
/// collection-on. The SDK prefers that sticky value over Info.plist and reads it
/// inside FirebaseApp.configure(), so held reports could upload before Dart
/// reads consent. Clearing it lets FirebaseCrashlyticsCollectionEnabled=false
/// apply until Dart enables collection from the stored choice; without consent
/// Dart then deletes the held reports. The key and file mirror the SDK
/// FIRCLSDataCollectionArbiter and FIRCLSUserDefaults.
private enum TelemetryConsentGate {
  private static let key = "com.crashlytics.data_collection"
  private static let file = "com.crashlytics/CLSUserDefaults.plist"

  /// Mirrors TelemetryPreference in Dart: shared_preferences stores its values in
  /// NSUserDefaults under a `flutter.` prefix. Allowed only for an explicit
  /// Allow under the current notice version; anything else means "not allowed".
  static func allowsCollection(_ stored: (String) -> Any?) -> Bool {
    stored("flutter.telemetry-consent-choice") as? Bool == true
      && stored("flutter.telemetry-consent-notice-version") as? String == "telemetry-consent-v1"
      && stored("flutter.telemetry-consent-copy-version") as? String == "telemetry-fid-copy-v1"
  }

  static func clearPersistedCrashCollection() {
    UserDefaults.standard.removeObject(forKey: key)
    let manager = FileManager.default
    guard let support = manager.urls(for: .applicationSupportDirectory, in: .userDomainMask).last
    else { return }
    // Simulator builds omit the bundle identifier directory; devices include it.
    let children = (try? manager.contentsOfDirectory(at: support, includingPropertiesForKeys: nil)) ?? []
    for url in [support.appendingPathComponent(file)] + children.map({ $0.appendingPathComponent(file) }) {
      guard let data = try? Data(contentsOf: url),
            var state = (try? PropertyListSerialization.propertyList(from: data, format: nil)) as? [String: Any],
            state.removeValue(forKey: key) != nil,
            let updated = try? PropertyListSerialization.data(fromPropertyList: state, format: .xml, options: 0)
      else { continue }
      try? updated.write(to: url, options: .atomic)
      // Match the SDK so Crashlytics can still read it while the device is locked.
      try? manager.setAttributes([.protectionKey: FileProtectionType.none], ofItemAtPath: url.path)
    }
  }
}


// Mirrors GoogleAppMeasurement 12.18 APMPersistedConfig: 1 enabled, 2 disabled.
// Foundation writes avoid constructing Measurement merely to reset its SDK override.
enum AnalyticsStartupGate {
  static let stateKey = "/google/measurement/measurement_enabled_state"
  static let relativeFile = "Google/Measurement/com.google.gmp.measurement.plist"

  @discardableResult
  static func disableBeforeInitialization(
    defaults: UserDefaults = .standard,
    support: URL? = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).last
  ) -> Bool {
    defaults.set(2, forKey: stateKey)
    defaults.synchronize()
    guard let support else { return true }
    let file = support.appendingPathComponent(relativeFile)
    guard FileManager.default.fileExists(atPath: file.path) else { return true }
    do {
      let data = try? Data(contentsOf: file)
      let parsed = data.flatMap { try? PropertyListSerialization.propertyList(from: $0, format: nil) }
      var state = parsed as? [String: Any] ?? [:]
      state[stateKey] = 2
      let updated = try PropertyListSerialization.data(fromPropertyList: state, format: .binary, options: 0)
      try updated.write(to: file, options: .atomic)
      if !(parsed is [String: Any]) {
        NSLog("Replaced unreadable Measurement preferences with disabled Analytics state")
      }
      return true
    } catch {
      NSLog("Cannot persist disabled Analytics state; Firebase startup remains blocked")
      return false
    }
  }
}

// Launch always resets admission, including a stored Allow.
enum FirebaseAdmissionGate {
  static let analyticsKey = "mobile.firebase.analytics-admitted"
  static let installationsKey = "mobile.firebase.installations-admitted"

  static func allowsStartup(signedIn: Bool, push: Bool, telemetry: Bool) -> Bool {
    signedIn && (push || telemetry)
  }

  static func reset(defaults: UserDefaults = .standard) {
    defaults.set(false, forKey: analyticsKey)
    defaults.set(false, forKey: installationsKey)
  }
}
