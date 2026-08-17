/**
 * Persian (fa-IR) copy for the whole interface.
 *
 * Centralised so the UI layer holds no hard-coded language. Digits stay Latin
 * (3:41, not ۳:۴۱) by design: times, counters and byte sizes read better that way
 * next to the tabular-nums styling the player already uses.
 */
export const fa = {
  // ---- Header / shell ----
  appTagline: (tracks: number, playlists: number) =>
    `پخش‌کنندهٔ محلی · ${tracks} قطعه · ${playlists} لیست پخش`,
  upload: "بارگذاری",
  playlists: "لیست‌های پخش",
  admin: "مدیریت",
  staff: "ورود کارکنان",
  signOut: "خروج",
  shuffleAll: "پخش تصادفی",
  shuffleAllTitle: "چیدمان تصادفی همهٔ آهنگ‌های این لیست",
  shuffleDone: "ترتیب آهنگ‌ها به‌صورت تصادفی تغییر کرد",
  shuffleNeedsTracks: "برای پخش تصادفی حداقل به دو آهنگ نیاز است",

  // ---- Library section ----
  nowCuring: "در حال پخش از",
  noPlaylist: "لیست پخشی وجود ندارد",
  emptyPlaylistHint: "برای شروع، یک لیست پخش بسازید تا فضای کافه شکل بگیرد.",
  trackCount: (count: number, duration: string) => `${count} قطعه · ${duration}`,
  dragHint: " · برای جابه‌جایی، دستگیره‌ها را بکشید",
  searchPlaceholder: "جست‌وجو در این لیست",
  guestNotice: "به‌عنوان مهمان در حال مرور هستید — پخش موسیقی برای همه آزاد است.",
  guestSignIn: "ورود",
  guestUploadHint: (allowed: boolean) =>
    allowed
      ? " برای بارگذاری یا مدیریت کتابخانه."
      : " برای بارگذاری (فعلاً فقط مدیران) یا مدیریت کتابخانه.",

  // ---- Playlist board ----
  emptyBoardTitle: "این لیست پخش خالی است",
  emptyBoardHint:
    "از داشبورد فایل صوتی بارگذاری کنید، یا یک آهنگ را به ربات تلگرام بفرستید و این لیست را انتخاب کنید.",
  playAria: (title: string) => `پخش ${title}`,
  deleteAria: (title: string) => `حذف ${title}`,
  reorderAria: "جابه‌جایی قطعه",
  viaTelegram: " · از طریق تلگرام",
  orderSaved: "ترتیب لیست پخش ذخیره شد",
  reorderFailed: "جابه‌جایی انجام نشد",
  removed: (title: string) => `«${title}» حذف شد`,
  deleteFailed: "حذف انجام نشد",

  // ---- Player dock ----
  nothingPlaying: "چیزی در حال پخش نیست",
  pickTrack: "یک قطعه انتخاب کنید",
  shuffle: "پخش تصادفی",
  previous: "قطعهٔ قبلی",
  next: "قطعهٔ بعدی",
  play: "پخش",
  pause: "توقف",
  mute: "بی‌صدا",
  unmute: "باصدا",
  volume: "بلندی صدا",
  seek: "جابه‌جایی زمان",
  repeatLabel: (mode: string) =>
    `تکرار: ${mode === "ONE" ? "یک قطعه" : mode === "ALL" ? "همه" : "خاموش"}`,
  playbackError: "پخش ناموفق بود — ممکن است فایل صوتی روی سرور موجود نباشد.",

  // ---- Auth ----
  loginTitle: "ورود کارکنان",
  loginSubtitle: "برای بارگذاری و مدیریت کتابخانه وارد شوید.",
  username: "نام کاربری",
  password: "گذرواژه",
  signIn: "ورود",
  signingIn: "در حال ورود…",
  welcomeBack: (name: string) => `خوش آمدید، ${name}`,
  signedOut: "از حساب خارج شدید",
  logoutFailed: "خروج انجام نشد",
  loginFailed: "ورود ناموفق بود",

  // ---- Upload modal ----
  uploadTitle: "افزودن موسیقی به کتابخانهٔ کافه",
  uploadSubtitle: "فایل‌ها روی دیسک همین سرور ذخیره می‌شوند — چیزی از شبکه خارج نمی‌شود.",
  destinationPlaylist: "لیست پخش مقصد",
  dropHere: "فایل‌ها را اینجا رها کنید",
  browseFiles: "یا برای انتخاب کلیک کنید",
  acceptedFormats: "MP3، WAV، M4A، AAC، OGG، FLAC",
  title: "عنوان",
  artist: "خواننده",
  remove: "حذف",
  startUpload: "شروع بارگذاری",
  uploading: "در حال بارگذاری…",
  uploadDone: "انجام شد",
  uploadFailedShort: "خطا",
  close: "بستن",
  added: (title: string) => `«${title}» اضافه شد`,
  uploadFailed: "بارگذاری ناموفق بود",
  queueEmpty: "هنوز فایلی انتخاب نشده است",

  // ---- Category manager ----
  categoryTitle: "مدیریت لیست‌های پخش",
  categorySubtitle: "لیست‌های پخش کافه را بسازید، ویرایش یا حذف کنید.",
  newPlaylist: "لیست پخش جدید",
  playlistName: "نام لیست پخش",
  description: "توضیحات",
  color: "رنگ",
  create: "ساختن",
  save: "ذخیره",
  edit: "ویرایش",
  cancel: "انصراف",
  deletePlaylist: "حذف لیست پخش",
  confirmDeletePlaylist: (name: string) =>
    `«${name}» و همهٔ آهنگ‌های داخل آن برای همیشه حذف شوند؟`,
  playlistCreated: "لیست پخش ساخته شد",
  playlistUpdated: "لیست پخش به‌روزرسانی شد",
  playlistDeleted: "لیست پخش حذف شد",
  songsCount: (count: number) => `${count} قطعه`,

  // ---- Admin panel ----
  adminTitle: "اتاق کنترل مدیریت",
  adminSubtitle: "تنظیمات کافه، دسترسی‌ها و ربات تلگرام.",
  cafeName: "نام کافه",
  allowGuestUpload: "اجازهٔ بارگذاری به مهمان‌ها",
  allowGuestUploadHint:
    "وقتی روشن باشد، کاربران وارد شده با نقش مهمان هم می‌توانند موسیقی اضافه کنند.",
  saveSettings: "ذخیرهٔ تنظیمات",
  settingsSaved: "تنظیمات ذخیره شد",
  libraryStats: (songs: number, categories: number) =>
    `${songs} قطعه در ${categories} لیست پخش`,

  // ---- Admin: credentials ----
  credentials: "نام کاربری و گذرواژه",
  currentPassword: "گذرواژهٔ فعلی",
  newPassword: "گذرواژهٔ جدید",
  confirmPassword: "تکرار گذرواژهٔ جدید",
  updateProfile: "به‌روزرسانی حساب",
  profileUpdated: "اطلاعات حساب به‌روزرسانی شد",
  passwordsMismatch: "گذرواژهٔ جدید و تکرار آن یکسان نیستند",
  passwordTooShort: "گذرواژهٔ جدید باید حداقل ۸ نویسه باشد",

  // ---- Admin: telegram ----
  telegramSection: "ربات همگام‌سازی تلگرام",
  telegramConnect: "اتصال ربات تلگرام",
  telegramConnecting: "در حال اتصال…",
  telegramDisconnect: "قطع ربات",
  telegramConnectedBanner: "ربات متصل شد؛ اکنون می‌توانید در تلگرام موسیقی ارسال کنید.",
  telegramFailedBanner: "اتصال برقرار نشد — اتصال اینترنت را بررسی کنید.",
  telegramStandby: "آماده‌باش — ربات هنوز متصل نشده است.",
  telegramActive: "متصل",
  telegramInactive: "قطع",
  telegramNotConfigured: "توکن ربات تنظیم نشده است",
  telegramHint:
    "با زدن این دکمه، ربات روی همین سرور اجرا می‌شود؛ نیازی به اجرای دستور در ترمینال نیست.",
  whitelist: "فهرست مجاز",
  telegramId: "شناسهٔ عددی تلگرام",
  label: "برچسب",
  addToWhitelist: "افزودن",
  whitelistEmpty: "هنوز کسی به فهرست مجاز اضافه نشده است.",
  whitelistAdded: "به فهرست مجاز اضافه شد",
  whitelistRemoved: "از فهرست مجاز حذف شد",
  refresh: "به‌روزرسانی",

  // ---- Generic ----
  loading: "در حال بارگذاری…",
  errorGeneric: "خطایی رخ داد",
  couldNotLoadPlaylists: "لیست‌های پخش بارگذاری نشد",
  couldNotLoadTracks: "قطعه‌ها بارگذاری نشد",
  couldNotCheckUpdates: "بررسی موسیقی‌های جدید ممکن نشد",
  closeDialog: "بستن پنجره",
  sessionExpired: "نشست شما منقضی شده است. لطفاً دوباره وارد شوید.",
} as const;

export type Dictionary = typeof fa;
