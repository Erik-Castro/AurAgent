export function parseToolArguments(raw: unknown): Record<string, unknown> {
  if (raw === null || raw === undefined) return {};
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed === '') return {};
    const parsed = JSON.parse(trimmed);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('tool arguments JSON must be an object');
    }
    return parsed as Record<string, unknown>;
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  throw new Error('tool arguments must be object or JSON string');
}
