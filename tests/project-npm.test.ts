import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveProjectNpm } from '../server/windows-local-service.js';

const backend = String.raw`C:\MeGit\backend\node.exe`;
const project = String.raw`C:\Programs\Node.js\node.exe`;
const cli = (executable: string) =>
  path.win32.join(path.win32.dirname(executable), 'node_modules', 'npm', 'bin', 'npm-cli.js');
const installed = new Set([backend, cli(backend), project, cli(project)]);

describe('repository npm runtime', () => {
  it('keeps the existing web server runtime for browser users', () => {
    expect(resolveProjectNpm({ backend, file: (value) => installed.has(value) })).toEqual({
      executable: backend,
      cli: cli(backend),
    });
  });

  it('uses the project runtime instead of the bundled Node in desktop mode', () => {
    expect(
      resolveProjectNpm({
        backend,
        desktop: true,
        searchPath: String.raw`C:\MeGit\backend;.;"C:\Programs\Node.js"`,
        file: (value) => installed.has(value),
      }),
    ).toEqual({ executable: project, cli: cli(project) });
  });

  it('rejects incomplete or relative locations without falling back to bundled npm', () => {
    expect(
      resolveProjectNpm({
        backend,
        desktop: true,
        searchPath: String.raw`.;C:\MeGit\backend;C:\Programs\Node.js`,
        file: (value) => value !== cli(project) && installed.has(value),
      }),
    ).toBeUndefined();
  });
});
