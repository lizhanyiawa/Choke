using System;
using System.IO;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using System.Windows.Forms;

internal static class Program
{
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool SetDllDirectory(string directory);

    [STAThread]
    private static void Main(string[] args)
    {
        var root = AppDomain.CurrentDomain.BaseDirectory;
        var bin = Path.Combine(root, ".cache", "desktop", "bin");
        try
        {
            if (!SetDllDirectory(bin)) throw new InvalidOperationException("找不到桌面客户端依赖。请运行 scripts/build-desktop.ps1 准备客户端。");
            RunClient(root, bin, args);
        }
        catch (Exception error)
        {
            MessageBox.Show(error.Message, "Choke! · 客户端启动失败", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    [MethodImpl(MethodImplOptions.NoInlining)]
    private static void RunClient(string root, string bin, string[] args)
    {
        ChokeClient.Run(root, bin, args);
    }
}
