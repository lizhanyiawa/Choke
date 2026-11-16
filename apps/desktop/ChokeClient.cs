using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

internal sealed class ChokeClient : Form
{
    private const string GameOrigin = "http://localhost:5173";
    private const string TestOrigin = "http://127.0.0.1:5273";
    private readonly Uri start;
    private readonly string profile;
    private readonly bool developer;
    private readonly bool testLogin;
    private readonly string startupMode;
    private readonly DesktopServices services;
    private readonly CancellationTokenSource lifetime = new CancellationTokenSource();
    private readonly WebView2 view;
    private readonly Button returnToDesk;
    private readonly Label status;
    private readonly StartupScreen startup;
    private bool rendererConfigured;
    private bool servicesStarted;
    private TaskCompletionSource<bool> startupNavigation;
    private ulong startupNavigationId;
    private TaskCompletionSource<bool> startupPage;
    private int startupAttempt;
    private string startupMessage;
    private bool testStarting;
    private bool testReady;
    private Rectangle windowBounds;
    private FormWindowState windowState;
    private bool fullscreen;

    [DllImport("user32.dll")]
    private static extern bool SetProcessDpiAwarenessContext(IntPtr context);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr FindWindow(string className, string windowName);

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr window);

    [DllImport("user32.dll")]
    private static extern bool IsIconic(IntPtr window);

    [DllImport("user32.dll")]
    private static extern bool ShowWindowAsync(IntPtr window, int command);

    internal static void Run(string root, string bin, string[] args)
    {
        var wantsDeveloper = args.Contains("--developer");
        var firstAddress = args.FirstOrDefault(arg => !arg.StartsWith("--", StringComparison.Ordinal));
        Uri address;
        if (!Uri.TryCreate(firstAddress ?? (wantsDeveloper ? TestOrigin : GameOrigin), UriKind.Absolute, out address)
            || address.Scheme != Uri.UriSchemeHttp || !address.IsLoopback || address.UserInfo.Length != 0)
        {
            MessageBox.Show("客户端地址必须是本机 HTTP 地址。", "Choke!");
            return;
        }

        try { SetProcessDpiAwarenessContext(new IntPtr(-4)); }
        catch (EntryPointNotFoundException) { }

        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        var origin = address.GetLeftPart(UriPartial.Authority);
        var developer = wantsDeveloper && origin == TestOrigin;
        using (var services = new DesktopServices(root))
        using (var window = services.CreateLock(developer ? "developer-window" : "game-window"))
        {
            if (!DesktopServices.TryEnter(window))
            {
                var existing = FindWindow(null, Title(developer));
                if (existing != IntPtr.Zero)
                {
                    if (IsIconic(existing)) ShowWindowAsync(existing, 9);
                    SetForegroundWindow(existing);
                }
                return;
            }
            try
            {
                using (var icon = System.Drawing.Icon.ExtractAssociatedIcon(Application.ExecutablePath))
                using (var client = new ChokeClient(address, bin, developer, services))
                {
                    client.Icon = icon;
                    Application.Run(client);
                }
            }
            finally
            {
                services.Dispose();
                window.ReleaseMutex();
            }
        }
    }

    private static string Title(bool developerMode) { return developerMode ? "Choke! · 开发模式" : "Choke!"; }

    private ChokeClient(Uri address, string bin, bool developerMode, DesktopServices localServices)
    {
        start = address;
        developer = developerMode;
        testLogin = address.GetLeftPart(UriPartial.Authority) == GameOrigin;
        startupMode = developer ? "developer" : testLogin ? "game" : null;
        services = localServices;
        profile = Path.Combine(bin, developer ? "profile-dev" : "profile");
        Text = Title(developer);
        StartPosition = FormStartPosition.CenterScreen;
        ClientSize = new Size(1440, 870);
        MinimumSize = new Size(760, 560);
        BackColor = Color.FromArgb(19, 16, 23);
        view = new WebView2 { Dock = DockStyle.Fill, DefaultBackgroundColor = BackColor };
        status = new Label
        {
            Text = "正在启动 Choke…",
            Dock = DockStyle.Top,
            Height = 36,
            Padding = new Padding(14, 0, 0, 0),
            TextAlign = ContentAlignment.MiddleLeft,
            BackColor = BackColor,
            ForeColor = Color.FromArgb(249, 229, 245),
            Visible = false,
        };
        returnToDesk = new Button
        {
            Text = "‹  返回牌桌",
            Dock = DockStyle.Top,
            Height = 36,
            Padding = new Padding(12, 0, 0, 0),
            TextAlign = ContentAlignment.MiddleLeft,
            BackColor = BackColor,
            ForeColor = Color.FromArgb(249, 229, 245),
            FlatStyle = FlatStyle.Flat,
            Visible = false
        };
        returnToDesk.FlatAppearance.BorderSize = 0;
        returnToDesk.Click += (sender, args) => view.CoreWebView2.Navigate(start.AbsoluteUri);
        Controls.Add(view);
        Controls.Add(returnToDesk);
        Controls.Add(status);
        startup = new StartupScreen();
        startup.RetryRequested += StartRenderer;
        startup.ExitRequested += (sender, args) => Close();
        startup.Finished += (sender, args) => view.Focus();
        Controls.Add(startup);
        startup.BringToFront();
        Shown += StartRenderer;
    }

    private async void StartRenderer(object sender, EventArgs args)
    {
        startup.BeginAttempt();
        try
        {
            await Task.Yield();
            startup.SetProgress("正在准备本机游戏…", .42f);
            await Task.WhenAll(PrepareRenderer(), PrepareServices());
            lifetime.Token.ThrowIfCancellationRequested();
            startup.SetProgress("正在载入牌桌…", .74f);
            await OpenStartupPage(view.CoreWebView2);
            if (!lifetime.IsCancellationRequested) startup.GameReady();
        }
        catch (Exception error)
        {
            if (!lifetime.IsCancellationRequested) startup.ShowFailure(error.Message);
        }
    }

    private async Task PrepareRenderer()
    {
        if (rendererConfigured) return;
        if (view.CoreWebView2 == null)
        {
            var environment = await CoreWebView2Environment.CreateAsync(null, profile);
            lifetime.Token.ThrowIfCancellationRequested();
            await view.EnsureCoreWebView2Async(environment);
        }
        lifetime.Token.ThrowIfCancellationRequested();
        var renderer = view.CoreWebView2;
        renderer.Settings.AreDefaultContextMenusEnabled = false;
        renderer.Settings.AreDevToolsEnabled = developer;
        renderer.Settings.AreBrowserAcceleratorKeysEnabled = false;
        renderer.Settings.IsStatusBarEnabled = false;
        renderer.Settings.IsZoomControlEnabled = false;
        var origin = start.GetLeftPart(UriPartial.Authority);
        var developerScript = developer
            ? "Object.defineProperty(window, 'chokeDesktopDeveloper', { value: true });"
            : "";
        var inspectorKey = developer ? "(event.key === 'F12' ? 'inspect' : '')" : "''";
        var allowedOrigin = "location.origin === '" + origin + "'";
        var testAccountScript = "";
        if (testLogin)
        {
            allowedOrigin += " || location.origin === '" + TestOrigin + "'";
            testAccountScript = "Object.defineProperty(window, 'chokeDesktopTestAccount', { value: " +
                "location.origin === '" + origin + "' ? { enter: '" + TestOrigin + "/' } : { exit: '" + origin + "/' } });";
        }
        await renderer.AddScriptToExecuteOnDocumentCreatedAsync(
            "if (window.top === window && (" + allowedOrigin + ")) {" +
            developerScript +
            testAccountScript +
            "window.addEventListener('keydown', (event) => {" +
            " const message = event.key === 'F11' ? 'fullscreen' : " + inspectorKey + ";" +
            " if (!message) return;" +
            " event.preventDefault();" +
            " if (!event.repeat) window.chrome.webview.postMessage(message);" +
            "}); }"
        );
        lifetime.Token.ThrowIfCancellationRequested();
        renderer.NavigationStarting += OnNavigate;
        renderer.NavigationCompleted += OnNavigationCompleted;
        renderer.NewWindowRequested += OnNewWindow;
        renderer.WebMessageReceived += OnMessage;
        rendererConfigured = true;
    }

    private async Task PrepareServices()
    {
        if (startupMode == null || servicesStarted) return;
        await services.StartAsync(startupMode, lifetime.Token);
        servicesStarted = true;
    }

    private async Task OpenStartupPage(CoreWebView2 renderer)
    {
        startupNavigationId = 0;
        startupNavigation = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        try
        {
            renderer.Navigate(start.AbsoluteUri);
            await WaitForStartup(startupNavigation.Task, "载入牌桌超时。");
            startup.SetProgress("正在显示牌桌…", .9f);
            startupPage = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
            startupMessage = "choke-startup-ready-" + (++startupAttempt);
            // The web document can finish loading before React commits the first screen.
            await renderer.ExecuteScriptAsync(
                "(() => { const root = document.getElementById('root');" +
                " const send = () => window.chrome.webview.postMessage('" + startupMessage + "');" +
                " const painted = () => { if (document.hidden) send(); else requestAnimationFrame(() => requestAnimationFrame(send)); };" +
                " if (!root || root.firstElementChild) { painted(); return; }" +
                " const observer = new MutationObserver(() => { if (root.firstElementChild) { observer.disconnect(); painted(); } });" +
                " observer.observe(root, { childList: true }); })()"
            );
            await WaitForStartup(startupPage.Task, "牌桌页面未能完成渲染。");
        }
        catch
        {
            if (!lifetime.IsCancellationRequested) renderer.Stop();
            throw;
        }
        finally
        {
            startupNavigation = null;
            startupPage = null;
            startupMessage = null;
        }
    }

    private async Task WaitForStartup(Task pending, string message)
    {
        using (var wait = CancellationTokenSource.CreateLinkedTokenSource(lifetime.Token))
        {
            var timeout = Task.Delay(TimeSpan.FromSeconds(20), wait.Token);
            var completed = await Task.WhenAny(pending, timeout);
            lifetime.Token.ThrowIfCancellationRequested();
            if (completed != pending) throw new TimeoutException(message);
            wait.Cancel();
            await pending;
        }
    }

    private async void OpenTestDesk(Uri address)
    {
        testStarting = true;
        status.Text = "正在连接测试号…";
        status.Visible = true;
        try
        {
            await services.StartAsync("test", lifetime.Token);
            if (lifetime.IsCancellationRequested) return;
            testReady = true;
            view.CoreWebView2.Navigate(address.AbsoluteUri);
        }
        catch (Exception error)
        {
            if (lifetime.IsCancellationRequested) return;
            status.Visible = false;
            MessageBox.Show(this, error.Message, "Choke! · 测试号连接失败", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
        finally { testStarting = false; }
    }

    protected override void OnFormClosed(FormClosedEventArgs args)
    {
        lifetime.Cancel();
        base.OnFormClosed(args);
    }

    private bool IsClient(Uri uri)
    {
        return uri.GetLeftPart(UriPartial.Authority) == start.GetLeftPart(UriPartial.Authority) || IsTestDesk(uri);
    }

    private bool IsTestDesk(Uri uri)
    {
        return testLogin && uri != null && uri.GetLeftPart(UriPartial.Authority) == TestOrigin;
    }

    private bool IsLogin(Uri uri)
    {
        return !developer && !IsTestDesk(view.Source) && ((uri.Scheme == Uri.UriSchemeHttps && uri.Host == "osu.ppy.sh")
            || (uri.Scheme == Uri.UriSchemeHttp && uri.IsLoopback && uri.Port == 3100
                && uri.AbsolutePath.StartsWith("/auth/", StringComparison.Ordinal)));
    }

    private void OnNavigate(object sender, CoreWebView2NavigationStartingEventArgs args)
    {
        Uri uri;
        if (Uri.TryCreate(args.Uri, UriKind.Absolute, out uri))
        {
            if (IsTestDesk(uri) && !testReady)
            {
                args.Cancel = true;
                if (!testStarting) OpenTestDesk(uri);
                return;
            }
            var login = IsLogin(uri);
            if (login || IsClient(uri))
            {
                if (startupNavigation != null) startupNavigationId = args.NavigationId;
                returnToDesk.Visible = login;
                return;
            }
        }
        args.Cancel = true;
        if (args.IsUserInitiated && uri != null) OpenLink(uri);
    }

    private void OnNavigationCompleted(object sender, CoreWebView2NavigationCompletedEventArgs args)
    {
        if (startupNavigation != null && args.NavigationId == startupNavigationId)
        {
            if (args.IsSuccess && args.HttpStatusCode < 400) startupNavigation.TrySetResult(true);
            else startupNavigation.TrySetException(new InvalidOperationException(
                "无法载入牌桌（" + (args.HttpStatusCode >= 400 ? "HTTP " + args.HttpStatusCode : args.WebErrorStatus.ToString()) + "）。"));
            return;
        }
        if (args.WebErrorStatus == CoreWebView2WebErrorStatus.OperationCanceled) return;
        status.Visible = false;
        if (!args.IsSuccess && IsTestDesk(view.Source))
        {
            testReady = false;
            returnToDesk.Visible = true;
        }
    }

    private void OnNewWindow(object sender, CoreWebView2NewWindowRequestedEventArgs args)
    {
        args.Handled = true;
        Uri uri;
        if (!args.IsUserInitiated || !Uri.TryCreate(args.Uri, UriKind.Absolute, out uri)) return;
        if (IsClient(uri)) view.CoreWebView2.Navigate(uri.AbsoluteUri);
        else OpenLink(uri);
    }

    private static void OpenLink(Uri uri)
    {
        if (uri.Scheme != Uri.UriSchemeHttps && uri.Scheme != Uri.UriSchemeHttp) return;
        Process.Start(new ProcessStartInfo(uri.AbsoluteUri) { UseShellExecute = true });
    }

    private void OnMessage(object sender, CoreWebView2WebMessageReceivedEventArgs args)
    {
        Uri source;
        if (!Uri.TryCreate(args.Source, UriKind.Absolute, out source) || !IsClient(source)) return;
        if (startupPage != null && args.WebMessageAsJson == "\"" + startupMessage + "\"")
        {
            startupPage.TrySetResult(true);
            return;
        }
        if (developer && args.WebMessageAsJson == "\"inspect\"")
        {
            view.CoreWebView2.OpenDevToolsWindow();
            return;
        }
        if (args.WebMessageAsJson != "\"fullscreen\"") return;

        if (fullscreen)
        {
            FormBorderStyle = FormBorderStyle.Sizable;
            Bounds = windowBounds;
            WindowState = windowState;
        }
        else
        {
            var screen = Screen.FromControl(this).Bounds;
            windowState = WindowState;
            windowBounds = WindowState == FormWindowState.Normal ? Bounds : RestoreBounds;
            WindowState = FormWindowState.Normal;
            FormBorderStyle = FormBorderStyle.None;
            Bounds = screen;
        }
        fullscreen = !fullscreen;
    }
}
