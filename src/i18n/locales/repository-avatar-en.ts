import type zh from './repository-avatar-zh-CN';
import type { LocaleResource } from '../types';
export default {
  title: 'Repository avatar',
  configure: 'Set repository avatar',
  configureHelp:
    'Choose this project’s logo from its repository to use on the board, in repository lists and in details. Only the relative image path is saved; repository files and Git history stay unchanged. You can also restore the default icon.',
  preview: 'Avatar preview for {{name}}',
  default: 'Default repository icon',
  reset: 'Restore default icon',
  help: 'Choose an SVG, PNG, JPEG, WebP, GIF or ICO from this repository, up to 1 MiB. The same repository shares its avatar across all workflows.',
  browse: 'Browse repository images',
  root: 'Repository root',
  parent: 'Parent directory',
  openDirectory: 'Open directory {{name}}',
  selectImage: 'Select image {{name}}',
  empty: 'No supported images or subdirectories in this directory.',
  decodeError: 'This image cannot be displayed. Choose a valid project icon.',
  previous: 'Previous page',
  next: 'Next page',
  apply: 'Use this avatar',
  example: 'Repository avatar examples',
  exampleHelp:
    'The same component shows the default icon, a project logo and a fallback for an unavailable image. Click the title icon to switch the local example without reading a repository.',
} satisfies LocaleResource<typeof zh>;
