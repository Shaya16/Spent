using System.Diagnostics;
using System.Net.Http;

namespace Spent;

// Service controls. Mirror the Mac app: openSpent / syncNow / startService / stopService.
// Start/stop drive the Spent scheduled task created by `npm run service:install`.
internal static class Services
{
    public static void OpenSpent()
    {
        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = Constants.OpenInBrowserUrl,
                UseShellExecute = true,
            });
        }
        catch
        {
            // Browser launch failed; nothing useful to show in the tray UI.
        }
    }

    public static async void SyncNow()
    {
        using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
        using var req = new HttpRequestMessage(HttpMethod.Post, Constants.SyncUrl);
        req.Headers.TryAddWithoutValidation("Origin", Constants.SameOrigin);
        try
        {
            // Fire-and-forget; the server streams progress over SSE which the
            // tray app doesn't render. The dashboard is the right place for that.
            using var _ = await http.SendAsync(req, HttpCompletionOption.ResponseHeadersRead).ConfigureAwait(false);
        }
        catch
        {
            // Best effort; the icon polling will reflect failures.
        }
    }

    public static void StartService()
    {
        RunSchtasks("/Run", "/TN", Constants.TaskName);
    }

    public static void StopService()
    {
        RunSchtasks("/End", "/TN", Constants.TaskName);
    }

    private static void RunSchtasks(params string[] args)
    {
        try
        {
            using var p = Process.Start(new ProcessStartInfo
            {
                FileName = "schtasks.exe",
                Arguments = string.Join(" ", args),
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
            });
            p?.WaitForExit(5000);
        }
        catch
        {
            // The task may not be installed yet (run `npm run service:install`).
        }
    }
}
