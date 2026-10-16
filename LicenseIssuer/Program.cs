using System.Security.Cryptography;
using System.Text.Json;

namespace LicenseIssuer;

internal static class Program
{
    private static readonly JsonSerializerOptions CompactOptions = new()
    {
        PropertyNamingPolicy = null,
        WriteIndented = false
    };

    private static readonly JsonSerializerOptions PrettyOptions = new()
    {
        PropertyNamingPolicy = null,
        WriteIndented = true
    };

    [STAThread]
    static void Main(string[] args)
    {
        string outputDir = args.Length > 0 ? args[0] : "issued";
        int days = 30;
        if (args.Length > 1 && int.TryParse(args[1], out var parsedDays))
        {
            days = parsedDays;
        }

        string code = "CAFE-TEST-2026";
        if (args.Length > 2)
        {
            code = args[2];
        }

        Directory.CreateDirectory(outputDir);

        using var rsa = RSA.Create(2048);

        var privatePem = rsa.ExportRSAPrivateKeyPem();
        var publicPem = rsa.ExportSubjectPublicKeyInfoPem();

        var now = DateTimeOffset.UtcNow;
        var payload = new LicensePayload
        {
            LicenseId = Guid.NewGuid().ToString("N"),
            LicenseCode = code,
            CafeName = "کافه آزمایشی",
            IssuedAtUtc = now,
            ExpiresAtUtc = now.AddDays(days),
            DeviceBinding = "dev-device",
            LicenseVersion = 1
        };

        var payloadBytes = JsonSerializer.SerializeToUtf8Bytes(payload, CompactOptions);
        var signature = rsa.SignData(payloadBytes, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);

        var document = new SignedLicenseDocument
        {
            Payload = payload,
            Signature = Base64UrlEncode(signature)
        };

        File.WriteAllText(Path.Combine(outputDir, "private.pem"), privatePem);
        File.WriteAllText(Path.Combine(outputDir, "public.pem"), publicPem);
        File.WriteAllText(Path.Combine(outputDir, "license.json"), JsonSerializer.Serialize(document, PrettyOptions));

        Console.WriteLine("پروانه آزمایشی با موفقیت تولید شد.");
        Console.WriteLine($"پوشه خروجی: {Path.GetFullPath(outputDir)}");
        Console.WriteLine($"کد پروانه: {code}");
        Console.WriteLine($"تاریخ انقضا (UTC): {payload.ExpiresAtUtc:O}");
        Console.WriteLine("فایل‌های تولید شده: private.pem, public.pem, license.json");
        Console.WriteLine("هشدار: private.pem را هرگز همراه برنامه مشتری توزیع نکنید.");
    }

    private static string Base64UrlEncode(byte[] data)
    {
        return Convert.ToBase64String(data).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }
}
