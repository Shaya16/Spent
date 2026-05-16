using System.Globalization;
using System.Windows;
using System.Windows.Data;
using System.Windows.Media;

namespace Spent;

public sealed class BoolToVisibilityConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        => value is true ? Visibility.Visible : Visibility.Collapsed;

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        => throw new NotSupportedException();
}

public sealed class NotBoolToVisibilityConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        => value is true ? Visibility.Collapsed : Visibility.Visible;

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        => throw new NotSupportedException();
}

public sealed class StatusFillConverter : IValueConverter
{
    private static readonly SolidColorBrush Online = Freeze(Color.FromRgb(0x34, 0xC7, 0x59));
    private static readonly SolidColorBrush Offline = Freeze(Color.FromRgb(0x8E, 0x8E, 0x93));

    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        => value is true ? Online : Offline;

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        => throw new NotSupportedException();

    private static SolidColorBrush Freeze(Color c)
    {
        var b = new SolidColorBrush(c);
        b.Freeze();
        return b;
    }
}

