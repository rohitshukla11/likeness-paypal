/** The creator browser's filter (the Brand page and the agent's list_creators use the same one), over the seed. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filterCreators, termsSummary, toCard } from "../lib/creator-browse";
import { PERSONAS, SYNTHETIC_LABEL, isSynthetic, personaOf } from "../lib/personas";

// The three seeded creators as a new demo workspace has them: Rohit and Theo licensed, Maya not.
const rows = PERSONAS.map((p) => ({ id: `cre_${p.key}`, name: p.name, photoRef: p.photo, ...p.terms, acceptingLicences: true }));
const licences = PERSONAS.filter((p) => p.seededLicence).map((p) => ({ creatorId: `cre_${p.key}`, state: "active" }));
const cards = rows.map((r) => toCard(r, licences));
const names = (f: Parameters<typeof filterCreators>[1]) => filterCreators(cards, f).map((c) => c.name);

describe("seeded personas", () => {
  it("are Rohit (real) and two synthetic creators with distinct niches and terms", () => {
    assert.deepEqual(PERSONAS.map((p) => [p.name, p.synthetic]), [["Rohit", false], ["Maya Lindqvist", true], ["Theo Marlowe", true]]);
    assert.equal(new Set(PERSONAS.map((p) => p.niche)).size, 3);
    assert.equal(new Set(PERSONAS.map((p) => p.terms.pricePerRenderCents)).size, 3);
    assert.equal(SYNTHETIC_LABEL, "Synthetic creator: fictional person, AI-generated face");
  });
  it("one synthetic creator starts licensed and the other doesn't", () => {
    assert.deepEqual(PERSONAS.filter((p) => p.synthetic).map((p) => !!p.seededLicence).sort(), [false, true]);
  });
  it("portrait prompts say the face must not resemble any real or famous person", () => {
    for (const p of PERSONAS.filter((x) => x.synthetic)) assert.match(p.portrait ?? "", /fictional.*must not resemble any real person, celebrity, public figure or famous person/s);
  });
  it("are found by photo_ref; an onboarded creator is no persona and not synthetic", () => {
    assert.equal(personaOf("/demo/maya.svg")?.name, "Maya Lindqvist");
    assert.equal(isSynthetic("/media/creator/cre_x"), false);
    assert.equal(isSynthetic(null), false);
  });
});

describe("filterCreators", () => {
  it('"a fitness creator under $3" is Maya', () => {
    assert.deepEqual(names({ niche: "fitness", maxPriceCents: 300 }), ["Maya Lindqvist"]);
  });
  it("filters by price, use, format, licence and name", () => {
    assert.deepEqual(names({ maxPriceCents: 200 }), ["Rohit"]);
    assert.deepEqual(names({ use: "editorial" }), ["Maya Lindqvist"]);
    assert.deepEqual(names({ format: "image_only" }), ["Theo Marlowe"]);
    assert.deepEqual(names({ format: "video" }), ["Rohit", "Maya Lindqvist"]);
    assert.deepEqual(names({ licence: "licensed" }), ["Rohit", "Theo Marlowe"]);
    assert.deepEqual(names({ licence: "not_yet" }), ["Maya Lindqvist"]);
    assert.deepEqual(names({ q: "theo" }), ["Theo Marlowe"]);
    assert.deepEqual(names({ niche: "tech" }), ["Theo Marlowe"]);
    assert.deepEqual(names({ niche: "gaming" }), []);
    assert.equal(names({}).length, 3);
  });
  it("counts a pending request as not licensed yet", () => {
    const c = toCard(rows[1], [{ creatorId: rows[1].id, state: "pending" }]);
    assert.equal(c.licence, "requested");
    assert.deepEqual(filterCreators([c], { licence: "not_yet" }).length, 1);
  });
  it("summarises terms, with images only when video isn't allowed", () => {
    assert.equal(termsSummary(cards[2]), "$3.50 per image, images only; advertising, internal; up to 5 renders over 14 days");
    assert.equal(termsSummary(cards[1]), "$2.50 per image, $5.00 per video; advertising, social, editorial; up to 8 renders over 21 days");
  });
});
