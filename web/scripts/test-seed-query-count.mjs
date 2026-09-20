import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function queryCallCount(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  return { count: source.match(/await client\.query\(\{/g)?.length ?? 0, source };
}

test("managed-domain seed batches rows instead of issuing one BigQuery job per item", async () => {
  const { count, source } = await queryCallCount("./seed-managed-domain-corpus.mjs");
  assert.equal(count, 5);
  assert.doesNotMatch(source, /for \(const item of embedded\)/);
  assert.doesNotMatch(source, /for \(const item of managedDomainSeeds\)/);
});

test("editorial seed keeps schema, data, and verification work to seven parent jobs", async () => {
  const { count, source } = await queryCallCount("./seed-editorial-shelves.mjs");
  assert.equal(count, 7);
  assert.doesNotMatch(source, /for \(const item of embedded\)/);
  assert.doesNotMatch(source, /for \(const shelf of editorialShelves\)/);
});
