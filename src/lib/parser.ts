export type CatalogItem = {
  id: string;
  name: string;
  tamil: string;
  aliases: string;
  unit: string;
};
export type Parsed = {
  productId: string;
  // Integer thousandths of the catalog unit, never a floating point stock value.
  quantity: number;
  ambiguous: boolean;
  reason?: string;
};
type Mention = { p: CatalogItem; start: number; end: number };
type Quantity = { start: number; end: number; value: number; unit: string };
const word = /[\p{L}\p{M}\p{N}]/u;
const normalize = (s: string) =>
  s
    .normalize("NFC")
    .toLowerCase()
    .replace(/[௦-௯]/g, (c) => String(c.charCodeAt(0) - 0x0be6));
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function mentions(input: string, catalog: CatalogItem[]): Mention[] {
  const matches: Mention[] = [];
  for (const p of catalog) {
    for (const alias of new Set(
      [p.name, p.tamil, ...p.aliases.split(",")]
        .map((a) => normalize(a.trim()))
        .filter(Boolean),
    )) {
      const regex = new RegExp(escape(alias).replace(/\s+/g, "\\s+"), "gu");
      for (const m of input.matchAll(regex)) {
        const start = m.index!,
          end = start + m[0].length;
        if (
          (start && word.test(input[start - 1])) ||
          (end < input.length && word.test(input[end]))
        )
          continue;
        matches.push({ p, start, end });
      }
    }
  }
  // Longest aliases win globally, including across products (e.g. murungai keerai).
  const selected: Mention[] = [];
  for (const m of matches.sort((a, b) => b.end - b.start - (a.end - a.start))) {
    if (!selected.some((s) => m.start < s.end && m.end > s.start))
      selected.push(m);
  }
  return selected.sort((a, b) => a.start - b.start);
}
function quantities(input: string): Quantity[] {
  const result: Quantity[] = [];
  const numbers: Record<string, number> = {
    arai: 0.5,
    ara: 0.5,
    half: 0.5,
    அரை: 0.5,
    kaalu: 0.25,
    kaal: 0.25,
    quarter: 0.25,
    கால்: 0.25,
    oru: 1,
    one: 1,
    ஒரு: 1,
    rendu: 2,
    irandu: 2,
    two: 2,
    இரண்டு: 2,
    ரெண்டு: 2,
    moonu: 3,
    three: 3,
    மூன்று: 3,
  };
  const regex =
    /(?<n>\d+\s*\/\s*\d+|\d+(?:\.\d+)?|\.\d+|arai|ara|half|அரை|kaalu|kaal|quarter|கால்|oru|one|ஒரு|rendu|irandu|two|இரண்டு|ரெண்டு|moonu|three|மூன்று)\s*(?<u>kilograms?|kilos?|kg|கிலோ|grams?|கிராம்|g|bunches|bunch|kattu|கட்டு|units?|pieces?)\b/gu;
  // JS \b is ASCII-only; use a unicode boundary for Tamil unit endings too.
  const unicodeRegex = new RegExp(
    regex.source.replace("\\b", "(?![\\p{L}\\p{M}])"),
    "gu",
  );
  for (const m of input.matchAll(unicodeRegex)) {
    if (m.index! && word.test(input[m.index! - 1])) continue;
    const n = m.groups!.n,
      unit = m.groups!.u;
    const value = n.includes("/")
      ? n
          .split("/")
          .map(Number)
          .reduce((a, b) => a / b)
      : (numbers[n] ?? Number(n));
    result.push({ start: m.index!, end: m.index! + m[0].length, value, unit });
  }
  return result;
}
function convert(q: Quantity, unit: string): number | undefined {
  const weight = /^(?:kilo|kg|கிலோ|gram|g$|கிராம்)/u.test(q.unit);
  const grams = /^(?:gram|g$|கிராம்)/u.test(q.unit);
  const bunch = /^(?:bunch|kattu|கட்டு)/u.test(q.unit);
  if ((unit === "bunch" && !bunch) || (unit !== "bunch" && !weight)) return;
  const units =
    unit === "bunch"
      ? q.value
      : (q.value * (grams ? 1 : 1000)) / (unit === "100g" ? 100 : 1000);
  const scaled = Math.round(units * 1000);
  if (!Number.isSafeInteger(scaled) || scaled <= 0 || scaled > 100000000)
    return;
  return scaled;
}
export function parseList(text: string, catalog: CatalogItem[]): Parsed[] {
  const input = normalize(text);
  const parsed: Parsed[] = [];
  // A decimal point stays attached to its number. Sentences and list separators split clauses.
  for (const clause of input.split(/[,;\n!?]|\.(?!\d)/u)) {
    const products = mentions(clause, catalog),
      amounts = quantities(clause);
    const prefix =
      amounts.length > 0 && amounts[0].start < (products[0]?.start ?? 0);
    for (let i = 0; i < products.length; i++) {
      const m = products[i];
      const candidates = amounts.filter((q) =>
        prefix
          ? q.start >= (products[i - 1]?.end ?? 0) && q.end <= m.start
          : q.start >= m.end &&
            q.end <= (products[i + 1]?.start ?? clause.length),
      );
      const q =
        candidates.length === 1 ? convert(candidates[0], m.p.unit) : undefined;
      parsed.push({
        productId: m.p.id,
        quantity: q ?? 1000,
        ambiguous: q === undefined,
        ...(q === undefined
          ? {
              reason: candidates.length
                ? `Check the quantity and unit; ${m.p.name} is sold per ${m.p.unit}.`
                : "Quantity missing. Please set it before confirming.",
            }
          : {}),
      });
    }
  }
  // Repeated mentions represent one cart line; an unclear mention remains flagged.
  return Array.from(
    parsed
      .reduce((map, p) => {
        const old = map.get(p.productId);
        map.set(
          p.productId,
          old
            ? {
                ...p,
                quantity: old.quantity + p.quantity,
                ambiguous: old.ambiguous || p.ambiguous,
                reason: old.reason || p.reason,
              }
            : p,
        );
        return map;
      }, new Map<string, Parsed>())
      .values(),
  );
}
export function lineTotal(price: number, quantity: number) {
  if (
    !Number.isSafeInteger(price) ||
    price < 0 ||
    !Number.isSafeInteger(quantity) ||
    quantity <= 0 ||
    !Number.isSafeInteger(price * quantity)
  )
    throw Error("Invalid price or quantity");
  return Math.round((price * quantity) / 1000);
}
