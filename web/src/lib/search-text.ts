// Grammatical/request words, not task subjects or user attributes.
const stopWords = new Set([
  "ある", "い", "する", "した", "したい", "たい", "ため", "できる",
  "で", "と", "に", "の", "へ", "を", "が", "は", "も", "や",
  "から", "まで", "伴う", "について", "です", "ます", "ください",
  "探す", "探し", "探したい", "教え", "まとめ", "まとめる",
  "a", "an", "the", "of", "to", "from", "with", "for",
]);

export function tokenize(input: string): string[] {
  const normalized = input.normalize("NFKC").toLowerCase();
  const segmenter = new Intl.Segmenter(["ja", "en"], { granularity: "word" });
  return [...new Set(Array.from(segmenter.segment(normalized))
    .filter(part => part.isWordLike)
    .map(part => part.segment.trim())
    .filter(part => part.length > 0 && !stopWords.has(part)))];
}

export function buildSearchText(
  input: { title: string; tasks: { text: string }[] },
  enrichment: { domain: string; context_text: string; task_groupings: { label: string }[] },
): string {
  return tokenize([
    input.title, enrichment.domain, enrichment.context_text,
    ...enrichment.task_groupings.map(group => group.label),
    ...input.tasks.map(task => task.text),
  ].join("\n")).join(" ");
}
