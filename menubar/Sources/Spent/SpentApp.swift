import SwiftUI
import AppKit
import Foundation

// All network access is restricted to 127.0.0.1 by NSAppTransportSecurity
// in Info.plist. Do not change these URLs without re-reviewing that.
private let loopbackBase = URL(string: "http://127.0.0.1:41234")!
private let healthURL = URL(string: "http://127.0.0.1:41234/api/health")!
private let syncURL = URL(string: "http://127.0.0.1:41234/api/sync")!
private let sameOrigin = "http://127.0.0.1:41234"
private let launchAgentLabel = "com.spent.app"
private let launchAgentPlist =
    ("~/Library/LaunchAgents/com.spent.app.plist" as NSString).expandingTildeInPath

@MainActor
final class StatusModel: ObservableObject {
    @Published var isOnline = false
    @Published var version = ""

    private var pollTask: Task<Void, Never>?

    init() {
        pollTask = Task { await pollLoop() }
    }

    deinit {
        pollTask?.cancel()
    }

    private func pollLoop() async {
        while !Task.isCancelled {
            await pollOnce()
            try? await Task.sleep(for: .seconds(5))
        }
    }

    func pollOnce() async {
        var req = URLRequest(url: healthURL)
        req.timeoutInterval = 2.0
        req.cachePolicy = .reloadIgnoringLocalCacheData
        do {
            let (data, response) = try await URLSession.shared.data(for: req)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                isOnline = false
                return
            }
            if let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] {
                isOnline = (json["ok"] as? Bool) ?? false
                version = (json["version"] as? String) ?? ""
            }
        } catch {
            isOnline = false
        }
    }
}

private func openSpent() {
    NSWorkspace.shared.open(loopbackBase)
}

private func syncNow() {
    var req = URLRequest(url: syncURL)
    req.httpMethod = "POST"
    req.setValue(sameOrigin, forHTTPHeaderField: "Origin")
    req.timeoutInterval = 5.0
    URLSession.shared.dataTask(with: req).resume()
}

private func runLaunchctl(_ args: [String]) -> Int32 {
    let task = Process()
    task.launchPath = "/bin/launchctl"
    task.arguments = args
    task.standardOutput = Pipe()
    task.standardError = Pipe()
    do {
        try task.run()
        task.waitUntilExit()
        return task.terminationStatus
    } catch {
        return -1
    }
}

private func startService() {
    _ = runLaunchctl(["bootstrap", "gui/\(getuid())", launchAgentPlist])
}

private func stopService() {
    _ = runLaunchctl(["bootout", "gui/\(getuid())/\(launchAgentLabel)"])
}

@main
struct SpentMenuBarApp: App {
    @StateObject private var model = StatusModel()

    var body: some Scene {
        MenuBarExtra {
            menuContent
        } label: {
            Image(systemName: model.isOnline ? "circle.fill" : "circle")
                .foregroundColor(model.isOnline ? .green : .secondary)
        }
        .menuBarExtraStyle(.menu)
    }

    @ViewBuilder
    private var menuContent: some View {
        Text(model.isOnline
            ? "Spent is running" + (model.version.isEmpty ? "" : " (v\(model.version))")
            : "Spent is stopped")
        Divider()
        Button("Open Spent") { openSpent() }
            .keyboardShortcut("o")
            .disabled(!model.isOnline)
        Button("Sync now") { syncNow() }
            .keyboardShortcut("s")
            .disabled(!model.isOnline)
        Divider()
        if model.isOnline {
            Button("Stop service") {
                stopService()
                Task { await model.pollOnce() }
            }
        } else {
            Button("Start service") {
                startService()
                Task { await model.pollOnce() }
            }
        }
        Divider()
        Button("Quit menu bar") {
            NSApplication.shared.terminate(nil)
        }
        .keyboardShortcut("q")
    }
}
