import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { activeDomainLabels } from "../src/lib/domain-catalog.ts";
import { editorialCuebooks, editorialShelves, editorialSources } from "../data/editorial-shelves.mjs";

const sourceTypes = new Set(["official", "youtube", "blog", "interview"]);
const sourceRights = new Set(["government-standard-terms-2.0", "platform-link-only", "research-only", "licensed"]);

export function validateEditorialCorpus() {
  assert.equal(editorialShelves.length, 5, "The first editorial release must contain five reviewed Shelves");
  assert.equal(editorialCuebooks.length, 30, "The first editorial release must contain thirty Cuebooks");
  assert.equal(editorialSources.length, 18, "The first editorial release must contain eighteen reviewed sources");

  const domains = new Set(activeDomainLabels());
  const sourceById = new Map(editorialSources.map((source) => [source.id, source]));
  const cuebookByKey = new Map(editorialCuebooks.map((cuebook) => [cuebook.key, cuebook]));
  assert.equal(sourceById.size, editorialSources.length, "Source IDs must be unique");
  assert.equal(cuebookByKey.size, editorialCuebooks.length, "Cuebook keys must be unique");
  assert.equal(new Set(editorialCuebooks.map((item) => item.cuebook_id)).size, editorialCuebooks.length, "Cuebook IDs must be unique");
  assert.equal(new Set(editorialCuebooks.map((item) => item.revision_id)).size, editorialCuebooks.length, "Revision IDs must be unique");
  assert.equal(new Set(editorialShelves.map((item) => item.id)).size, editorialShelves.length, "Shelf IDs must be unique");

  for (const source of editorialSources) {
    assert.ok(sourceTypes.has(source.source_type), `Unsupported source type: ${source.id}`);
    assert.ok(sourceRights.has(source.rights), `Unsupported rights classification: ${source.id}`);
    assert.ok(source.title.trim() && source.publisher.trim(), `Source metadata is incomplete: ${source.id}`);
    assert.ok(/^https:\/\//.test(source.url), `Source URL must use HTTPS: ${source.id}`);
    assert.match(source.accessed_at, /^\d{4}-\d{2}-\d{2}$/, `Source access date is invalid: ${source.id}`);
    assert.ok(source.observations.length >= 1 && source.observations.every((note) => note.trim()), `Source observations are required: ${source.id}`);
    if (source.source_type === "youtube") assert.match(source.url, /^https:\/\/(www\.)?youtube\.com\/watch\?v=/, `YouTube sources must be watch URLs: ${source.id}`);
  }

  for (const cuebook of editorialCuebooks) {
    assert.ok(domains.has(cuebook.domain), `Cuebook uses an unmanaged domain: ${cuebook.key}`);
    assert.ok(cuebook.context_text.length >= 20, `Cuebook context is too thin: ${cuebook.key}`);
    assert.ok(cuebook.tasks.length >= 5 && cuebook.tasks.length <= 8, `Cuebook must contain five to eight tasks: ${cuebook.key}`);
    assert.equal(new Set(cuebook.tasks.map((item) => item.text)).size, cuebook.tasks.length, `Cuebook tasks must be unique: ${cuebook.key}`);
    assert.ok(cuebook.source_ids.length >= 2, `Cuebook must have at least two sources: ${cuebook.key}`);
    cuebook.source_ids.forEach((id) => assert.ok(sourceById.has(id), `Unknown source ${id} in ${cuebook.key}`));
    cuebook.tasks.forEach((item) => {
      assert.ok(item.text.length >= 8 && item.text.length <= 240, `Task length is invalid: ${cuebook.key}`);
      assert.ok(item.relative_start_day <= item.relative_end_day, `Task dates are reversed: ${cuebook.key}`);
    });
    const offsets = cuebook.task_groupings.flatMap((group) => group.task_offsets);
    assert.deepEqual([...offsets].sort((a, b) => a - b), cuebook.tasks.map((_, index) => index), `Task groupings must cover each task once: ${cuebook.key}`);
    assert.equal(cuebook.provenance.origin_type, "editorial_synthesis");
    assert.equal(cuebook.provenance.context_mode, "composite");
  }

  for (const shelf of editorialShelves) {
    assert.equal(shelf.cuebook_keys.length, 6, `Each first-release Shelf must contain six Cuebooks: ${shelf.id}`);
    assert.equal(new Set(shelf.cuebook_keys).size, shelf.cuebook_keys.length, `Shelf items must be unique: ${shelf.id}`);
    const cuebooks = shelf.cuebook_keys.map((key) => {
      const item = cuebookByKey.get(key);
      assert.ok(item, `Unknown Cuebook ${key} in ${shelf.id}`);
      return item;
    });
    const sources = cuebooks.flatMap((item) => item.source_ids.map((id) => sourceById.get(id)));
    assert.ok(sources.some((source) => source?.source_type === "youtube" || source?.source_type === "blog"), `Shelf needs an experiential source: ${shelf.id}`);
    assert.ok(sources.some((source) => source?.source_type === "official"), `Shelf needs an official verification source: ${shelf.id}`);
  }

  return {
    shelves: editorialShelves.length,
    cuebooks: editorialCuebooks.length,
    revisions: editorialCuebooks.length,
    tasks: editorialCuebooks.reduce((count, item) => count + item.tasks.length, 0),
    sources: editorialSources.length,
    placements: editorialShelves.reduce((count, item) => count + item.cuebook_keys.length, 0),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify({ valid: true, ...validateEditorialCorpus() }, null, 2));
}
