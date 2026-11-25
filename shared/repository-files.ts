import { z } from 'zod';

export const textEditLimit = 96 * 1024;
const containsControl = (value: string) =>
  [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
export const isRepositoryTextPath = (value: string) =>
  value.length <= 400 &&
  value
    .split('/')
    .every(
      (part) =>
        !!part &&
        part !== '.' &&
        part !== '..' &&
        part.trim() === part &&
        !containsControl(part) &&
        !/[\\<>:"|?*\u202a-\u202e\u2066-\u2069]|[.]$|~\d/i.test(part) &&
        !/^(?:\.git|\.megit|\.ssh|\.gnupg|node_modules|con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(?:\.|$)/i.test(
          part,
        ) &&
        !/(?:^|[._-])(?:env|secrets?|credentials?|passwords?|tokens?|id_rsa|id_ed25519)(?:[._-]|$)/i.test(
          part,
        ),
    ) &&
  /(?:^|\/)(?:Dockerfile|Makefile|README|LICENSE|\.gitignore|\.gitattributes|\.editorconfig|[^/]+\.(?:txt|md|mdx|rst|jsonc?|toml|ya?ml|xml|ini|lock|ps1|sh|cmd|bat|[cm]?js|jsx|ts|tsx|vue|svelte|css|scss|html|svg|py|go|rs|java|cs|sql|c|cpp|h))$/i.test(
    value,
  );

export const repositoryTextPathSchema = z.string().refine(isRepositoryTextPath);
const pointerSchema = z
  .string()
  .max(400)
  .regex(/^(?:\/(?:[^~/]|~[01])*)+$/)
  .refine((pointer) => !containsControl(pointer));
const jsonTargetSchema = z.strictObject({
  kind: z.literal('json'),
  path: repositoryTextPathSchema.refine((name) => /\.json$/i.test(name)),
  pointer: pointerSchema,
});
const npmTargetSchema = z.strictObject({ kind: z.literal('npm') });
export const repositoryShortcutTargetSchema = z.discriminatedUnion('kind', [
  jsonTargetSchema,
  npmTargetSchema,
]);
export const repositoryEditTargetSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('text'), path: repositoryTextPathSchema }),
  jsonTargetSchema,
  npmTargetSchema,
]);
export const repositoryShortcutSchema = z
  .strictObject({
    label: z.string().trim().min(1).max(40).optional(),
    target: repositoryShortcutTargetSchema,
  })
  .refine((shortcut) => shortcut.target.kind === 'npm' || !!shortcut.label);
const fingerprint = z.string().regex(/^[0-9a-f]{64}$/);
export const repositoryEditRequestSchema = z.strictObject({
  target: repositoryEditTargetSchema,
  revision: fingerprint,
  value: z.string().max(textEditLimit),
});
export const repositoryEditSaveSchema = repositoryEditRequestSchema.extend({
  approval: fingerprint,
});
export type RepositoryShortcut = z.infer<typeof repositoryShortcutSchema>;
export type RepositoryEditTarget = z.infer<typeof repositoryEditTargetSchema>;
export type RepositoryEditRequest = z.infer<typeof repositoryEditRequestSchema>;
export type RepositoryEditSnapshot = {
  revision: string;
  value: string;
  valueType: 'string' | 'number' | 'boolean' | 'null';
  branch: string;
};
export type RepositoryEditPreview = {
  approval: string;
  files: { path: string; patch: string }[];
};
