import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { AppError } from './errors.js';
import { repositoryImageExtensions } from '../shared/repository-images.js';

const run = promisify(execFile);
const scripts = {
  folder: `$picker = New-Object System.Windows.Forms.FolderBrowserDialog
    if ($picker.ShowDialog() -eq 'OK') { [Console]::Write($picker.SelectedPath) }`,
  image: `$picker = New-Object System.Windows.Forms.OpenFileDialog
    $picker.InitialDirectory = $env:MEGIT_PICKER_ROOT
    $picker.Filter = 'Images|${repositoryImageExtensions.map((extension) => `*.${extension}`).join(';')}'
    if ($picker.ShowDialog() -eq 'OK') { [Console]::Write($picker.FileName) }`,
};
let active = false;

export async function pickLocal(kind: keyof typeof scripts, root = '') {
  if (process.platform !== 'win32' || active) throw new AppError('localPickerUnavailable', 409);
  active = true;
  try {
    const { stdout } = await run(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-STA',
        '-Command',
        `$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[Text.Encoding]::UTF8; Add-Type -AssemblyName System.Windows.Forms; ${scripts[kind]}`,
      ],
      { windowsHide: true, timeout: 180000, env: { ...process.env, MEGIT_PICKER_ROOT: root } },
    );
    return stdout || null;
  } catch {
    throw new AppError('localPickerUnavailable', 503);
  } finally {
    active = false;
  }
}
