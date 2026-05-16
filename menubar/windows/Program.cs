using System.Windows.Forms;

namespace Spent;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();
        using var tray = new SpentTray();
        Application.Run();
    }
}
