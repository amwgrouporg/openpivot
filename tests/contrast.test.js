import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");

function token(name) {
  const match = css.match(new RegExp(`${name}\\s*:\\s*(#[0-9a-f]{6})`, "i"));
  assert.ok(match, `missing ${name}`);
  return match[1];
}

function luminance(hex) {
  const channels = hex.match(/[0-9a-f]{2}/gi).map((part) => Number.parseInt(part, 16) / 255)
    .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(foreground, background) {
  const values = [luminance(foreground), luminance(background)].sort((left, right) => right - left);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test("every small-text token meets AA on every mineral text surface", () => {
  const foregrounds = ["--text", "--text-soft", "--muted", "--paper-text", "--azure-focus", "--green", "--unresolved", "--status-red", "--agent-violet"];
  const surfaces = ["--mineral-0", "--mineral-1", "--mineral-2", "--mineral-3"];
  for (const foreground of foregrounds) for (const surface of surfaces) {
    assert.ok(contrast(token(foreground), token(surface)) >= 4.5, `${foreground} on ${surface}`);
  }
});

test("source-excerpt text meets AA on the paper surface", () => {
  assert.ok(contrast(token("--paper-text"), token("--paper")) >= 4.5);
  assert.ok(contrast(token("--unresolved"), token("--paper")) >= 4.5);
});

test("primary button text meets AA against every gradient stop", () => {
  for (const surface of ["--primary-top", "--primary-bottom", "--primary-hover"]) {
    assert.ok(contrast(token("--primary-ink"), token(surface)) >= 4.5, `--primary-ink on ${surface}`);
  }
});

test("meaningful boundary tokens meet non-text contrast on mineral surfaces", () => {
  for (const surface of ["--mineral-0", "--mineral-1", "--mineral-2", "--mineral-3"]) {
    assert.ok(contrast(token("--border"), token(surface)) >= 3, `--border on ${surface}`);
  }
});

test("faint decoration token is not assigned to visible text", () => {
  const visibleFaintText = [...css.matchAll(/([^{}]+)\{[^{}]*color:\s*var\(--faint\)/g)].map((match) => match[1].trim());
  assert.deepEqual(visibleFaintText, []);
});
