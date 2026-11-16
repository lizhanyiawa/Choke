using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Globalization;
using System.Reflection;
using System.Text.RegularExpressions;
using System.Windows.Forms;
using System.Xml;

internal sealed class StartupScreen : Control
{
    private const float LogoWidth = 141.01f;
    private const float LogoHeight = 210.13f;
    private const double LogoFormed = 1.34;
    private const double MinimumReveal = 1.59;
    private const double SlowStart = 2.35;
    private const double HandoffTime = .35;
    private static readonly Color Ink = Color.FromArgb(19, 16, 23);
    private static readonly Color Cyan = Color.FromArgb(60, 186, 219);
    private static readonly Color Pink = Color.FromArgb(217, 72, 138);
    private readonly System.Windows.Forms.Timer frame = new System.Windows.Forms.Timer { Interval = 16 };
    private readonly Stopwatch clock = new Stopwatch();
    private readonly LogoPart[] logo = ReadLogo();
    private readonly Button retry;
    private readonly Button exit;
    private readonly bool motion = SystemInformation.UIEffectsEnabled;
    private double handoff = -1;
    private bool ready;
    private string failure;
    private string status = "正在准备桌面客户端…";
    private float progress = .18f;

    public event EventHandler RetryRequested;
    public event EventHandler ExitRequested;
    public event EventHandler Finished;

    public StartupScreen()
    {
        Dock = DockStyle.Fill;
        DoubleBuffered = true;
        ResizeRedraw = true;
        BackColor = Ink;
        ForeColor = Color.FromArgb(245, 230, 243);
        Font = SystemFonts.MessageBoxFont;
        AccessibleName = "Choke! 启动";
        retry = CreateButton("重试", Color.FromArgb(119, 55, 97));
        exit = CreateButton("退出", Color.FromArgb(42, 33, 49));
        retry.Click += (sender, args) => { if (RetryRequested != null) RetryRequested(this, EventArgs.Empty); };
        exit.Click += (sender, args) => { if (ExitRequested != null) ExitRequested(this, EventArgs.Empty); };
        Controls.Add(retry);
        Controls.Add(exit);
        frame.Tick += (sender, args) => Advance();
    }

    private Button CreateButton(string text, Color color)
    {
        var button = new Button {
            Text = text, BackColor = color, ForeColor = ForeColor, FlatStyle = FlatStyle.Flat, Visible = false,
            UseVisualStyleBackColor = false,
        };
        button.FlatAppearance.BorderColor = Color.FromArgb(105, 78, 105);
        button.FlatAppearance.MouseOverBackColor = Color.FromArgb(137, 67, 114);
        button.FlatAppearance.MouseDownBackColor = Color.FromArgb(95, 49, 85);
        return button;
    }

    public void BeginAttempt()
    {
        if (!clock.IsRunning) clock.Start();
        failure = null;
        AccessibleDescription = null;
        ready = false;
        retry.Visible = exit.Visible = false;
        SetProgress("正在准备桌面客户端…", .18f);
        StartFrames();
    }

    public void SetProgress(string message, float amount)
    {
        status = message;
        progress = amount;
        Invalidate();
    }

    public void ShowFailure(string message)
    {
        failure = message;
        AccessibleDescription = message;
        retry.Visible = exit.Visible = true;
        PlaceButtons();
        retry.Focus();
        Invalidate();
    }

    public void GameReady()
    {
        ready = true;
        StartFrames();
    }

    private void StartFrames()
    {
        frame.Interval = 16;
        frame.Start();
        Invalidate();
    }

    private void Advance()
    {
        var time = clock.Elapsed.TotalSeconds;
        if (ready && handoff < 0 && time >= (motion ? MinimumReveal : .22)) handoff = time;
        if (handoff >= 0)
        {
            if (!motion || time - handoff >= HandoffTime)
            {
                frame.Stop();
                Hide();
                if (Finished != null) Finished(this, EventArgs.Empty);
                return;
            }
            SetWipe(time);
        }
        else if (!ready && (!motion || time >= LogoFormed))
        {
            if (failure == null && time < SlowStart)
                frame.Interval = Math.Max(16, (int)Math.Ceiling((SlowStart - time) * 1000));
            else frame.Stop();
        }
        Invalidate();
    }

    private float WipeEdge(double time)
    {
        var fraction = Ramp(time, handoff, handoff + HandoffTime);
        return Width + Height * .21f - fraction * (Width + Height * .42f);
    }

    private void SetWipe(double time)
    {
        if (Width <= 0 || Height <= 0) return;
        var edge = WipeEdge(time);
        var skew = Height * .21f;
        using (var shape = new GraphicsPath())
        {
            shape.AddPolygon(new[] { new PointF(0, 0), new PointF(Math.Max(0, edge + skew), 0),
                new PointF(Math.Max(0, edge - skew), Height), new PointF(0, Height) });
            var previous = Region;
            Region = new Region(shape);
            if (previous != null) previous.Dispose();
        }
    }

    private float LogoSize { get { return Math.Min(232f * DeviceDpi / 96, Math.Min(Width * .47f, Height * .40f)); } }
    private float LogoCenter { get { return Height * .427f; } }
    private int StatusTop { get { return (int)(LogoCenter + LogoSize / 2 + 27 * DeviceDpi / 96f); } }

    protected override void OnResize(EventArgs args)
    {
        base.OnResize(args);
        if (retry == null) return;
        PlaceButtons();
        if (handoff >= 0 && Visible && motion) SetWipe(clock.Elapsed.TotalSeconds);
    }

    private void PlaceButtons()
    {
        var dpi = DeviceDpi / 96f;
        var width = (int)(88 * dpi);
        var gap = (int)(12 * dpi);
        var height = (int)(31 * dpi);
        var top = Math.Max(0, Math.Min(Height - height - (int)(16 * dpi), StatusTop + (int)(80 * dpi)));
        retry.SetBounds((Width - gap) / 2 - width, top, width, height);
        exit.SetBounds((Width + gap) / 2, top, width, height);
    }

    protected override void OnPaint(PaintEventArgs args)
    {
        base.OnPaint(args);
        PaintScene(args.Graphics, clock.Elapsed.TotalSeconds);
    }

    private void PaintScene(Graphics g, double time)
    {
        if (Width <= 0 || Height <= 0 || LogoSize <= 0) return;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        // The color field stays still after the two card edges meet.
        using (var halo = new GraphicsPath())
        {
            var span = Math.Min(Width, Height * 2.25f);
            halo.AddEllipse((Width - span) / 2, LogoCenter - Height * .58f, span, Height * 1.16f);
            using (var background = new PathGradientBrush(halo) {
                CenterColor = Color.FromArgb(37, 27, 47), SurroundColors = new[] { Ink },
            }) g.FillPath(background, halo);
        }
        var scale = LogoSize / LogoHeight;
        var state = g.Save();
        g.TranslateTransform((Width - LogoWidth * scale) / 2, LogoCenter - LogoSize / 2);
        g.ScaleTransform(scale, scale);
        PaintLogo(g, motion ? time : LogoFormed);
        g.Restore(state);

        if (failure != null) PaintStatus(g, true);
        else if (!ready && time >= SlowStart) PaintStatus(g, false);
        if (handoff >= 0)
        {
            var edge = WipeEdge(time);
            using (var seam = new Pen(Color.FromArgb(170, 255, 169, 219), 3f * DeviceDpi / 96))
                g.DrawLine(seam, edge + Height * .21f, 0, edge - Height * .21f, Height);
        }
    }

    private void PaintLogo(Graphics g, double time)
    {
        if (time >= LogoFormed)
        {
            foreach (var part in logo) Fill(g, part, part.Color);
            return;
        }
        var trace = Ramp(time, .03, .60);
        var traceLight = (int)(146 * Ramp(time, .02, .16) * (1 - Ramp(time, .52, 1.08)));
        using (var cool = new Pen(Color.FromArgb(traceLight, Cyan), .9f))
        using (var warm = new Pen(Color.FromArgb(traceLight, Pink), .9f))
        {
            DrawGuide(g, cool, new PointF(129, 9), new PointF(15, 69), trace);
            DrawGuide(g, warm, new PointF(12, 202), new PointF(126, 142), trace);
        }
        Slice(g, logo[0], Ramp(time, .18, 1.07), false, Cyan);
        Slice(g, logo[1], Ramp(time, .12, .78), false, Cyan);
        Slice(g, logo[2], Ramp(time, .18, .86), true, Pink);
        Slice(g, logo[3], Ramp(time, .83, 1.17), false, Pink);
        Ring(g, logo[4], Ramp(time, .67, 1.17));
        Ring(g, logo[5], Ramp(time, .98, 1.20));
        Slice(g, logo[6], Ramp(time, .25, 1.14), true, Pink);
    }

    private static void DrawGuide(Graphics g, Pen pen, PointF start, PointF end, float progress)
    {
        g.DrawLine(pen, start, new PointF(start.X + (end.X - start.X) * progress, start.Y + (end.Y - start.Y) * progress));
    }

    private static float Ramp(double time, double start, double end)
    {
        var t = (float)Math.Max(0, Math.Min(1, (time - start) / (end - start)));
        return t * t * (3 - 2 * t);
    }

    private static void Fill(Graphics g, LogoPart part, Color color)
    {
        using (var brush = new SolidBrush(color)) g.FillPath(brush, part.Path);
    }

    private static void Slice(Graphics g, LogoPart part, float progress, bool reverse, Color accent)
    {
        if (progress <= 0) return;
        if (progress >= 1) { Fill(g, part, part.Color); return; }
        var bounds = part.Bounds;
        var lean = bounds.Width * .24f;
        var left = bounds.Left - 2;
        var right = bounds.Right + 2;
        var edge = bounds.Top - lean + (bounds.Height + 2 * lean) * (reverse ? 1 - progress : progress);
        var limit = reverse ? bounds.Bottom + 2 : bounds.Top - 2;
        var a = new PointF(left, edge - lean);
        var b = new PointF(right, edge + lean);
        using (var reveal = new GraphicsPath())
        {
            // Clamp the outer edge so the reveal stays a convex slice at either end.
            reveal.AddPolygon(new[] { new PointF(left, limit), new PointF(right, limit),
                new PointF(right, reverse ? Math.Min(limit, b.Y) : Math.Max(limit, b.Y)),
                new PointF(left, reverse ? Math.Min(limit, a.Y) : Math.Max(limit, a.Y)) });
            var clip = g.Save();
            g.SetClip(reveal, CombineMode.Intersect);
            Fill(g, part, part.Color);
            g.SetClip(part.Path, CombineMode.Intersect);
            using (var light = new Pen(Color.FromArgb((int)(190 * Math.Sin(progress * Math.PI)), ControlPaint.LightLight(accent)), 2.6f))
                g.DrawLine(light, a, b);
            g.Restore(clip);
        }
    }

    private static void Ring(Graphics g, LogoPart part, float progress)
    {
        if (progress <= 0) return;
        if (progress >= 1) { Fill(g, part, part.Color); return; }
        var bounds = part.Bounds;
        var x = bounds.Left + bounds.Width / 2;
        var y = bounds.Top + bounds.Height / 2;
        var radius = (float)Math.Sqrt(bounds.Width * bounds.Width + bounds.Height * bounds.Height) / 2;
        using (var circle = new GraphicsPath())
        {
            var outer = radius * (1.44f - .44f * progress);
            var inner = radius * (1 - progress);
            circle.AddEllipse(x - inner, y - inner, inner * 2, inner * 2);
            var clip = g.Save();
            g.SetClip(circle, CombineMode.Exclude);
            Fill(g, part, part.Color);
            g.Restore(clip);
            using (var pen = new Pen(Color.FromArgb((int)(156 * Math.Sin(progress * Math.PI)), part.Color), .9f))
                g.DrawEllipse(pen, x - outer, y - outer, outer * 2, outer * 2);
        }
    }

    private void PaintStatus(Graphics g, bool failed)
    {
        var dpi = DeviceDpi / 96f;
        var top = StatusTop;
        var width = Math.Min(Width - (int)(48 * dpi), (int)(490 * dpi));
        if (width < 12) return;
        var x = (Width - width) / 2;
        var flags = TextFormatFlags.HorizontalCenter | TextFormatFlags.NoPrefix;
        if (failed)
        {
            using (var title = new Font(Font, FontStyle.Bold))
                TextRenderer.DrawText(g, "启动失败", title, new Rectangle(x, top, width, (int)(19 * dpi)), ForeColor, flags);
            TextRenderer.DrawText(g, failure, Font, new Rectangle(x, top + (int)(22 * dpi), width, (int)(53 * dpi)),
                Color.FromArgb(203, 185, 207), flags | TextFormatFlags.WordBreak | TextFormatFlags.EndEllipsis);
            return;
        }
        TextRenderer.DrawText(g, status, Font, new Rectangle(x, top, width, (int)(24 * dpi)), Color.FromArgb(187, 171, 192), flags);
        var line = Math.Min(width, 133 * dpi);
        var left = (Width - line) / 2;
        using (var track = new Pen(Color.FromArgb(69, 53, 74), 2 * dpi))
        using (var fill = new Pen(Color.FromArgb(162, 101, 150), 2 * dpi))
        {
            g.DrawLine(track, left, top + 27 * dpi, left + line, top + 27 * dpi);
            g.DrawLine(fill, left, top + 27 * dpi, left + line * progress, top + 27 * dpi);
        }
    }

    private sealed class LogoPart
    {
        public readonly GraphicsPath Path;
        public readonly RectangleF Bounds;
        public readonly Color Color;

        public LogoPart(GraphicsPath path, Color color)
        {
            Path = path;
            Bounds = path.GetBounds();
            Color = color;
        }
    }

    private static LogoPart[] ReadLogo()
    {
        var document = new XmlDocument { XmlResolver = null };
        using (var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream("Choke.StartupLogo"))
            document.Load(stream);
        var parts = new List<LogoPart>();
        foreach (XmlElement element in document.GetElementsByTagName("path", "http://www.w3.org/2000/svg"))
        {
            var tokens = Regex.Matches(element.GetAttribute("d"), @"[A-Za-z]|-?(?:\d+(?:\.\d+)?|\.\d+)");
            var i = 0;
            var path = new GraphicsPath(FillMode.Winding);
            var point = PointF.Empty;
            while (i < tokens.Count)
            {
                switch (tokens[i++].Value)
                {
                    case "M": path.StartFigure(); point = ReadPoint(tokens, ref i); break;
                    case "L":
                        var end = ReadPoint(tokens, ref i);
                        path.AddLine(point, end);
                        point = end;
                        break;
                    case "C":
                        var controlA = ReadPoint(tokens, ref i);
                        var controlB = ReadPoint(tokens, ref i);
                        var next = ReadPoint(tokens, ref i);
                        path.AddBezier(point, controlA, controlB, next);
                        point = next;
                        break;
                    case "Z": path.CloseFigure(); break;
                    default: throw new InvalidOperationException("Choke 标识包含无法读取的路径。");
                }
            }
            parts.Add(new LogoPart(path, ColorTranslator.FromHtml(element.GetAttribute("fill"))));
        }
        if (parts.Count != 7) throw new InvalidOperationException("Choke 标识需要七个图形。");
        return parts.ToArray();
    }

    private static PointF ReadPoint(MatchCollection values, ref int index)
    {
        var x = float.Parse(values[index++].Value, CultureInfo.InvariantCulture);
        var y = float.Parse(values[index++].Value, CultureInfo.InvariantCulture);
        return new PointF(x, y);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            frame.Dispose();
            foreach (var part in logo) part.Path.Dispose();
        }
        base.Dispose(disposing);
    }
}
