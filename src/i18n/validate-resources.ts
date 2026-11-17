type Group = { simple?: string; forms: Record<string, string> };
function groupResource(
  value: Record<string, unknown>,
  prefix = '',
  groups = new Map<string, Group>(),
) {
  for (const [key, text] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (text && typeof text === 'object')
      groupResource(text as Record<string, unknown>, path, groups);
    else if (typeof text === 'string') {
      const plural = path.match(/^(.*)_(zero|one|two|few|many|other)$/);
      const name = plural?.[1] || path;
      const group = groups.get(name) || { forms: {} };
      if (plural) group.forms[plural[2]] = text;
      else group.simple = text;
      groups.set(name, group);
    }
  }
  return groups;
}
const parameters = (text: string, plural: boolean) =>
  [
    ...new Set(
      [...text.matchAll(/{{-?\s*(\w+)(?:\s*,[^}]+)?\s*}}/g)]
        .map((match) => match[1])
        .filter((key) => !plural || key !== 'count'),
    ),
  ]
    .sort()
    .join(',');

export function validateLocaleResource(
  base: Record<string, unknown>,
  candidate: Record<string, unknown>,
  locale: string,
): string[] {
  const source = groupResource(base);
  const translated = groupResource(candidate);
  const issues: string[] = [];
  const categories = new Intl.PluralRules(locale).resolvedOptions().pluralCategories;
  for (const name of new Set([...source.keys(), ...translated.keys()])) {
    const original = source.get(name);
    const group = translated.get(name);
    if (!original || !group) {
      issues.push(`${locale}: missing or extra key ${name}`);
      continue;
    }
    const plural = Object.keys(original.forms).length > 0;
    if (plural) {
      if (group.simple !== undefined) issues.push(`${locale}: ${name} needs plural forms`);
      for (const category of categories)
        if (group.forms[category] === undefined)
          issues.push(`${locale}: missing ${name}_${category}`);
    } else if (group.simple === undefined || Object.keys(group.forms).length > 0)
      issues.push(`${locale}: ${name} must be a simple message`);
    const expected = original.simple ?? original.forms.other;
    for (const text of [group.simple, ...Object.values(group.forms)]) {
      if (text === undefined) continue;
      if (!text.trim()) issues.push(`${locale}: empty ${name}`);
      if (parameters(text, plural) !== parameters(expected, plural))
        issues.push(`${locale}: mismatched parameters in ${name}`);
    }
  }
  return issues;
}
