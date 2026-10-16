using System.Text.Json;

namespace CafeLauncher;

public sealed class BackendSettings
{
    public bool Enabled { get; set; } = false;
    public string BackendCommand { get; set; } = string.Empty;
    public string BackendArguments { get; set; } = string.Empty;
    public string BackendWorkingDirectory { get; set; } = string.Empty;
    public string BackendHealthUrl { get; set; } = string.Empty;
    public int HealthCheckTimeoutSeconds { get; set; } = 30;
}

public sealed class LauncherSettings
{
    public string WebAppUrl { get; set; } = "http://127.0.0.1:3000";
    public string LicenseFile { get; set; } = "license.json";
    public string PublicKeyFile { get; set; } = "public.pem";
    public BackendSettings Backend { get; set; } = new();

    public static LauncherSettings Load(string path)
    {
        try
        {
            if (!File.Exists(path))
            {
                return new LauncherSettings();
            }
            var json = File.ReadAllText(path);
            var settings = JsonSerializer.Deserialize<LauncherSettings>(json, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });
            return settings ?? new LauncherSettings();
        }
        catch (Exception ex)
        {
            LauncherLogger.Error("Settings load failed", ex);
            return new LauncherSettings();
        }
    }

    public string ResolvePath(string relativeOrAbsolute)
    {
        if (Path.IsPathRooted(relativeOrAbsolute))
        {
            return relativeOrAbsolute;
        }
        return Path.Combine(AppContext.BaseDirectory, relativeOrAbsolute);
    }
}
