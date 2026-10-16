namespace CafeLauncher;

public static class LauncherLogger
{
    private static readonly string LogPath = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "CafeLauncher", "launcher.log");

    public static void Info(string message) => Write("INFO", message, null);
    public static void Error(string message, Exception? ex = null) => Write("ERROR", message, ex);

    private static void Write(string level, string message, Exception? ex)
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(LogPath)!);
            var line = $"{DateTimeOffset.UtcNow:O} [{level}] {message}";
            if (ex is not null)
            {
                line += $" :: {ex}";
            }
            File.AppendAllText(LogPath, line + Environment.NewLine);
        }
        catch
        {
            // Never throw from logging.
        }
    }
}
