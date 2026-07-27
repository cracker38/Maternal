/** Normalize alert recommended_actions (array or AI meta object). */
export function alertActions(raw) {
  if (!raw) return [];
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [raw];
    }
  }
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.actions)) return parsed.actions;
  return [];
}

export function alertExplanation(raw) {
  if (!raw) return null;
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed.explanation || parsed.disclaimer || null;
  }
  return null;
}

export function formatMissing(err) {
  const missing = err?.data?.missing;
  if (Array.isArray(missing) && missing.length) {
    return `${err.message} Missing: ${missing.join(', ')}.`;
  }
  return err.message;
}
