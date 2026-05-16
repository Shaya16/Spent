using System.Windows;

namespace Spent;

public partial class App : Application
{
    private SpentTray? _tray;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        _tray = new SpentTray();
        _tray.Initialize();
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _tray?.Dispose();
        base.OnExit(e);
    }
}
