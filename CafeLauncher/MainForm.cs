using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using System.Text.Json;

namespace CafeLauncher;

public sealed class MainForm : Form
{
    private readonly LauncherSettings _settings;
    private SignedLicenseService? _licenseService;

    // Activation UI
    private Panel _activationPanel = null!;
    private TextBox _codeTextBox = null!;
    private CheckBox _showCodeCheckBox = null!;
    private Button _activateButton = null!;
    private Label _messageLabel = null!;

    // App UI
    private Panel _appPanel = null!;
    private WebView2 _webView = null!;
    private Label _statusLabel = null!;
    private Label _urlLabel = null!;
    private Button _retryButton = null!;
    private Panel _errorPanel = null!;
    private Label _errorLabel = null!;

    private bool _webViewInitialized;

    public MainForm()
    {
        _settings = LauncherSettings.Load(Path.Combine(AppContext.BaseDirectory, "appsettings.json"));

        Text = "کافه‌لانچر";
        Width = 1100;
        Height = 760;
        MinimumSize = new Size(900, 620);
        StartPosition = FormStartPosition.CenterScreen;
        RightToLeft = RightToLeft.Yes;
        RightToLeftLayout = true;
        Font = new Font("Segoe UI", 10F);

        BuildActivationPanel();
        BuildAppPanel();

        Controls.Add(_appPanel);
        Controls.Add(_activationPanel);

        TryLoadPersistedLicense();
    }

    private void BuildActivationPanel()
    {
        _activationPanel = new Panel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(40),
            BackColor = Color.FromArgb(245, 247, 250)
        };

        var layout = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            ColumnCount = 1,
            RowCount = 6,
            Padding = new Padding(0)
        };
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 60));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 90));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 46));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 40));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 50));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        var title = new Label
        {
            Text = "کافه‌لانچر — مدیریت موسیقی کافه",
            Font = new Font("Segoe UI", 18F, FontStyle.Bold),
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleRight
        };

        var info = new Label
        {
            Text = "برای استفاده از برنامه، کد پروانه آزمایشی را وارد کنید. پروانه به صورت دیجیتال امضا شده و در این دستگاه ذخیره می‌شود.",
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.TopRight,
            Font = new Font("Segoe UI", 10.5F)
        };

        _codeTextBox = new TextBox
        {
            Dock = DockStyle.Fill,
            Font = new Font("Segoe UI", 12F),
            UseSystemPasswordChar = true,
            TextAlign = HorizontalAlignment.Right,
            PlaceholderText = "کد پروانه"
        };

        _showCodeCheckBox = new CheckBox
        {
            Text = "نمایش کد",
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleRight,
            CheckAlign = ContentAlignment.MiddleRight
        };
        _showCodeCheckBox.CheckedChanged += (_, _) =>
        {
            _codeTextBox.UseSystemPasswordChar = !_showCodeCheckBox.Checked;
        };

        _activateButton = new Button
        {
            Text = "فعال‌سازی و ادامه",
            Dock = DockStyle.Fill,
            Font = new Font("Segoe UI", 11F, FontStyle.Bold),
            BackColor = Color.FromArgb(46, 125, 50),
            ForeColor = Color.White,
            FlatStyle = FlatStyle.Flat
        };
        _activateButton.FlatAppearance.BorderSize = 0;
        _activateButton.Click += async (_, _) => await ActivateAsync();

        _messageLabel = new Label
        {
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.TopRight,
            ForeColor = Color.FromArgb(183, 28, 28),
            Font = new Font("Segoe UI", 10F)
        };

        layout.Controls.Add(title, 0, 0);
        layout.Controls.Add(info, 0, 1);
        layout.Controls.Add(_codeTextBox, 0, 2);
        layout.Controls.Add(_showCodeCheckBox, 0, 3);
        layout.Controls.Add(_activateButton, 0, 4);
        layout.Controls.Add(_messageLabel, 0, 5);

        _activationPanel.Controls.Add(layout);
    }

    private void BuildAppPanel()
    {
        _appPanel = new Panel
        {
            Dock = DockStyle.Fill,
            Visible = false,
            BackColor = Color.White
        };

        var topBar = new TableLayoutPanel
        {
            Dock = DockStyle.Top,
            Height = 46,
            ColumnCount = 3,
            RowCount = 1,
            Padding = new Padding(10, 6, 10, 6)
        };
        topBar.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        topBar.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        topBar.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));

        _urlLabel = new Label
        {
            Text = _settings.WebAppUrl,
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleRight,
            Font = new Font("Segoe UI", 9F),
            ForeColor = Color.Gray
        };

        _retryButton = new Button
        {
            Text = "تلاش مجدد",
            AutoSize = true,
            FlatStyle = FlatStyle.Flat
        };
        _retryButton.Click += (_, _) => Navigate();

        var titleLabel = new Label
        {
            Text = "رابط وب کافه",
            AutoSize = true,
            Font = new Font("Segoe UI", 11F, FontStyle.Bold),
            TextAlign = ContentAlignment.MiddleRight,
            Padding = new Padding(0, 0, 12, 0)
        };

        topBar.Controls.Add(_urlLabel, 0, 0);
        topBar.Controls.Add(_retryButton, 1, 0);
        topBar.Controls.Add(titleLabel, 2, 0);

        _statusLabel = new Label
        {
            Dock = DockStyle.Bottom,
            Height = 26,
            TextAlign = ContentAlignment.MiddleRight,
            Font = new Font("Segoe UI", 9F),
            ForeColor = Color.DimGray,
            Text = "در حال آماده‌سازی..."
        };

        _webView = new WebView2
        {
            Dock = DockStyle.Fill
        };

        _errorPanel = new Panel
        {
            Dock = DockStyle.Fill,
            Visible = false,
            BackColor = Color.FromArgb(255, 245, 245)
        };
        _errorLabel = new Label
        {
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleCenter,
            Font = new Font("Segoe UI", 11F),
            ForeColor = Color.FromArgb(183, 28, 28),
            Text = "اتصال به سرویس وب انجام نشد."
        };
        var errorButtons = new FlowLayoutPanel
        {
            Dock = DockStyle.Bottom,
            Height = 50,
            FlowDirection = FlowDirection.RightToLeft,
            Padding = new Padding(10)
        };
        var retryErrorButton = new Button { Text = "تلاش مجدد", AutoSize = true, FlatStyle = FlatStyle.Flat };
        retryErrorButton.Click += (_, _) => { HideError(); Navigate(); };
        errorButtons.Controls.Add(retryErrorButton);
        _errorPanel.Controls.Add(_errorLabel);
        _errorPanel.Controls.Add(errorButtons);

        _appPanel.Controls.Add(topBar);
        _appPanel.Controls.Add(_statusLabel);
        _appPanel.Controls.Add(_webView);
        _appPanel.Controls.Add(_errorPanel);
    }

    private void TryLoadPersistedLicense()
    {
        if (!LicenseStore.TryLoad(out var document, out var loadError))
        {
            LauncherLogger.Info(loadError);
            ShowActivation();
            return;
        }

        if (!TryEnsureLicenseService(out var serviceError))
        {
            _messageLabel.Text = serviceError;
            ShowActivation();
            return;
        }

        var result = _licenseService!.ValidatePersisted(document!);
        if (!result.IsValid)
        {
            LauncherLogger.Info($"Persisted license invalid: {result.Message}");
            LicenseStore.Delete();
            ShowActivation(result.Message);
            return;
        }

        ShowApp();
        _ = InitializeWebViewAsync();
    }

    private bool TryEnsureLicenseService(out string error)
    {
        error = string.Empty;
        if (_licenseService is not null)
        {
            return true;
        }

        var keyPath = _settings.ResolvePath(_settings.PublicKeyFile);
        if (!SignedLicenseService.TryLoadPublicKeyFile(keyPath, out var service, out error))
        {
            return false;
        }
        _licenseService = service;
        return true;
    }

    private void ShowActivation(string? message = null)
    {
        _activationPanel.Visible = true;
        _appPanel.Visible = false;
        if (!string.IsNullOrWhiteSpace(message))
        {
            _messageLabel.Text = message;
            _messageLabel.ForeColor = Color.FromArgb(183, 28, 28);
        }
    }

    private void ShowApp()
    {
        _activationPanel.Visible = false;
        _appPanel.Visible = true;
    }

    private async Task ActivateAsync()
    {
        _messageLabel.Text = string.Empty;
        var code = _codeTextBox.Text;

        if (string.IsNullOrWhiteSpace(code))
        {
            _messageLabel.Text = "لطفاً کد پروانه را وارد کنید.";
            return;
        }

        var licensePath = _settings.ResolvePath(_settings.LicenseFile);
        if (!File.Exists(licensePath))
        {
            _messageLabel.Text = "فایل پروانه یافت نشد. ابتدا پروانه آزمایشی را تولید و در کنار برنامه قرار دهید.";
            LauncherLogger.Error($"License file missing: {licensePath}");
            return;
        }

        if (!TryEnsureLicenseService(out var keyError))
        {
            _messageLabel.Text = keyError;
            return;
        }

        SignedLicenseDocument? document;
        try
        {
            var json = File.ReadAllText(licensePath);
            document = JsonSerializer.Deserialize<SignedLicenseDocument>(json, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            });
        }
        catch (Exception ex)
        {
            LauncherLogger.Error("License file parse failed", ex);
            _messageLabel.Text = "فایل پروانه آسیب دیده است.";
            return;
        }

        if (document is null)
        {
            _messageLabel.Text = "فایل پروانه نامعتبر است.";
            return;
        }

        _activateButton.Enabled = false;
        _activateButton.Text = "در حال بررسی...";
        try
        {
            var result = _licenseService!.ValidateForActivation(document, code);
            if (!result.IsValid)
            {
                _messageLabel.Text = result.Message;
                return;
            }

            try
            {
                LicenseStore.Save(document);
            }
            catch (Exception ex)
            {
                LauncherLogger.Error("License save failed", ex);
                _messageLabel.Text = "ذخیره پروانه انجام نشد.";
                return;
            }

            _messageLabel.ForeColor = Color.FromArgb(27, 94, 32);
            _messageLabel.Text = "پروانه با موفقیت فعال شد.";

            ShowApp();
            await InitializeWebViewAsync();

            if (!string.IsNullOrWhiteSpace(_settings.Backend.BackendCommand) && _settings.Backend.Enabled)
            {
                var backend = new BackendProcessService();
                var backendResult = await backend.StartAsync(_settings.Backend);
                if (!backendResult.Success)
                {
                    ShowError(backendResult.Message);
                }
            }
        }
        finally
        {
            _activateButton.Enabled = true;
            _activateButton.Text = "فعال‌سازی و ادامه";
        }
    }

    private async Task InitializeWebViewAsync()
    {
        if (_webViewInitialized)
        {
            return;
        }

        try
        {
            _statusLabel.Text = "در حال آماده‌سازی مرورگر...";
            var environment = await CoreWebView2Environment.CreateAsync();
            await _webView.EnsureCoreWebView2Async(environment);

            _webView.CoreWebView2.NavigationCompleted += CoreWebView2_NavigationCompleted;
            _webView.CoreWebView2.ProcessFailed += (_, e) =>
            {
                LauncherLogger.Error($"WebView2 process failed: {e.ProcessFailedKind}");
                ShowError("مرورگر داخلی با خطا مواجه شد.");
            };

            _webViewInitialized = true;
            Navigate();
        }
        catch (Exception ex)
        {
            LauncherLogger.Error("WebView2 initialization failed", ex);
            ShowError("Runtime مرورگر وب (WebView2) یافت نشد یا قابل راه‌اندازی نیست. لطفاً Microsoft Edge WebView2 Runtime را نصب کنید.");
        }
    }

    private void Navigate()
    {
        HideError();
        _statusLabel.Text = "در حال اتصال به سرویس وب...";
        try
        {
            _webView.Source = new Uri(_settings.WebAppUrl);
        }
        catch (Exception ex)
        {
            LauncherLogger.Error("Invalid URL", ex);
            ShowError("آدرس تنظیم‌شده برای برنامه وب نامعتبر است.");
        }
    }

    private void CoreWebView2_NavigationCompleted(object? sender, CoreWebView2NavigationCompletedEventArgs e)
    {
        if (e.IsSuccess)
        {
            _statusLabel.Text = "اتصال برقرار شد.";
            HideError();
        }
        else
        {
            LauncherLogger.Error($"Navigation failed: {e.WebErrorStatus}");
            ShowError("اتصال به سرویس وب انجام نشد. مطمئن شوید برنامه وب در حال اجراست.");
        }
    }

    private void ShowError(string message)
    {
        _errorLabel.Text = message;
        _errorPanel.Visible = true;
        _statusLabel.Text = "خطا در اتصال";
    }

    private void HideError()
    {
        _errorPanel.Visible = false;
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        base.OnFormClosing(e);
    }
}
