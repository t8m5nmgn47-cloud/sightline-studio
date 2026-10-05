import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as cheerio from "cheerio";

// The flagship showcases are whatever the homepage features ("work-grid" cards),
// read from the page itself so a removed demo can't leave this test pointing at
// a folder that no longer exists.
const home = await readFile(new URL("../index.html", import.meta.url), "utf8");
const showcases = [...new Set([...home.matchAll(/<a class="wcard[^"]*" href="\/([a-z0-9-]+)\/"/g)].map((m) => `${m[1]}/index.html`))];
assert.ok(showcases.length >= 3, "homepage should feature at least three showcase sites");

const forbidden = [
  /default web site page/i,
  /modern, friendly service/i,
  /lorem ipsum/i,
];

for (const path of showcases) {
  const html = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
  const $ = cheerio.load(html);
  const title = $("title").text().trim();
  const description = $('meta[name="description"]').attr("content")?.trim() || "";
  const viewport = $('meta[name="viewport"]').attr("content") || "";
  const h1s = $("h1");
  const ctas = $('a.button, button, a[href*="#contact"], a[href*="#book"]');

  assert.ok(title.length >= 20 && title.length <= 85, `${path}: title should be useful and specific`);
  assert.ok(description.length >= 70 && description.length <= 220, `${path}: meta description should be meaningful`);
  assert.match(viewport, /width=device-width/i, `${path}: viewport meta is required`);
  assert.equal(h1s.length, 1, `${path}: exactly one H1 is required`);
  assert.ok(h1s.text().trim().length >= 20, `${path}: H1 must make a clear promise`);
  assert.ok(ctas.length >= 2, `${path}: at least two clear calls to action are required`);
  assert.equal($("main, section").length >= 4, true, `${path}: page needs enough structured content to support a buying decision`);
  assert.equal($('a[href=""]').length, 0, `${path}: empty links are not allowed`);

  const visible = $.root().text();
  for (const pattern of forbidden) assert.doesNotMatch(`${title}\n${description}\n${visible}`, pattern, `${path}: placeholder language found`);
}

console.log(`Portfolio self-test passed for ${showcases.length} flagship showcase sites.`);
