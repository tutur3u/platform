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
