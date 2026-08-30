/** Characters worth a picker.
 *
 * Every one of these inserts as **plain text**, which is the whole reason this
 * is cheap: a symbol is a character, not a node, so nothing here touches the
 * editor's schema, the Markdown converters, or the parity contract between
 * them. `±` is as much a part of a paragraph as `a` is.
 *
 * The list is curated rather than the full Unicode range. A picker that offers
 * everything is a font browser, and the thing people actually want is the
 * dozen characters their keyboard does not have.
 */

export type Symbol = {
  char: string;
  /** What it is called, and what it is found by. */
  name: string;
  /** Extra search terms that are not in the name — how someone would look for
   *  it rather than what it is called. "x" finds ×; "-" finds an em dash. */
  keywords?: string[];
};

export type SymbolGroup = {
  name: string;
  symbols: Symbol[];
};

export const SYMBOL_GROUPS: SymbolGroup[] = [
  {
    name: "Punctuation",
    symbols: [
      { char: "—", name: "Em dash", keywords: ["-", "--", "dash"] },
      { char: "–", name: "En dash", keywords: ["-", "dash", "range"] },
      { char: "…", name: "Ellipsis", keywords: ["...", "dots"] },
      { char: "“", name: "Left double quote", keywords: ['"', "curly"] },
      { char: "”", name: "Right double quote", keywords: ['"', "curly"] },
      { char: "‘", name: "Left single quote", keywords: ["'", "curly"] },
      { char: "’", name: "Right single quote", keywords: ["'", "apostrophe"] },
      { char: "§", name: "Section" },
      { char: "¶", name: "Pilcrow", keywords: ["paragraph"] },
      { char: "†", name: "Dagger", keywords: ["footnote"] },
      { char: "•", name: "Bullet", keywords: ["dot"] },
    ],
  },
  {
    name: "Mathematics",
    symbols: [
      { char: "×", name: "Multiplication", keywords: ["x", "times"] },
      { char: "÷", name: "Division", keywords: ["/", "divide"] },
      { char: "±", name: "Plus-minus", keywords: ["+-", "tolerance"] },
      { char: "≠", name: "Not equal", keywords: ["!=", "unequal"] },
      { char: "≤", name: "Less than or equal", keywords: ["<="] },
      { char: "≥", name: "Greater than or equal", keywords: [">="] },
      { char: "≈", name: "Approximately", keywords: ["~", "about"] },
      { char: "∞", name: "Infinity" },
      { char: "√", name: "Square root", keywords: ["sqrt"] },
      { char: "∑", name: "Sum", keywords: ["sigma", "total"] },
      { char: "∏", name: "Product", keywords: ["pi"] },
      { char: "∫", name: "Integral" },
      { char: "∂", name: "Partial derivative" },
      { char: "°", name: "Degree", keywords: ["temperature", "angle"] },
      { char: "‰", name: "Per mille", keywords: ["permille", "thousand"] },
    ],
  },
  {
    name: "Currency",
    symbols: [
      { char: "€", name: "Euro", keywords: ["eur"] },
      { char: "£", name: "Pound", keywords: ["gbp", "sterling"] },
      { char: "¥", name: "Yen", keywords: ["jpy", "yuan"] },
      { char: "₹", name: "Rupee", keywords: ["inr"] },
      { char: "₨", name: "Rupee sign", keywords: ["pkr", "pakistan"] },
      { char: "¢", name: "Cent" },
      { char: "₩", name: "Won", keywords: ["krw"] },
      { char: "₽", name: "Rouble", keywords: ["rub"] },
    ],
  },
  {
    name: "Arrows",
    symbols: [
      { char: "→", name: "Right arrow", keywords: ["->", "to"] },
      { char: "←", name: "Left arrow", keywords: ["<-", "from"] },
      { char: "↑", name: "Up arrow" },
      { char: "↓", name: "Down arrow" },
      { char: "↔", name: "Left-right arrow", keywords: ["<->", "both"] },
      { char: "⇒", name: "Implies", keywords: ["=>", "therefore"] },
    ],
  },
  {
    name: "Marks",
    symbols: [
      { char: "✓", name: "Check", keywords: ["tick", "done", "yes"] },
      { char: "✗", name: "Cross", keywords: ["x", "no", "wrong"] },
      { char: "★", name: "Star filled", keywords: ["favourite"] },
      { char: "☆", name: "Star outline" },
      { char: "©", name: "Copyright", keywords: ["(c)"] },
      { char: "®", name: "Registered", keywords: ["(r)"] },
      { char: "™", name: "Trademark", keywords: ["tm"] },
      { char: "№", name: "Numero", keywords: ["number", "no."] },
    ],
  },
  {
    name: "Letters",
    symbols: [
      { char: "α", name: "Alpha" },
      { char: "β", name: "Beta" },
      { char: "γ", name: "Gamma" },
      { char: "Δ", name: "Delta", keywords: ["change"] },
      { char: "θ", name: "Theta", keywords: ["angle"] },
      { char: "λ", name: "Lambda" },
      { char: "μ", name: "Mu", keywords: ["micro"] },
      { char: "π", name: "Pi" },
      { char: "σ", name: "Sigma" },
      { char: "Ω", name: "Omega", keywords: ["ohm"] },
    ],
  },
];

/** Symbols matching a query, across every group.
 *
 * Matches the character itself as well as its name and keywords, so pasting a
 * `×` into the box finds it — which is how someone asks "what is this and can I
 * have another one".
 *
 * An empty query returns nothing rather than everything: the caller shows the
 * groups in that case, and returning the flat list would silently replace a
 * browsable layout with a wall of characters.
 */
export function searchSymbols(query: string): Symbol[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return [];

  const matches: Symbol[] = [];

  for (const group of SYMBOL_GROUPS) {
    for (const symbol of group.symbols) {
      const haystack = [symbol.char, symbol.name, ...(symbol.keywords ?? [])];
      if (haystack.some((term) => term.toLowerCase().includes(needle))) {
        matches.push(symbol);
      }
    }
  }

  return matches;
}
