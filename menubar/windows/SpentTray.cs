using System.Drawing;
using System.Reflection;
using System.Windows.Forms;

namespace Spent;

internal sealed class SpentTray : IDisposable
{
    private readonly NotifyIcon _notify;
    private readonly StatusModel _status;

    public SpentTray()
    {
        _notify = new NotifyIcon
        {
            Icon = LoadIcon(),
            Text = "Spent",
            ContextMenuStrip = BuildMenu(),
            Visible = true,
        };

        _notify.MouseClick += (_, e) =>
        {
            if (e.Button == MouseButtons.Left)
            {
                Services.OpenSpent();
            }
        };

        _status = new StatusModel();
        _status.PropertyChanged += (_, _) => UpdateTooltip();
        _status.Start();
        UpdateTooltip();
    }

    private static Icon LoadIcon()
    {
        var asm = Assembly.GetExecutingAssembly();
        using var stream = asm.GetManifestResourceStream("Spent.Resources.spent.ico")
            ?? throw new InvalidOperationException("Embedded resource 'Spent.Resources.spent.ico' not found.");
        return new Icon(stream);
    }

    private static ContextMenuStrip BuildMenu()
    {
        var menu = new ContextMenuStrip();
        menu.Items.Add("Open dashboard", null, (_, _) => Services.OpenSpent());
        menu.Items.Add("Sync now", null, (_, _) => Services.SyncNow());
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Start service", null, (_, _) => Services.StartService());
        menu.Items.Add("Stop service", null, (_, _) => Services.StopService());
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Quit", null, (_, _) => Application.Exit());
        return menu;
    }

    private void UpdateTooltip()
    {
        var text = _status.IsOnline
            ? string.IsNullOrEmpty(_status.Version) ? "Spent: running" : $"Spent: running v{_status.Version}"
            : "Spent: stopped";
        if (text.Length > 127) text = text.Substring(0, 127);
        _notify.Text = text;
    }

    public void Dispose()
    {
        _notify.Visible = false;
        _notify.Dispose();
        _status.Dispose();
    }
}
