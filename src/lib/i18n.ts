const dict = {
  uz: {
    welcome: "MOTION AI ga xush kelibsiz! 🎬\nMatndan reklama videolarini AI yordamida yarating.",
    chooseLang: "Tilni tanlang / Выберите язык:",
    langSaved: "Til saqlandi: O‘zbekcha ✅",
    open: "🎬 MOTION AI ni ochish",
    newPrompt: "Video uchun so‘rov yozing (masalan: «30 soniyalik konditsioner reklamasi...»). Yoki Mini App orqali batafsil sozlang.",
    queued: "⏳ So‘rov qabul qilindi! Video tayyor bo‘lgach yuboraman.",
    noProjects: "Hali loyihalar yo‘q. /new bilan boshlang.",
    projects: "📁 Oxirgi loyihalaringiz:",
    help: "Buyruqlar:\n/new — yangi video\n/projects — videolarim\n/start — til va menyu\n/help — yordam",
    videoReady: "Videongiz tayyor!",
    videoFailed: "Video yaratishda xatolik yuz berdi.",
    limit: "Kunlik limit yoki faol vazifalar soniga yetdingiz. Keyinroq urinib ko‘ring.",
    tooShort: "So‘rov juda qisqa. Batafsilroq yozing.",
    download: "⬇️ Yuklab olish",
  },
  ru: {
    welcome: "Добро пожаловать в MOTION AI! 🎬\nСоздавайте рекламные видео из текста с помощью AI.",
    chooseLang: "Tilni tanlang / Выберите язык:",
    langSaved: "Язык сохранён: Русский ✅",
    open: "🎬 Открыть MOTION AI",
    newPrompt: "Опишите видео (например: «30-секундная реклама кондиционера...»). Или настройте подробно в Mini App.",
    queued: "⏳ Запрос принят! Пришлю видео, когда оно будет готово.",
    noProjects: "Проектов пока нет. Начните с /new.",
    projects: "📁 Ваши последние проекты:",
    help: "Команды:\n/new — новое видео\n/projects — мои видео\n/start — язык и меню\n/help — помощь",
    videoReady: "Ваше видео готово!",
    videoFailed: "Произошла ошибка при создании видео.",
    limit: "Достигнут дневной лимит или число активных задач. Попробуйте позже.",
    tooShort: "Запрос слишком короткий. Опишите подробнее.",
    download: "⬇️ Скачать",
  },
} as const;
export type Lang = keyof typeof dict;
export const t = (l: Lang, k: keyof (typeof dict)["uz"]) => (dict[l] ?? dict.uz)[k];
export const STATUS_LABEL: Record<Lang, Record<string, string>> = {
  uz: { draft: "Qoralama", queued: "Navbatda", planning: "Ssenariy", sourcing: "Kadrlar", voicing: "Ovoz", rendering: "Render", completed: "Tayyor", failed: "Xato" },
  ru: { draft: "Черновик", queued: "В очереди", planning: "Сценарий", sourcing: "Кадры", voicing: "Озвучка", rendering: "Рендер", completed: "Готово", failed: "Ошибка" },
};
