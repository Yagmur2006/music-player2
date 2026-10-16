using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace CafeLauncher;

public sealed class LicenseValidationResult
{
    public bool IsValid { get; init; }
    public string Message { get; init; } = string.Empty;
    public LicensePayload? Payload { get; init; }
}

public sealed class SignedLicenseService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        WriteIndented = false
    };

    private readonly RSA _publicKey;

    private SignedLicenseService(RSA publicKey)
    {
        _publicKey = publicKey;
    }

    public static bool TryCreate(string publicKeyPem, out SignedLicenseService? service, out string error)
    {
        service = null;
        error = string.Empty;
        try
        {
            var rsa = RSA.Create();
            rsa.ImportFromPem(publicKeyPem);
            service = new SignedLicenseService(rsa);
            return true;
        }
        catch (Exception ex)
        {
            error = $"کلید عمومی قابل بارگذاری نیست: {ex.Message}";
            return false;
        }
    }

    public static bool TryLoadPublicKeyFile(string path, out SignedLicenseService? service, out string error)
    {
        service = null;
        if (!File.Exists(path))
        {
            error = $"فایل کلید عمومی یافت نشد: {path}";
            return false;
        }
        try
        {
            var pem = File.ReadAllText(path);
            return TryCreate(pem, out service, out error);
        }
        catch (Exception ex)
        {
            error = $"خواندن کلید عمومی انجام نشد: {ex.Message}";
            return false;
        }
    }

    public LicenseValidationResult ValidateForActivation(SignedLicenseDocument document, string enteredCode)
    {
        return Validate(document, enteredCode);
    }

    public LicenseValidationResult ValidatePersisted(SignedLicenseDocument document)
    {
        return Validate(document, expectedCode: null);
    }

    private LicenseValidationResult Validate(SignedLicenseDocument document, string? expectedCode)
    {
        if (document is null || document.Payload is null || string.IsNullOrWhiteSpace(document.Signature))
        {
            return Fail("ساختار پروانه نامعتبر است.");
        }

        var payload = document.Payload;

        if (string.IsNullOrWhiteSpace(payload.LicenseId) ||
            string.IsNullOrWhiteSpace(payload.LicenseCode))
        {
            return Fail("فیلدهای پروانه ناقص هستند.");
        }

        // Verify signature over deterministic payload bytes.
        byte[] payloadBytes;
        try
        {
            payloadBytes = JsonSerializer.SerializeToUtf8Bytes(payload, JsonOptions);
        }
        catch (Exception ex)
        {
            LauncherLogger.Error("Payload serialization failed", ex);
            return Fail("پردازش پروانه انجام نشد.");
        }

        byte[] signatureBytes;
        try
        {
            signatureBytes = Base64UrlDecode(document.Signature);
        }
        catch
        {
            return Fail("امضای پروانه نامعتبر است.");
        }

        bool signatureValid;
        try
        {
            signatureValid = _publicKey.VerifyData(payloadBytes, signatureBytes, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
        }
        catch (Exception ex)
        {
            LauncherLogger.Error("Signature verification threw", ex);
            return Fail("بررسی امضا با خطا مواجه شد.");
        }

        if (!signatureValid)
        {
            return Fail("امضای دیجیتال پروانه نامعتبر است. پروانه دستکاری شده است.");
        }

        if (expectedCode is not null)
        {
            if (!string.Equals(payload.LicenseCode.Trim(), expectedCode.Trim(), StringComparison.Ordinal))
            {
                return Fail("کد وارد شده با کد پروانه مطابقت ندارد.");
            }
        }

        var now = DateTimeOffset.UtcNow;
        if (payload.ExpiresAtUtc <= now)
        {
            return Fail("پروانه منقضی شده است.");
        }

        if (payload.IssuedAtUtc > now.AddMinutes(5))
        {
            return Fail("تاریخ صدور پروانه نامعتبر است.");
        }

        return new LicenseValidationResult
        {
            IsValid = true,
            Message = "پروانه معتبر است.",
            Payload = payload
        };
    }

    private static LicenseValidationResult Fail(string message) =>
        new() { IsValid = false, Message = message };

    private static byte[] Base64UrlDecode(string input)
    {
        var s = input.Trim().Replace('-', '+').Replace('_', '/');
        switch (s.Length % 4)
        {
            case 2: s += "=="; break;
            case 3: s += "="; break;
        }
        return Convert.FromBase64String(s);
    }

    public static string Base64UrlEncode(byte[] data)
    {
        return Convert.ToBase64String(data).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }
}
