import Flutter
import UIKit
import XCTest

@testable import Runner

class RunnerTests: XCTestCase {

  private func canonical(_ method: String, _ key: String) -> Data {
    [
      IrisSignPolicy.domain, method, "/v1/iris/send",
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "1700000000", "00112233445566778899aabbccddeeff",
      "0f1e2d3c-4b5a-8978-8695-a4b3c2d1e0f0", key,
    ].joined(separator: "\n").data(using: .utf8)!
  }

  func testIrisWriteAlwaysPrompts() {
    let key = "11111111-2222-4333-8444-555555555555"
    XCTAssertEqual(IrisSignPolicy.mustPrompt(canonical("POST", key), sensitive: false), true)
    XCTAssertEqual(IrisSignPolicy.mustPrompt(canonical("DELETE", key), sensitive: false), true)
  }

  func testIrisReadMayUseTheSession() {
    XCTAssertEqual(IrisSignPolicy.mustPrompt(canonical("GET", ""), sensitive: false), false)
    XCTAssertEqual(IrisSignPolicy.mustPrompt(canonical("GET", ""), sensitive: true), true)
  }

  func testIrisRefusesAnythingButV3() {
    XCTAssertNil(IrisSignPolicy.mustPrompt(canonical("post", "k"), sensitive: false))
    XCTAssertNil(IrisSignPolicy.mustPrompt(canonical("GET", "") + Data([0x0A]), sensitive: false))
    XCTAssertNil(IrisSignPolicy.mustPrompt(Data("POST\n/v1/iris/send".utf8), sensitive: false))
    XCTAssertNil(IrisSignPolicy.mustPrompt(Data([0xC3, 0x28]), sensitive: false))
  }

  func testExample() {
    // If you add code to the Runner application, consider adding tests here.
    // See https://developer.apple.com/documentation/xctest for more information about using XCTest.
  }

}
