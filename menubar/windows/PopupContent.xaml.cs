using System.Windows;
using System.Windows.Controls;

namespace Spent;

public partial class PopupContent : UserControl
{
    // Set by SpentTray on initialization. Called when the popup wants to close
    // itself (e.g. after the user picks an action that takes focus away).
    public static Action? DismissRequested;

    public PopupContent()
    {
        InitializeComponent();
        Loaded += OnLoaded;
    }

    private void OnLoaded(object sender, RoutedEventArgs e)
    {
        HeaderLogo.Data = Logo.CreateGeometry(HeaderLogo.Width, HeaderLogo.Height);
    }

    private StatusModel? Model => DataContext as StatusModel;

    private static void Dismiss()
    {
        DismissRequested?.Invoke();
    }

    private void OpenDashboard_Click(object sender, RoutedEventArgs e)
    {
        Services.OpenSpent();
        Dismiss();
    }

    private void SyncNow_Click(object sender, RoutedEventArgs e)
    {
        Services.SyncNow();
        Dismiss();
    }

    private async void StartService_Click(object sender, RoutedEventArgs e)
    {
        Services.StartService();
        if (Model is { } m)
        {
            await m.PollOnceAsync();
        }
    }

    private async void StopService_Click(object sender, RoutedEventArgs e)
    {
        Services.StopService();
        if (Model is { } m)
        {
            await m.PollOnceAsync();
        }
    }

    private void Quit_Click(object sender, RoutedEventArgs e)
    {
        Application.Current.Shutdown();
    }
}
