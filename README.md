# MOTION AI

Turagentliklar uchun reklama videolariga buyurtma berish xizmati: Telegram bot va Mini App.

Mijoz (turagentlik) Mini App'da shablon tanlaydi, tur ma'lumotlarini yozadi, materiallarini yuklaydi va video paketini to'laydi. Buyurtma jamoaning Telegram guruhiga Claude agenti uchun tayyor brif bilan birga keladi. Jamoa videoni Claude'da tayyorlaydi va guruhga yuboradi, bot uni mijozga yetkazadi. Mijoz videoni qabul qiladi yoki tahrir so'raydi.

## Imkoniyatlar

**Mijoz (Mini App)**
- Shablonlar katalogi: kategoriyalar, 9:16 namuna videolar
- Agentlik profili (nomi, logo, Instagram, telefon, Telegram, shahar), bir marta to'ldiriladi
- Buyurtma: yo'nalish, sanalar, narx, narxga nima kirishi, mehmonxona, aksiya, video tili va ovoz, izoh, rasm va videolar (10 tagacha, har biri 50 MB gacha)
- Video paketlari (1 / 5 / 10 video): balans saqlanadi, har bir buyurtmaga 1 video yechiladi
- To'lov: Payme, Click yoki karta o'tkazmasi (admin tasdiqlaydi)
- Buyurtma holati, tarix, tayyor videoni ko'rish va yuklab olish, qabul qilish yoki tahrir so'rash (sukut bo'yicha 2 ta bepul)

**Jamoa**
- Telegram guruhga buyurtma kartasi keladi. Tugmalar: «Ishga olish», «Claude brifi» (.md fayl), «Materiallar», «Bekor qilish»
- Tayyor videoni kartaga javob (reply) qilib yuborish kifoya: bot uni mijozga avtomatik yetkazadi (hajm cheklovi yo'q)
- Karta orqali to'lovlarni guruhda bir tugma bilan tasdiqlash
- Mini App'dagi Admin bo'limi: buyurtmalar (filtrlar, Claude brifini nusxalash, video yuklash, yakunlash, bekor qilish), shablonlar (namuna video, muqova, agent uchun ko'rsatma), paket narxlari, to'lovlar, balansga bonus video qo'shish, statistika

## Sozlash (`.env`)

| O'zgaruvchi | Vazifasi |
| --- | --- |
| `BOT_TOKEN` | @BotFather bergan token |
| `PUBLIC_URL`, `WEBAPP_URL` | Serverning HTTPS manzili |
| `ADMIN_IDS` | Admin Telegram ID'lari, vergul bilan. ID'ni botga `/myid` yozib bilasiz |
| `ADMIN_CHAT_ID` | Jamoa guruhi. Botni guruhga qo'shing va u yerda `/chatid` yozing |
| `SUPPORT_USERNAME` | Mijozlarga ko'rsatiladigan yordam akkaunti (@ belgisisiz) |
| `PAYME_MERCHANT_ID`, `PAYME_KEY`, `PAYME_TEST` | Payme Merchant API. Kabinetdagi endpoint: `https://<domen>/pay/payme` |
| `CLICK_SERVICE_ID`, `CLICK_MERCHANT_ID`, `CLICK_SECRET_KEY` | Click SHOP API. Prepare: `https://<domen>/pay/click/prepare`, Complete: `https://<domen>/pay/click/complete` |
| `MANUAL_PAY_INFO` | Karta rekvizitlari (yangi qator uchun `\n`). Bo'sh bo'lsa bu usul ko'rinmaydi |
| `REVISIONS_PER_ORDER` | Bepul tahrirlar soni (sukut bo'yicha 2) |

To'lov usuli faqat sozlangan bo'lsa ko'rinadi. Admin guruhi a'zolari jamoa hisoblanadi: ular buyurtmani ishga olishi, bekor qilishi va video yuborishi mumkin. Shuning uchun guruh yopiq bo'lsin.

## Lokal ishga tushirish

```bash
npm ci
cp .env.example .env       # DEV_AUTH=true, ADMIN_IDS ga o'zingizning dev ID'ingizni yozing
npm run db:init
npm run build:web && npm start   # http://localhost:8080/?dev=<id>
npm run test:e2e           # 69 ta avtomatik tekshiruv: buyurtma, Payme, Click, admin, ruxsatlar
```

`DEV_AUTH=true` bo'lsa Telegram'siz kirish va «Test to'lov» usuli ishlaydi. Production'da bu rejim o'chiq.

## Deploy

AWS'da deploy avtomatik: `main`'ga push qilingach 1 daqiqa ichida server yangilanadi. Batafsil: `deploy/README.md`. Boshqa serverda: `docker compose up -d --build`.
