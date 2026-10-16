using System.Text.Json.Serialization;

namespace LicenseIssuer;

public sealed class LicensePayload
{
    [JsonPropertyName("licenseId")]
    public string LicenseId { get; set; } = string.Empty;

    [JsonPropertyName("licenseCode")]
    public string LicenseCode { get; set; } = string.Empty;

    [JsonPropertyName("cafeName")]
    public string CafeName { get; set; } = string.Empty;

    [JsonPropertyName("issuedAtUtc")]
    public DateTimeOffset IssuedAtUtc { get; set; }

    [JsonPropertyName("expiresAtUtc")]
    public DateTimeOffset ExpiresAtUtc { get; set; }

    [JsonPropertyName("deviceBinding")]
    public string DeviceBinding { get; set; } = string.Empty;

    [JsonPropertyName("licenseVersion")]
    public int LicenseVersion { get; set; }
}

public sealed class SignedLicenseDocument
{
    [JsonPropertyName("payload")]
    public LicensePayload Payload { get; set; } = new();

    [JsonPropertyName("signature")]
    public string Signature { get; set; } = string.Empty;
}
