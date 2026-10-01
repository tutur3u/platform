import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  func didInitializeImplicitFlutterEngine(_ bridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: bridge.pluginRegistry)
    guard let registrar = bridge.pluginRegistry.registrar(forPlugin: "JournalFixture") else {
      return
    }
    FlutterMethodChannel(name: "fixture/sale_journal", binaryMessenger: registrar.messenger())
      .setMethodCallHandler { call, result in
        switch call.method {
        case "phase":
          let arguments = ProcessInfo.processInfo.arguments
          guard let index = arguments.firstIndex(of: "--journal-phase"),
            arguments.indices.contains(index + 1) else {
            result(FlutterError(code: "missing_phase", message: nil, details: nil))
            return
          }
          result(arguments[index + 1])
        case "report":
          do {
            guard let raw = call.arguments as? String,
              let data = raw.data(using: .utf8),
              var report = try JSONSerialization.jsonObject(with: data) as? [String: Any]
            else { throw NSError(domain: "fixture_report", code: 1) }
            report["process_id"] = ProcessInfo.processInfo.processIdentifier
            let directory = FileManager.default.urls(for: .documentDirectory,
              in: .userDomainMask)[0]
            let encoded = try JSONSerialization.data(withJSONObject: report)
            try encoded.write(to: directory.appendingPathComponent("journal-proof.json"),
              options: .atomic)
            result(nil)
          } catch {
            result(FlutterError(code: "report_failed", message: "Fixture report failed",
              details: nil))
          }
        default:
          result(FlutterMethodNotImplemented)
        }
      }
  }
}
