using System.Diagnostics;
using System.Net.Http;

namespace CafeLauncher;

public sealed class BackendProcessService
{
    private Process? _process;

    public async Task<(bool Success, string Message)> StartAsync(BackendSettings settings, CancellationToken cancellationToken = default)
    {
        if (!settings.Enabled)
        {
            return (true, string.Empty);
        }

        if (string.IsNullOrWhiteSpace(settings.BackendCommand))
        {
            return (false, "دستور بک‌اند تنظیم نشده است.");
        }

        var commandPath = settings.BackendCommand;
        if (!Path.IsPathRooted(commandPath))
        {
            commandPath = Path.Combine(AppContext.BaseDirectory, commandPath);
        }

        if (!File.Exists(commandPath))
        {
            return (false, "فایل اجرایی بک‌اند یافت نشد.");
        }

        if (!string.IsNullOrWhiteSpace(settings.BackendWorkingDirectory))
        {
            var workingDir = settings.BackendWorkingDirectory;
            if (!Path.IsPathRooted(workingDir))
            {
                workingDir = Path.Combine(AppContext.BaseDirectory, workingDir);
            }
            if (!Directory.Exists(workingDir))
            {
                return (false, "پوشه کاری بک‌اند یافت نشد.");
            }
        }

        if (string.IsNullOrWhiteSpace(settings.BackendHealthUrl))
        {
            return (false, "آدرس بررسی سلامت بک‌اند تنظیم نشده است.");
        }

        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = commandPath,
                Arguments = settings.BackendArguments ?? string.Empty,
                WorkingDirectory = string.IsNullOrWhiteSpace(settings.BackendWorkingDirectory)
                    ? AppContext.BaseDirectory
                    : (Path.IsPathRooted(settings.BackendWorkingDirectory)
                        ? settings.BackendWorkingDirectory
                        : Path.Combine(AppContext.BaseDirectory, settings.BackendWorkingDirectory)),
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = false,
                RedirectStandardError = false
            };

            _process = Process.Start(psi);
            if (_process is null)
            {
                return (false, "راه‌اندازی بک‌اند انجام نشد.");
            }
        }
        catch (Exception ex)
        {
            LauncherLogger.Error("Backend start failed", ex);
            return (false, "راه‌اندازی بک‌اند با خطا مواجه شد.");
        }

        using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };
        var deadline = DateTime.UtcNow.AddSeconds(Math.Max(5, settings.HealthCheckTimeoutSeconds));

        while (DateTime.UtcNow < deadline && !cancellationToken.IsCancellationRequested)
        {
            if (_process.HasExited)
            {
                return (false, "فرآیند بک‌اند پیش از آماده شدن متوقف شد.");
            }

            try
            {
                using var response = await http.GetAsync(settings.BackendHealthUrl, cancellationToken);
                if (response.IsSuccessStatusCode)
                {
                    return (true, string.Empty);
                }
            }
            catch
            {
                // ignore and retry
            }

            try
            {
                await Task.Delay(1000, cancellationToken);
            }
            catch (TaskCanceledException)
            {
                break;
            }
        }

        return (false, "بک‌اند در زمان مقرر آماده نشد.");
    }

    // Intentionally does not terminate a persistent backend on launcher close.
    public void Dispose()
    {
        // Leave process running.
    }
}
