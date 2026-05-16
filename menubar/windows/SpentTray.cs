using System.ComponentModel;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Media;
using H.NotifyIcon;

namespace Spent;

internal sealed class SpentTray : IDisposable
{
    private TaskbarIcon? _icon;
    private StatusModel? _model;
    private PopupContent? _popup;

    public void Initialize()
    {
        _model = new StatusModel();
        _popup = new PopupContent { DataContext = _model };

        _icon = new TaskbarIcon
        {
            ToolTipText = "Spent",
            TrayPopup = _popup,
            PopupActivation = PopupActivationMode.LeftClick,
            ContextMenu = BuildContextMenu(),
            NoLeftClickDelay = true,
        };

        UpdateIcon();
        _model.PropertyChanged += OnModelChanged;

        PopupContent.DismissRequested = HidePopup;

        InstallShortcuts();

        _model.Start();
    }

    private static ContextMenu BuildContextMenu()
    {
        var menu = new ContextMenu();
        var open = new MenuItem { Header = "Open dashboard" };
        open.Click += (_, _) => Services.OpenSpent();
        var sync = new MenuItem { Header = "Sync now" };
        sync.Click += (_, _) => Services.SyncNow();
        var start = new MenuItem { Header = "Start service" };
        start.Click += (_, _) => Services.StartService();
        var stop = new MenuItem { Header = "Stop service" };
        stop.Click += (_, _) => Services.StopService();
        var quit = new MenuItem { Header = "Quit menu bar" };
        quit.Click += (_, _) => Application.Current.Shutdown();

        menu.Items.Add(open);
        menu.Items.Add(sync);
        menu.Items.Add(new Separator());
        menu.Items.Add(start);
        menu.Items.Add(stop);
        menu.Items.Add(new Separator());
        menu.Items.Add(quit);
        return menu;
    }

    private void InstallShortcuts()
    {
        if (_popup is null) return;
        _popup.InputBindings.Add(new KeyBinding(
            new RelayCommand(() => { Services.OpenSpent(); HidePopup(); }),
            Key.O, ModifierKeys.Control));
        _popup.InputBindings.Add(new KeyBinding(
            new RelayCommand(() => { Services.SyncNow(); HidePopup(); }),
            Key.S, ModifierKeys.Control));
        _popup.InputBindings.Add(new KeyBinding(
            new RelayCommand(() => Application.Current.Shutdown()),
            Key.Q, ModifierKeys.Control));
    }

    private void HidePopup()
    {
        if (_icon?.TrayPopupResolved is Popup p)
        {
            p.IsOpen = false;
        }
    }

    private void OnModelChanged(object? sender, PropertyChangedEventArgs e)
    {
        if (e.PropertyName == nameof(StatusModel.IsOnline))
        {
            UpdateIcon();
        }
    }

    private void UpdateIcon()
    {
        if (_icon is null || _model is null) return;
        var online = _model.IsOnline;
        _icon.IconSource = Logo.RenderTrayIcon(
            pixelSize: 32,
            color: Colors.White,
            opacity: online ? 1.0 : 0.45);
        _icon.ToolTipText = online
            ? string.IsNullOrEmpty(_model.Version) ? "Spent — running" : $"Spent — running · v{_model.Version}"
            : "Spent — stopped";
    }

    public void Dispose()
    {
        PopupContent.DismissRequested = null;
        _model?.Dispose();
        _icon?.Dispose();
    }
}
