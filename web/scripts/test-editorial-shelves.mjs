import assert from "node:assert/strict";
import { test } from "node:test";
import { editorialCuebooks, editorialShelves, editorialSources } from "../data/editorial-shelves.mjs";
import { validateEditorialCorpus } from "./validate-editorial-shelves.mjs";

test("the first editorial release is source-backed and reusable", () => {
  assert.deepEqual(validateEditorialCorpus(), {
    shelves: 5,
    cuebooks: 30,
    revisions: 30,
    tasks: 150,
    sources: 18,
    placements: 30,
  });
});

test("source observations stay in the editorial manifest and public provenance is minimal", () => {
  assert.ok(editorialSources.every((source) => source.observations.length));
  assert.ok(editorialCuebooks.every((cuebook) => !Object.hasOwn(cuebook.provenance, "observations")));
  assert.ok(editorialCuebooks.every((cuebook) => cuebook.provenance.curator_label === "CuckooCue編集"));
});

test("Shelves are lifestyle compositions rather than domain mirrors", () => {
  const cuebookByKey = new Map(editorialCuebooks.map((cuebook) => [cuebook.key, cuebook]));
  const catShelf = editorialShelves.find((shelf) => shelf.id === "editorial-shelf-two-cats-home");
  assert.ok(catShelf);
  assert.deepEqual(new Set(catShelf.cuebook_keys.map((key) => cuebookByKey.get(key).domain)), new Set(["ペットケア", "防災準備", "引っ越し"]));
  assert.ok(editorialShelves.every((shelf) => !shelf.title.endsWith("の段取り")));
});
