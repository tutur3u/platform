import DeviceCheck
import Cocoa
import FlutterMacOS

class MainFlutterWindow: NSWindow {
  override func awakeFromNib() {
    let flutterViewController = FlutterViewController()
    let windowFrame = self.frame
    self.contentViewController = flutterViewController
    self.setFrame(windowFrame, display: true)
    self.title = Bundle.main.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String ?? "Tuturuuu"
    self.minSize = NSSize(width: 480, height: 600)

    RegisterGeneratedPlugins(registry: flutterViewController)
    NativeIntegrityChannel.install(messenger: flutterViewController.engine.binaryMessenger)

    super.awakeFromNib()
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
    #if compiler(>=6.4)
    if #available(macOS 27.0, *) { return DCAppAttestService.shared.isSupported }
    #endif
    return false
  }

  private static func perform(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    #if compiler(>=6.4)
    if #available(macOS 27.0, *) { serviceCall(call, result: result); return }
    #endif
    result(FlutterError(code: "unsupported", message: "App Attest unavailable", details: nil))
  }

  #if compiler(>=6.4)
  @available(macOS 27.0, *)
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
  #endif
}
