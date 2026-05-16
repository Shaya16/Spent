using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace Spent;

// Vector copy of public/logo_*.svg (149x184 viewBox, stroke-width 9 in SVG).
// Mirrors menubar/mac/Sources/Spent/SpentApp.swift LogoShape so the Windows
// tray icon and popup match the macOS menu bar pixel-for-pixel.
internal static class Logo
{
    private const double ViewBoxWidth = 149.0;
    private const double ViewBoxHeight = 184.0;

    public static Geometry CreateGeometry(double width, double height)
    {
        var s = Math.Min(width / ViewBoxWidth, height / ViewBoxHeight);
        var dx = (width - ViewBoxWidth * s) / 2.0;
        var dy = (height - ViewBoxHeight * s) / 2.0;
        Point Pt(double x, double y) => new(dx + x * s, dy + y * s);

        var group = new GeometryGroup { FillRule = FillRule.Nonzero };

        // Left circle: center (32, 53.6221), r = 27.5
        group.Children.Add(new EllipseGeometry(Pt(32, 53.6221), 27.5 * s, 27.5 * s));

        // Top diagonal stroke path
        var top = new PathFigure { StartPoint = Pt(32.5, 26.1221), IsFilled = false, IsClosed = false };
        top.Segments.Add(new BezierSegment(Pt(32.5, 26.1221), Pt(53.5, 30.1221), Pt(70.5, 23.1221), true));
        top.Segments.Add(new BezierSegment(Pt(87.5, 16.1221), Pt(100, 3.12207), Pt(100, 3.12207), true));
        top.Segments.Add(new LineSegment(Pt(49.5, 138.122), true));
        group.Children.Add(new PathGeometry(new[] { top }));

        // Bottom curve stroke path
        var bottom = new PathFigure { StartPoint = Pt(13.5, 158.122), IsFilled = false, IsClosed = false };
        bottom.Segments.Add(new BezierSegment(Pt(13.5, 158.122), Pt(31, 180.622), Pt(75, 179.122), true));
        bottom.Segments.Add(new BezierSegment(Pt(119, 177.622), Pt(133.5, 158.122), Pt(133.5, 158.122), true));
        group.Children.Add(new PathGeometry(new[] { bottom }));

        // Right circle: center (117, 85.6221), r = 27.5
        group.Children.Add(new EllipseGeometry(Pt(117, 85.6221), 27.5 * s, 27.5 * s));

        group.Freeze();
        return group;
    }

    public static BitmapSource RenderTrayIcon(int pixelSize, Color color, double opacity)
    {
        var strokeScale = pixelSize / 32.0;
        var visual = new DrawingVisual();
        using (var dc = visual.RenderOpen())
        {
            var brush = new SolidColorBrush(color) { Opacity = opacity };
            brush.Freeze();
            var pen = new Pen(brush, 2.2 * strokeScale)
            {
                StartLineCap = PenLineCap.Flat,
                EndLineCap = PenLineCap.Flat,
                LineJoin = PenLineJoin.Miter,
            };
            pen.Freeze();

            var geom = CreateGeometry(pixelSize, pixelSize);
            dc.DrawGeometry(null, pen, geom);
        }

        var rtb = new RenderTargetBitmap(pixelSize, pixelSize, 96, 96, PixelFormats.Pbgra32);
        rtb.Render(visual);

        // H.NotifyIcon's ImageSource->stream helper only handles URI-backed
        // images, so write the PNG to %TEMP% and load it back via file URI.
        var encoder = new PngBitmapEncoder();
        encoder.Frames.Add(BitmapFrame.Create(rtb));
        var tempPath = System.IO.Path.Combine(
            System.IO.Path.GetTempPath(),
            $"spent-tray-{pixelSize}-{(uint)color.ToString().GetHashCode():x8}.png");
        using (var fs = System.IO.File.Create(tempPath))
        {
            encoder.Save(fs);
        }

        var bi = new BitmapImage();
        bi.BeginInit();
        bi.UriSource = new Uri(tempPath, UriKind.Absolute);
        bi.CacheOption = BitmapCacheOption.OnLoad;
        bi.EndInit();
        bi.Freeze();
        return bi;
    }
}
