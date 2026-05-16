using System.ComponentModel;
using System.Net;
using System.Net.Http;
using System.Runtime.CompilerServices;
using System.Text.Json;

namespace Spent;

// Polls GET /api/health every 5s; mirrors menubar/mac StatusModel.
internal sealed class StatusModel : INotifyPropertyChanged, IDisposable
{
    private readonly HttpClient _http;
    private readonly CancellationTokenSource _cts = new();
    private readonly SynchronizationContext? _uiContext;
    private bool _isOnline;
    private string _version = string.Empty;

    public StatusModel()
    {
        // Captured on the UI thread (set up by ApplicationConfiguration.Initialize).
        _uiContext = SynchronizationContext.Current;
        // Restrict to loopback only. Any non-127.0.0.1 URL is short-circuited.
        var handler = new HttpClientHandler
        {
            UseProxy = false,
            AllowAutoRedirect = false,
        };
        _http = new HttpClient(handler) { Timeout = TimeSpan.FromSeconds(2) };
    }

    public event PropertyChangedEventHandler? PropertyChanged;

    public bool IsOnline
    {
        get => _isOnline;
        private set
        {
            if (Set(ref _isOnline, value))
            {
                PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(StatusText)));
            }
        }
    }

    public string Version
    {
        get => _version;
        private set
        {
            if (Set(ref _version, value))
            {
                PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(nameof(StatusText)));
            }
        }
    }

    public string StatusText =>
        !_isOnline ? "Stopped"
        : string.IsNullOrEmpty(_version) ? "Running"
        : $"Running · v{_version}";

    public void Start()
    {
        _ = PollLoopAsync(_cts.Token);
    }

    public async Task PollOnceAsync()
    {
        try
        {
            using var resp = await _http.GetAsync(Constants.HealthUrl, _cts.Token).ConfigureAwait(false);
            if (resp.StatusCode != HttpStatusCode.OK)
            {
                UpdateOnUi(false, string.Empty);
                return;
            }
            var body = await resp.Content.ReadAsStringAsync(_cts.Token).ConfigureAwait(false);
            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;
            var ok = root.TryGetProperty("ok", out var okEl) && okEl.ValueKind == JsonValueKind.True;
            var ver = root.TryGetProperty("version", out var verEl) && verEl.ValueKind == JsonValueKind.String
                ? verEl.GetString() ?? string.Empty
                : string.Empty;
            UpdateOnUi(ok, ver);
        }
        catch
        {
            UpdateOnUi(false, string.Empty);
        }
    }

    private async Task PollLoopAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            await PollOnceAsync().ConfigureAwait(false);
            try
            {
                await Task.Delay(TimeSpan.FromSeconds(5), ct).ConfigureAwait(false);
            }
            catch (OperationCanceledException)
            {
                return;
            }
        }
    }

    private void UpdateOnUi(bool online, string version)
    {
        if (_uiContext is null || SynchronizationContext.Current == _uiContext)
        {
            IsOnline = online;
            Version = version;
        }
        else
        {
            _uiContext.Post(_ =>
            {
                IsOnline = online;
                Version = version;
            }, null);
        }
    }

    private bool Set<T>(ref T field, T value, [CallerMemberName] string? name = null)
    {
        if (EqualityComparer<T>.Default.Equals(field, value)) return false;
        field = value;
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
        return true;
    }

    public void Dispose()
    {
        _cts.Cancel();
        _cts.Dispose();
        _http.Dispose();
    }
}
