# CafeLauncher — پروانه آزمایشی و راه‌انداز لانچر

این پروژه یک نمونهٔ اولیهٔ ویندوزی (Windows Forms + .NET 8) برای راه‌اندازی رابط وب کافه (Next.js) پس از اعتبارسنجی پروانهٔ دیجیتال است.

## ساختار پروژه

- `CafeLauncherPrototype.sln`
- `CafeLauncher/` — پروژهٔ Windows Forms
- `LicenseIssuer/` — ابزار کنسولی تولید پروانهٔ آزمایشی

## پیش‌نیازها

- Windows 10 یا Windows 11
- .NET 8 SDK
- Visual Studio 2022 (با workload دسکتاپ .NET)
- Microsoft Edge WebView2 Runtime
- برای تست رابط وب: اجرای پروژهٔ Next.js روی `http://127.0.0.1:3000`

## بازیابی و ساخت

```powershell
dotnet restore CafeLauncherPrototype.sln
dotnet build CafeLauncherPrototype.sln -c Debug
```

یا در Visual Studio فایل `CafeLauncherPrototype.sln` را باز کرده و Build Solution را اجرا کنید.

## تولید پروانهٔ آزمایشی

```powershell
dotnet run --project LicenseIssuer -- issued 30 CAFE-TEST-2026
```

خروجی در پوشهٔ `issued` شامل `private.pem`, `public.pem`, `license.json` است.

## آماده‌سازی برای اجرای لانچر

1. پوشهٔ خروجی ساخت `CafeLauncher` (مثلاً `CafeLauncher\bin\Debug\net8.0-windows`) را باز کنید.
2. فایل‌های `public.pem` و `license.json` را از پوشهٔ `issued` به کنار `CafeLauncher.exe` کپی کنید.
3. `appsettings.json` را در صورت نیاز ویرایش کنید (آدرس وب، مسیر فایل‌ها، بک‌اند).

## اجرا

```powershell
dotnet run --project CafeLauncher
```

یا اجرای مستقیم `CafeLauncher.exe`.

## تست دستی

- **کد معتبر**: `CAFE-TEST-2026` را وارد کنید؛ باید پروانه ذخیره شده و رابط وب باز شود.
- **کد نامعتبر**: `WRONG-CODE`؛ باید رد شود و صفحهٔ برنامه نمایش داده نشود.
- **فایل‌های ناقص**: حذف `public.pem` یا `license.json`؛ پیام راهنما نمایش داده شود.
- **دستکاری payload**: ویرایش یک فیلد در `license.json`؛ باید به دلیل شکست امضا رد شود.
- **پروانهٔ منقضی**: صدور با روز منفی، مثلاً `dotnet run --project LicenseIssuer -- issued -1`؛ باید رد شود.
- **عدم وجود سرور وب**: بدون اجرای Next.js، پیام خطای اتصال و دکمهٔ تلاش مجدد نمایش داده شود.
- **راه‌اندازی مجدد**: پس از فعال‌سازی، بستن و باز کردن برنامه باید پروانهٔ ذخیره‌شده را بازخوانی و اعتبارسنجی کند.

## تفاوت نمونهٔ اولیه با تولید

این نمونهٔ اولیه است. در تولید، کلید خصوصی باید فقط روی سرور پروانه (وب‌سایت) نگهداری شود و پروانه‌ها پس از تأیید خرید صادر شوند. این لانچر فقط کلید عمومی را در خود دارد و هیچ وابستگی به پایگاه داده یا پرداخت ندارد.

## محدودیت‌ها

- اعتبارسنجی آفلاین و مبتنی بر امضای دیجیتال است.
- ضد‌دستکاری کامل در این نمونهٔ اولیه وجود ندارد.
- بک‌اند اختیاری است و به صورت پیش‌فرض غیرفعال است.
- برای نمایش رابط وب، سرور Next.js باید جداگانه اجرا شود.
EOF
echo done