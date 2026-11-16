export type CatalogItem = {
  id: string;
  name: string;
  tamil: string;
  aliases: string;
  unit: string;
};
export type Parsed = {
  productId: string;
  quantity: number;
  ambiguous: boolean;
};
export function parseList(text: string, catalog: CatalogItem[]): Parsed[] {
  const input = text.toLowerCase();
  const found: { p: CatalogItem; start: number; end: number }[] = [];
  for (const p of catalog) {
    const aliases = [p.name, p.tamil, ...p.aliases.split(",")].sort(
      (a, b) => b.length - a.length,
    );
    for (const alias of aliases) {
      const start = input.indexOf(alias.toLowerCase());
      if (start >= 0 && !found.some((f) => start >= f.start && start < f.end)) {
        found.push({ p, start, end: start + alias.length });
        break;
      }
    }
  }
  found.sort((a, b) => a.start - b.start);
  return found.map((f, i) => {
    const left =
      input
        .slice(i ? found[i - 1].end : 0, f.start)
        .split(/[,\.\n]/)
        .pop() || "";
    const right = input
      .slice(f.end, found[i + 1]?.start ?? input.length)
      .split(/[,\.\n]/)[0];
    const quantity = (s: string) => {
      const m = s.match(
        /(\d+(?:\.\d+)?)\s*(kg|kilo|கிலோ|grams?|g\b|கிராம்|bunch(?:es)?|kattu|கட்டு|100g)/,
      );
      if (m) {
        let n = Number(m[1]);
        if (/^(g|gram|கிராம்)/.test(m[2])) n /= f.p.unit === "100g" ? 100 : 1000;
        return Math.round(n * 1000);
      }
      const words: [RegExp, number][] = [
        [/\b(?:arai|ara|half)\s+kilo|அரை\s*கிலோ/, 500],
        [/\b(?:kaalu|kal|quarter)\s+kilo|கால்\s*கிலோ/, 250],
        [/\b(?:oru|one)\s*(?:kilo|kattu|bunch)|ஒரு\s*(?:கிலோ|கட்டு)/, 1000],
        [
          /\b(?:rendu|two)\s*(?:kilo|kattu|bunch)|(?:இரண்டு|ரெண்டு)\s*(?:கிலோ|கட்டு)/,
          2000,
        ],
        [
          /\b(?:moonu|three)\s*(?:kilo|kattu|bunch)|மூன்று\s*(?:கிலோ|கட்டு)/,
          3000,
        ],
      ];
      return words.find(([r]) => r.test(s))?.[1];
    };
    const q = quantity(left) ?? quantity(right);
    return {
      productId: f.p.id,
      quantity: q ?? 1000,
      ambiguous: q === undefined,
    };
  });
}
export function lineTotal(price: number, quantity: number) {
  return Math.round((price * quantity) / 1000);
}
