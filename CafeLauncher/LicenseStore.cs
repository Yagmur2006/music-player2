using System.Text.Json;

namespace CafeLauncher;

public static class LicenseStore
{
    private static readonly string DirectoryPath =
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CafeLauncher");

    private static readonly string FilePath = Path.Combine(DirectoryPath, "license.json");

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        WriteIndented = true
    };

    public static string StoredLicensePath => FilePath;

    public static void Save(SignedLicenseDocument document)
    {
        Directory.CreateDirectory(DirectoryPath);
        var json = JsonSerializer.Serialize(document, JsonOptions);
        File.WriteAllText(FilePath, json);
    }

    public static bool TryLoad(out SignedLicenseDocument? document, out string error)
    {
        document = null;
        error = string.Empty;

        if (!File.Exists(FilePath))
        {
            error = "پروانه ذخیره‌شده یافت نشد.";
            return false;
        }

        try
        {
            var json = File.ReadAllText(FilePath);
            document = JsonSerializer.Deserialize<SignedLicenseDocument>(json, JsonOptions);
            if (document is null)
            {
                error = "فایل پروانه قابل خواندن نیست.";
                return false;
            }
            return true;
        }
        catch (JsonException ex)
        {
            LauncherLogger.Error("Corrupted license file", ex);
            error = "فایل پروانه آسیب دیده است.";
            return false;
        }
        catch (Exception ex)
        {
            LauncherLogger.Error("License load failed", ex);
            error = "خواندن پروانه انجام نشد.";
            return false;
        }
    }

    public static void Delete()
    {
        try
        {
            if (File.Exists(FilePath))
            {
                File.Delete(FilePath);
            }
        }
        catch (Exception ex)
        {
            LauncherLogger.Error("License delete failed", ex);
        }
    }
}
