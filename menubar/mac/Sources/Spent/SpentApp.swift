import SwiftUI
import AppKit
import Foundation

// In-app network access is restricted to 127.0.0.1 by NSAppTransportSecurity
// in Info.plist. Do not change healthURL/syncURL/sameOrigin without re-reviewing
// that. openInBrowserURL is handed to NSWorkspace and opens in the user's
// browser, which is not subject to ATS, so it can use the friendly hostname.
private let openInBrowserURL = URL(string: "http://spent.local:41234")!
private let healthURL = URL(string: "http://127.0.0.1:41234/api/health")!
private let syncURL = URL(string: "http://127.0.0.1:41234/api/sync")!
private let sameOrigin = "http://127.0.0.1:41234"
private let launchAgentLabel = "com.spent.app"
private let launchAgentPlist =
    ("~/Library/LaunchAgents/com.spent.app.plist" as NSString).expandingTildeInPath

// MARK: - Logo
// Vector copy of public/logo_*.svg (149x184 viewBox, stroke-width 9).
// Drawn in code so the same shape works in the menu bar and the popover.

private struct LogoShape: Shape {
    func path(in rect: CGRect) -> Path {
        let s = min(rect.width / 149, rect.height / 184)
        let dx = rect.minX + (rect.width - 149 * s) / 2
        let dy = rect.minY + (rect.height - 184 * s) / 2

        func pt(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
            CGPoint(x: dx + x * s, y: dy + y * s)
        }

        var p = Path()

        p.addEllipse(in: CGRect(
            x: dx + (32 - 27.5) * s, y: dy + (53.6221 - 27.5) * s,
            width: 55 * s, height: 55 * s
        ))

        p.move(to: pt(32.5, 26.1221))
        p.addCurve(to: pt(70.5, 23.1221),
                   control1: pt(32.5, 26.1221), control2: pt(53.5, 30.1221))
        p.addCurve(to: pt(100, 3.12207),
                   control1: pt(87.5, 16.1221), control2: pt(100, 3.12207))
        p.addLine(to: pt(49.5, 138.122))

        p.move(to: pt(13.5, 158.122))
        p.addCurve(to: pt(75, 179.122),
                   control1: pt(13.5, 158.122), control2: pt(31, 180.622))
        p.addCurve(to: pt(133.5, 158.122),
                   control1: pt(119, 177.622), control2: pt(133.5, 158.122))

        p.addEllipse(in: CGRect(
            x: dx + (117 - 27.5) * s, y: dy + (85.6221 - 27.5) * s,
            width: 55 * s, height: 55 * s
        ))

        return p
    }
}

private struct LogoView: View {
    // Height in pt of the rendered logo. Width is derived from the 149:184 aspect.
    var height: CGFloat
    var strokeWidth: CGFloat

    var body: some View {
        LogoShape()
            .stroke(style: StrokeStyle(lineWidth: strokeWidth,
                                       lineCap: .butt, lineJoin: .miter))
            .frame(width: height * 149.0 / 184.0, height: height)
    }
}

// Renders the logo as a template NSImage so macOS auto-tints it for the menu bar
// (white on dark menu bars, black on light). SwiftUI's `.foregroundStyle(.primary)`
// is unreliable inside `MenuBarExtra(label:)` for LSUIElement apps — template image
// is the canonical AppKit/macOS approach.
private func makeLogoTemplateImage(height: CGFloat, strokeWidth: CGFloat) -> NSImage {
    let size = NSSize(width: height * 149.0 / 184.0, height: height)
    let image = NSImage(size: size, flipped: true) { rect in
        guard let ctx = NSGraphicsContext.current?.cgContext else { return false }
        let path = LogoShape().path(in: rect).cgPath
        ctx.setLineWidth(strokeWidth)
        ctx.setLineCap(.butt)
        ctx.setLineJoin(.miter)
        ctx.setStrokeColor(NSColor.black.cgColor)
        ctx.addPath(path)
        ctx.strokePath()
        return true
    }
    image.isTemplate = true
    return image
}

// MARK: - Status model

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

// MARK: - Actions

private func openSpent() {
    NSWorkspace.shared.open(openInBrowserURL)
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

private func restartService() {
    _ = runLaunchctl(["kickstart", "-k", "gui/\(getuid())/\(launchAgentLabel)"])
}

// Deactivating the app closes the MenuBarExtra(.window) popover.
private func dismissPopover() {
    NSApp.deactivate()
}

// MARK: - Menu row

private struct MenuRow: View {
    let icon: String
    let title: String
    var shortcut: String? = nil
    var tint: Color = .primary
    var isEnabled: Bool = true
    let action: () -> Void

    @State private var isHovered = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Image(systemName: icon)
                    .font(.system(size: 13, weight: .medium))
                    .frame(width: 16, alignment: .center)
                Text(title)
                    .font(.system(size: 13, weight: .regular))
                Spacer(minLength: 8)
                if let shortcut = shortcut {
                    Text(shortcut)
                        .font(.system(size: 12, weight: .regular))
                        .foregroundStyle(.secondary)
                }
            }
            .foregroundStyle(tint)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .fill(isHovered && isEnabled
                          ? Color.primary.opacity(0.08)
                          : Color.clear)
            )
            .contentShape(Rectangle())
            .opacity(isEnabled ? 1.0 : 0.4)
        }
        .buttonStyle(.plain)
        .disabled(!isEnabled)
        .onHover { hovering in
            isHovered = hovering && isEnabled
        }
    }
}

// MARK: - App

@main
struct SpentMenuBarApp: App {
    @StateObject private var model = StatusModel()

    private static let menuBarIcon = makeLogoTemplateImage(height: 18, strokeWidth: 1.6)

    var body: some Scene {
        MenuBarExtra {
            PopoverContent(model: model)
        } label: {
            Image(nsImage: Self.menuBarIcon)
                .opacity(model.isOnline ? 1.0 : 0.45)
        }
        .menuBarExtraStyle(.window)
    }
}

private struct PopoverContent: View {
    @ObservedObject var model: StatusModel

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider()
            actionSection
            Divider()
            serviceSection
            Divider()
            quitSection
        }
        .frame(width: 264)
    }

    // MARK: header

    private var header: some View {
        HStack(spacing: 12) {
            LogoView(height: 30, strokeWidth: 1.8)
                .foregroundStyle(.primary)
            VStack(alignment: .leading, spacing: 3) {
                Text("Spent")
                    .font(.system(size: 14, weight: .semibold))
                HStack(spacing: 5) {
                    Circle()
                        .fill(model.isOnline ? Color.green : Color.secondary)
                        .frame(width: 6, height: 6)
                    Text(statusText)
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                }
            }
            Spacer()
        }
        .padding(.horizontal, 14)
        .padding(.top, 14)
        .padding(.bottom, 12)
    }

    // MARK: sections

    private var actionSection: some View {
        VStack(spacing: 1) {
            MenuRow(
                icon: "arrow.up.right.square",
                title: "Open dashboard",
                shortcut: "⌘O",
                isEnabled: model.isOnline,
                action: {
                    openSpent()
                    dismissPopover()
                }
            )
            .keyboardShortcut("o")

            MenuRow(
                icon: "arrow.triangle.2.circlepath",
                title: "Sync now",
                shortcut: "⌘S",
                isEnabled: model.isOnline,
                action: {
                    syncNow()
                    dismissPopover()
                }
            )
            .keyboardShortcut("s")
        }
        .padding(6)
    }

    @ViewBuilder
    private var serviceSection: some View {
        VStack(spacing: 1) {
            if model.isOnline {
                MenuRow(
                    icon: "arrow.clockwise",
                    title: "Restart service",
                    action: {
                        restartService()
                        Task { await model.pollOnce() }
                    }
                )
                MenuRow(
                    icon: "stop.fill",
                    title: "Stop service",
                    tint: .red,
                    action: {
                        stopService()
                        Task { await model.pollOnce() }
                    }
                )
            } else {
                MenuRow(
                    icon: "play.fill",
                    title: "Start service",
                    tint: .accentColor,
                    action: {
                        startService()
                        Task { await model.pollOnce() }
                    }
                )
            }
        }
        .padding(6)
    }

    private var quitSection: some View {
        VStack(spacing: 1) {
            MenuRow(
                icon: "power",
                title: "Quit menu bar",
                shortcut: "⌘Q",
                action: {
                    NSApplication.shared.terminate(nil)
                }
            )
            .keyboardShortcut("q")
        }
        .padding(6)
    }

    private var statusText: String {
        if model.isOnline {
            return model.version.isEmpty ? "Running" : "Running · v\(model.version)"
        }
        return "Stopped"
    }
}
