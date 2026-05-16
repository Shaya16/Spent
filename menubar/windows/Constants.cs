namespace Spent;

// Network access is intentionally limited to 127.0.0.1 for health/sync.
// OpenInBrowserUrl is handed to ShellExecute so the user's browser opens
// the friendly hostname; that's not subject to this app's HTTP client.
internal static class Constants
{
    public const string OpenInBrowserUrl = "http://spent.local:41234";
    public const string HealthUrl = "http://127.0.0.1:41234/api/health";
    public const string SyncUrl = "http://127.0.0.1:41234/api/sync";
    public const string SameOrigin = "http://127.0.0.1:41234";
    public const string TaskName = "Spent";
    public const int PopupWidth = 264;
}
