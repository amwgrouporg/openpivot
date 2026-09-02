import { test } from "node:test";
import assert from "node:assert/strict";
import { buildQueries, transliterate, latinToCyrillicHeuristic, hasCyrillic } from "../src/queries.js";

test("domain queries include site and off-site variants", () => {
  const q = buildQueries("news.example.com", "domain").map((x) => x.query);
  assert.ok(q.includes("site:news.example.com"));
  assert.ok(q.includes('"news.example.com" -site:news.example.com'));
  assert.ok(q.includes('"example.com" -site:example.com'));
});

test("text queries permute two or three tokens and never duplicate", () => {
  const q = buildQueries("Acme Holdings", "org").map((x) => x.query);
  assert.ok(q.includes('"Acme Holdings"'));
  assert.ok(q.includes('"Holdings Acme"'));
  assert.equal(new Set(q).size, q.length);
});

test("cyrillic input gets two transliterations", () => {
  const q = buildQueries("Щукин Юрий", "org");
  const labels = q.map((x) => x.label);
  assert.ok(labels.includes("transliterated (BGN/PCGN)"));
  assert.ok(labels.includes("transliterated (ICAO 2013)"));
  assert.equal(q.find((x) => x.label === "transliterated (BGN/PCGN)").query, '"Shchukin Yuriy"');
  assert.equal(q.find((x) => x.label === "transliterated (ICAO 2013)").query, '"Shchukin Iurii"');
});

test("latin input gets a heuristic cyrillic variant", () => {
  assert.equal(latinToCyrillicHeuristic("Shchukin"), "Щукин");
  assert.ok(hasCyrillic(buildQueries("Ivanov", "text").find((x) => x.label.startsWith("cyrillic")).query));
});

test("empty input yields nothing", () => {
  assert.deepEqual(buildQueries("   ", "text"), []);
});

test("transliterate preserves non-cyrillic characters", () => {
  assert.equal(transliterate("ООО Ромашка-2", { о: "o", р: "r", м: "m", а: "a", ш: "sh", к: "k" }), "OOO Romashka-2");
});
