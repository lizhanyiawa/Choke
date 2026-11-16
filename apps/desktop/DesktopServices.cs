using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

internal sealed class DesktopServices : IDisposable
{
    private readonly string root;
    private readonly string logDirectory;
    private readonly List<Process> children = new List<Process>();
    private readonly object logLock = new object();

    public DesktopServices(string rootDirectory)
    {
        root = rootDirectory;
        logDirectory = Path.Combine(root, ".cache", "desktop");
    }

    public Mutex CreateLock(string name)
    {
        using (var sha = SHA256.Create())
        {
            var path = Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar).ToUpperInvariant();
            return new Mutex(false, "Local\\Choke-" + BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(path))) + "-" + name);
        }
    }

    public static bool TryEnter(Mutex mutex)
    {
        try { return mutex.WaitOne(0); }
        catch (AbandonedMutexException) { return true; }
    }

    public async Task StartAsync(string mode, CancellationToken cancellation)
    {
        // Desktop callers stay on the UI thread while waiting for the mutex.
        using (var startup = CreateLock(mode == "game" ? "game-start" : "test-start"))
        {
            while (!TryEnter(startup)) await Task.Delay(100, cancellation);
            try
            {
                cancellation.ThrowIfCancellationRequested();
                await StartServicesAsync(mode, cancellation);
            }
            finally { startup.ReleaseMutex(); }
        }
    }

    private async Task StartServicesAsync(string mode, CancellationToken cancellation)
    {
        Directory.CreateDirectory(logDirectory);
        var log = Path.Combine(logDirectory, mode + "-startup.log");
        var ready = new TaskCompletionSource<bool>();
        var exited = new TaskCompletionSource<bool>();
        var process = new Process
        {
            EnableRaisingEvents = true,
            StartInfo = new ProcessStartInfo
            {
                FileName = "node.exe",
                Arguments = "--import tsx src/desktop.ts " + mode,
                WorkingDirectory = Path.Combine(root, "apps", "api"),
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardInput = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8,
            },
        };
        process.OutputDataReceived += (sender, args) =>
        {
            AppendLog(log, args.Data);
            if (args.Data == "CHOKE_DESKTOP_READY") ready.TrySetResult(true);
        };
        process.ErrorDataReceived += (sender, args) => AppendLog(log, args.Data);
        process.Exited += (sender, args) => exited.TrySetResult(true);
        var started = false;
        Exception failure;
        try
        {
            AppendLog(log, DateTime.Now.ToString("s") + "  " + mode);
            started = process.Start();
            if (!started) throw new InvalidOperationException("无法启动本机游戏服务。");
            children.Add(process);
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();
            var completed = await Task.WhenAny(ready.Task, exited.Task, Task.Delay(TimeSpan.FromSeconds(30), cancellation));
            cancellation.ThrowIfCancellationRequested();
            if (completed != ready.Task || process.HasExited)
                throw new InvalidOperationException("本机游戏服务未能就绪。");
            return;
        }
        catch (Exception error) { failure = error; }

        if (started && children.Remove(process))
        {
            CloseInput(process);
            await Task.Run(() => WaitAndDispose(process));
        }
        else if (!started) process.Dispose();
        cancellation.ThrowIfCancellationRequested();
        throw new InvalidOperationException(failure.Message + Environment.NewLine + "日志位于 " + log, failure);
    }

    private void AppendLog(string log, string line)
    {
        if (line == null) return;
        lock (logLock)
        {
            try { File.AppendAllText(log, line + Environment.NewLine, Encoding.UTF8); }
            catch (IOException) { }
            catch (UnauthorizedAccessException) { }
        }
    }

    private static void CloseInput(Process process)
    {
        try { process.StandardInput.Close(); }
        catch (IOException) { }
        catch (InvalidOperationException) { }
    }

    private static void WaitAndDispose(Process process)
    {
        try { process.WaitForExit(6000); }
        finally { process.Dispose(); }
    }

    public void Dispose()
    {
        foreach (var process in children) CloseInput(process);
        foreach (var process in children) WaitAndDispose(process);
        children.Clear();
    }
}
