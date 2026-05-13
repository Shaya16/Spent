// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "Spent",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(
            name: "Spent",
            path: "Sources/Spent"
        )
    ]
)
