/**
 * Tag suggestions — the pool a user can pick from when tagging a project:
 * tags already used elsewhere (with their chosen colors) plus a curated set of
 * sensible defaults for a music-production workflow.
 */

export interface TagSuggestion {
  name: string;  // Title Case display name
  color: string; // hex accent color
}

/** Curated starter tags, colored to match the ColorPalette presets. */
export const DEFAULT_TAGS: TagSuggestion[] = [
  { name: 'Idea', color: '#eab308' },
  { name: 'Demo', color: '#06b6d4' },
  { name: 'Rough Mix', color: '#007bff' },
  { name: 'Final Mix', color: '#22c55e' },
  { name: 'Mastered', color: '#8b5cf6' },
  { name: 'Reference', color: '#ec4899' },
  { name: 'Bounce', color: '#ef4444' },
  { name: 'Vocals', color: '#f97316' },
];

const DEFAULT_TAG_COLOR = '#007bff';

/**
 * Merge the user's existing tags with the default presets into a single,
 * deduped suggestion list. Existing tags come first (alphabetical) and keep
 * their saved color; defaults fill in behind them, skipping any that already
 * exist (case-insensitive).
 */
export function buildTagSuggestions(
  existingTags: string[],
  tagColors: Record<string, string>
): TagSuggestion[] {
  const seen = new Set<string>();
  const out: TagSuggestion[] = [];

  const uniqueExisting = Array.from(
    new Set(existingTags.map(t => t.trim()).filter(Boolean))
  ).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

  for (const name of uniqueExisting) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, color: tagColors[name] || DEFAULT_TAG_COLOR });
  }

  for (const preset of DEFAULT_TAGS) {
    const key = preset.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(preset);
  }

  return out;
}
