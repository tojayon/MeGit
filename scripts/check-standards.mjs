import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

async function files(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const result = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory()
        ? files(path.join(directory, entry.name))
        : path.join(directory, entry.name),
    ),
  );
  return result.flat();
}
export async function checkStandards(
  root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
) {
  const issues = [];
  const themeSource = await fs.readFile(path.join(root, 'src/themes.css'), 'utf8');
  const sharedTokens = await fs.readFile(path.join(root, 'src/tokens.css'), 'utf8');
  const themeBlocks = [...themeSource.matchAll(/:root\[data-theme='(dark|light)'\]\s*{([^}]+)}/g)];
  const sets = themeBlocks.map(
    ([, , body]) => new Set([...body.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1])),
  );
  if (
    themeBlocks.length !== 2 ||
    sets[0]?.size !== sets[1]?.size ||
    [...(sets[0] || [])].some((key) => !sets[1]?.has(key))
  )
    issues.push('Dark and light themes must implement exactly the same tokens.');
  const definitions = new Set(
    [...(themeSource + sharedTokens).matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]),
  );
  for (const filename of await files(path.join(root, 'src'))) {
    if (
      !/\.(tsx?|css)$/.test(filename) ||
      filename === path.join(root, 'src/themes.css') ||
      filename.startsWith(path.join(root, 'src/i18n') + path.sep)
    )
      continue;
    const source = await fs.readFile(filename, 'utf8');
    const name = path.relative(root, filename).replaceAll('\\', '/');
    if (/[\u4e00-\u9fff]/.test(source)) issues.push(`${name}: move UI text into locale resources.`);
    if (/#[\da-f]{3,8}\b|rgba?\(|hsla?\(/i.test(source))
      issues.push(`${name}: use a semantic theme token for colors.`);
    if (filename.endsWith('.css')) {
      const locals = new Set([...source.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]));
      for (const [, token] of source.matchAll(/var\((--[\w-]+)/g))
        if (!definitions.has(token) && !locals.has(token))
          issues.push(`${name}: undefined token ${token}.`);
      if (/content:\s*['"][^'"]*[A-Za-z][^'"]*['"]/.test(source))
        issues.push(`${name}: keep translated text out of CSS content.`);
    }
    if (!filename.endsWith('.tsx')) continue;
    const ast = ts.createSourceFile(
      filename,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    function visit(node) {
      if (
        ts.isJsxText(node) &&
        /[A-Za-z]{2}|[\u4e00-\u9fff]/.test(node.getText(ast).trim()) &&
        !['MeGit'].includes(node.getText(ast).trim())
      )
        issues.push(
          `${name}:${ast.getLineAndCharacterOfPosition(node.pos).line + 1}: translate visible JSX text.`,
        );
      if (
        ts.isJsxAttribute(node) &&
        ts.isStringLiteral(node.initializer || {}) &&
        /^(aria-label|title|placeholder|alt)$/.test(node.name.getText(ast)) &&
        /[A-Za-z]{2}/.test(node.initializer.text) &&
        !/^D:\\/.test(node.initializer.text)
      )
        issues.push(`${name}: translate ${node.name.getText(ast)}.`);
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
  return [...new Set(issues)];
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const issues = await checkStandards();
  if (issues.length) {
    console.error(issues.join('\n'));
    process.exitCode = 1;
  } else console.log('Theme and i18n source standards passed.');
}
