import { editorialCuebooks, editorialShelves } from "../../data/editorial-shelves.mjs";

// These are explicit editorial entry points, never matches inferred from a query.
const labels: Record<string, string> = {
  "editorial-shelf-two-cats-home": "猫2匹と暮らしている",
  "editorial-shelf-solo-careful-cooking": "一人暮らしで料理をする",
  "editorial-shelf-solo-camp-meals": "一泊のソロキャンプに行く",
  "editorial-shelf-elementary-school-family": "小学生の子どもがいる",
  "editorial-shelf-home-video-creator": "自宅で動画を撮っている",
};

export type ContextPreset = { id: string; label: string; examples: string[] };

export const contextPresets: ContextPreset[] = Object.entries(labels).map(([id, label]) => {
  const group = editorialShelves.find(item => item.id === id);
  if (!group) throw new Error(`Missing editorial entry: ${id}`);
  return {
    id, label,
    examples: group.cuebook_keys.slice(0, 2).map((key: string) => editorialCuebooks.find(cue => cue.key === key)!.title),
  };
});
