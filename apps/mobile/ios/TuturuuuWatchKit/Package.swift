// swift-tools-version: 5.9

import PackageDescription

let package = Package(
  name: "TuturuuuWatchKit",
  defaultLocalization: "en",
  platforms: [
    .watchOS(.v10),
    .iOS(.v15),
    .macOS(.v14),
  ],
  products: [
    .library(
      name: "TuturuuuWatchKit",
      targets: ["TuturuuuWatchKit"]
    ),
  ],
  targets: [
    .target(
      name: "TuturuuuWatchKit",
      path: "Sources/TuturuuuWatchKit"
    ),
    .testTarget(
      name: "TuturuuuWatchKitTests",
      dependencies: ["TuturuuuWatchKit"],
      path: "Tests/TuturuuuWatchKitTests"
    ),
  ]
)
