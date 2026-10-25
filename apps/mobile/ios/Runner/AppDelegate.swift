import DeviceCheck
import AudioToolbox
import FirebaseCore
import FirebaseMessaging
import Flutter
import UIKit
import UserNotifications

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate, MessagingDelegate {
  private var meetNoticeSound: SystemSoundID = 0

  deinit {
    if meetNoticeSound != 0 { AudioServicesDisposeSystemSoundID(meetNoticeSound) }
  }

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    if FirebaseApp.app() == nil {
      FirebaseApp.configure()
    }
    UNUserNotificationCenter.current().delegate = self
    Messaging.messaging().delegate = self
    application.registerForRemoteNotifications()
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  override func application(
    _ application: UIApplication,
    didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
  ) {
    Messaging.messaging().apnsToken = deviceToken
    super.application(application, didRegisterForRemoteNotificationsWithDeviceToken: deviceToken)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
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
    if let registrar = engineBridge.pluginRegistry.registrar(forPlugin: "AssistantShortcutsPlugin") {
      AssistantShortcutsPlugin.register(with: registrar)
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
