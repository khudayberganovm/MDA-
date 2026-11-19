// Default catalog on first start. Everything is editable later in the Mini App admin panel.
import { db } from "../db.js";

const PACKAGES = [
  { title: "1 video", videos: 1, price: 150_000, oldPrice: null, badge: null, sortOrder: 1 },
  { title: "5 video", videos: 5, price: 650_000, oldPrice: 750_000, badge: "Ommabop", sortOrder: 2 },
  { title: "10 video", videos: 10, price: 1_200_000, oldPrice: 1_500_000, badge: "Eng foydali", sortOrder: 3 },
];

const TEMPLATES = [
  { title: "Umra safari", category: "Umra va Haj", description: "Muqaddas safarga taklif: sanalar, narx, mehmonxona va xizmatlar. Sokin, ishonchli uslub.", agentNotes: "Uslub: sokin, hurmatli. Makka va Madina manzaralari, yumshoq musiqa. Diniy mavzuga mos, ortiqcha effektlarsiz." },
  { title: "Dengiz bo‘yida dam olish", category: "Xorijiy turlar", description: "Turkiya, Misr, BAA kabi plyaj turlari uchun yorqin va quyoshli video.", agentNotes: "Uslub: yorqin, quvnoq. Dengiz, plyaj, mehmonxona basseyni kadrlari. Narx va «hammasi kiradi» xizmatlarini katta ko‘rsat." },
  { title: "Shahar sayohati", category: "Xorijiy turlar", description: "Dubay, Istanbul, Yevropa shaharlari: dinamik montaj, diqqatga sazovor joylar.", agentNotes: "Uslub: dinamik, tez montaj. Shaharning mashhur joylari, kechki chiroqlar." },
  { title: "Last minute aksiya", category: "Aksiyalar", description: "Qisqa muddatli chegirma: tez, e’tiborni tortadigan, muddat va narx ta’kidlangan.", agentNotes: "Uslub: shoshilinch, yorqin ranglar. Chegirma va muddatni birinchi 3 soniyada ko‘rsat. Taymer effekti." },
  { title: "O‘zbekiston bo‘ylab", category: "Ichki turizm", description: "Samarqand, Buxoro, Xiva, tog‘ va ko‘llar bo‘ylab ichki turlar.", agentNotes: "Uslub: milliy, iliq. Tarixiy obidalar va tabiat manzaralari." },
  { title: "Agentlik imidji", category: "Brending", description: "Agentligingiz haqida: tajriba, mamnun mijozlar, ishonch va xizmatlar.", agentNotes: "Uslub: korporativ, ishonchli. Agentlik logosi, yillar tajribasi, mijozlar soni, yo‘nalishlar ro‘yxati." },
];

export async function seedCatalog() {
  if ((await db.package.count()) === 0) await db.package.createMany({ data: PACKAGES });
  if ((await db.template.count()) === 0) await db.template.createMany({ data: TEMPLATES.map((t, i) => ({ ...t, durationSec: 30, sortOrder: i + 1 })) });
}
