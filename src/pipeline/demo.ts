// DEMO_MODE content: fixed sample script + pre-recorded narration fixtures (assets/demo).
// This is NOT AI output and is labelled as demo everywhere it is shown.
import type { ProjectOptions, Storyboard } from "./storyboard.js";

type DemoScene = { id: string; headline: Record<"uz" | "ru", string>; narration: Record<"uz" | "ru", string>; keywords: string[]; motion: "fade" | "slide" | "scale" | "zoom"; visual: string };

export const DEMO_SCENES: DemoScene[] = [
  { id: "d1", motion: "zoom", visual: "Modern city business district", keywords: ["modern office", "city skyline"],
    headline: { uz: "Biznesingiz uchun", ru: "Для вашего бизнеса" },
    narration: { uz: "Biznesingizni yangi bosqichga olib chiqish vaqti keldi.", ru: "Пришло время вывести ваш бизнес на новый уровень." } },
  { id: "d2", motion: "slide", visual: "Team working together", keywords: ["team meeting", "business people"],
    headline: { uz: "Zamonaviy yechimlar", ru: "Современные решения" },
    narration: { uz: "Biz zamonaviy va qulay yechimlarni taklif qilamiz.", ru: "Мы предлагаем современные и удобные решения." } },
  { id: "d3", motion: "scale", visual: "Happy customer using a phone", keywords: ["happy customer", "smartphone shopping"],
    headline: { uz: "Mijozlar uchun qulay", ru: "Удобно для клиентов" },
    narration: { uz: "Mijozlaringiz uchun tez, ishonchli va qulay xizmat.", ru: "Быстрый, надёжный и удобный сервис для ваших клиентов." } },
  { id: "d4", motion: "fade", visual: "Product close-up", keywords: ["product closeup", "delivery package"],
    headline: { uz: "Sifat birinchi o‘rinda", ru: "Качество прежде всего" },
    narration: { uz: "Har bir tafsilotga e’tibor beramiz.", ru: "Мы уделяем внимание каждой детали." } },
  { id: "d5", motion: "scale", visual: "Call to action", keywords: ["handshake", "online order"],
    headline: { uz: "Bugunoq bog‘laning", ru: "Свяжитесь сегодня" },
    narration: { uz: "Bugunoq biz bilan bog‘laning va buyurtma bering!", ru: "Свяжитесь с нами сегодня и оформите заказ!" } },
];

export function demoStoryboard(o: ProjectOptions): Storyboard {
  const L = o.language;
  const pick = o.duration === 15 ? ["d1", "d3", "d5"] : DEMO_SCENES.map((s) => s.id);
  const per = o.duration / pick.length;
  const scenes = DEMO_SCENES.filter((s) => pick.includes(s.id)).map((s, i) => ({
    order: i + 1, durationSec: per, visual: s.visual, keywords: s.keywords,
    narration: s.narration[L], subtitle: s.narration[L], headline: s.headline[L], motion: s.motion,
    demoId: s.id,
  }));
  return {
    topic: "DEMO: business ad",
    language: L,
    title: o.businessName || (L === "uz" ? "Zamonaviy biznes" : "Современный бизнес"),
    scenes,
    cta: { text: o.cta || (L === "uz" ? "Hoziroq buyurtma bering" : "Закажите сейчас"), subtext: o.businessName || "" },
  } as Storyboard;
}

export const demoNarrationFile = (lang: "uz" | "ru", id: string) => `assets/demo/narration-${lang}-${id}.mp3`;
