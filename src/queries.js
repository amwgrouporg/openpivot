// Deterministic search-query builder. Pure. The agent decides what to search for;
// this expands one selector into the operator, ordering and script variants an
// analyst would type by hand.

const CYR_BGN = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya", і: "i", ї: "yi", є: "ye", ґ: "g" };
const CYR_ICAO = { ...CYR_BGN, ё: "e", й: "i", ъ: "ie", ю: "iu", я: "ia" };
const LAT_TO_CYR = [
  ["shch", "щ"], ["zh", "ж"], ["kh", "х"], ["ts", "ц"], ["ch", "ч"], ["sh", "ш"], ["yu", "ю"], ["iu", "ю"], ["ya", "я"], ["ia", "я"], ["yo", "ё"], ["ye", "е"],
  ["a", "а"], ["b", "б"], ["v", "в"], ["g", "г"], ["d", "д"], ["e", "е"], ["z", "з"], ["i", "и"], ["y", "й"], ["k", "к"], ["l", "л"], ["m", "м"], ["n", "н"], ["o", "о"], ["p", "п"], ["r", "р"], ["s", "с"], ["t", "т"], ["u", "у"], ["f", "ф"], ["h", "х"], ["c", "к"], ["x", "кс"], ["w", "в"], ["j", "дж"], ["q", "к"],
];

export function hasCyrillic(s) {
  return /[Ѐ-ӿ]/.test(s);
}

export function transliterate(s, map) {
  let out = "";
  for (const ch of s) {
    const lower = ch.toLowerCase();
    if (lower in map) {
      const t = map[lower];
      out += ch === lower ? t : t.charAt(0).toUpperCase() + t.slice(1);
    } else {
      out += ch;
    }
  }
  return out;
}

export function latinToCyrillicHeuristic(s) {
  let out = "";
  let i = 0;
  const lower = s.toLowerCase();
  while (i < s.length) {
    let matched = false;
    for (const [lat, cyr] of LAT_TO_CYR) {
      if (lower.startsWith(lat, i)) {
        const upper = s[i] !== lower[i];
        out += upper ? cyr.charAt(0).toUpperCase() + cyr.slice(1) : cyr;
        i += lat.length;
        matched = true;
        break;
      }
    }
    if (!matched) { out += s[i]; i++; }
  }
  return out;
}

function permutations(tokens) {
  if (tokens.length <= 1) return [tokens];
  const out = [];
  tokens.forEach((t, i) => {
    const rest = [...tokens.slice(0, i), ...tokens.slice(i + 1)];
    for (const p of permutations(rest)) out.push([t, ...p]);
  });
  return out;
}

export function buildQueries(text, type = "text") {
  const s = String(text ?? "").trim().replace(/\s+/g, " ");
  if (!s) return [];
  const out = [];
  const push = (label, query) => { if (!out.some((q) => q.query === query)) out.push({ label, query }); };

  if (type === "domain") {
    push("exact", `"${s}"`);
    push("on-site", `site:${s}`);
    push("mentions off-site", `"${s}" -site:${s}`);
    push("in URL", `inurl:${s}`);
    push("documents", `"${s}" (filetype:pdf OR filetype:doc OR filetype:docx OR filetype:xls OR filetype:xlsx)`);
    push("in title", `intitle:"${s}"`);
    const apex = s.split(".").slice(-2).join(".");
    if (apex !== s) push("apex mentions", `"${apex}" -site:${apex}`);
    return out;
  }
  if (type === "ip") {
    push("exact", `"${s}"`);
    push("abuse and blocklists", `"${s}" (abuse OR blocklist OR spam OR malware OR phishing)`);
    push("hosting", `"${s}" (hosting OR server OR nameserver OR ns1)`);
    return out;
  }
  if (type === "url") {
    push("exact", `"${s}"`);
    push("mentions", `"${s.replace(/^https?:\/\//, "")}"`);
    return out;
  }

  push("exact phrase", `"${s}"`);
  push("documents", `"${s}" (filetype:pdf OR filetype:doc OR filetype:docx)`);
  push("in title", `intitle:"${s}"`);
  push("in URL", `inurl:${s.toLowerCase().replace(/[^a-z0-9а-яё]+/gi, "-").replace(/^-|-$/g, "")}`);
  push("registries and filings", `"${s}" (register OR registry OR filing OR incorporated OR ltd OR llc OR ooo OR gmbh)`);

  const tokens = s.split(" ").filter(Boolean);
  if (tokens.length >= 2 && tokens.length <= 3) {
    for (const p of permutations(tokens).slice(1)) push("reordered", `"${p.join(" ")}"`);
  }
  if (hasCyrillic(s)) {
    push("transliterated (BGN/PCGN)", `"${transliterate(s, CYR_BGN)}"`);
    const icao = transliterate(s, CYR_ICAO);
    push("transliterated (ICAO 2013)", `"${icao}"`);
  } else if (/^[a-z\s'.-]+$/i.test(s)) {
    push("cyrillic (heuristic, verify)", `"${latinToCyrillicHeuristic(s)}"`);
  }
  return out;
}
