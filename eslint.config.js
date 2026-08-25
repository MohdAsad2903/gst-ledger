import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  // Layering Rule 1: packages/core pure rules
  {
    files: ['packages/core/src/**/*.{ts,tsx,js,jsx}'],
    ignores: ['packages/core/src/**/*.test.ts', 'packages/core/src/**/*.spec.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'fs',
              message: 'Forbidden import: packages/core must not import Node built-in "fs".',
            },
            {
              name: 'node:fs',
              message: 'Forbidden import: packages/core must not import Node built-in "node:fs".',
            },
            {
              name: 'path',
              message: 'Forbidden import: packages/core must not import Node built-in "path".',
            },
            {
              name: 'node:path',
              message: 'Forbidden import: packages/core must not import Node built-in "node:path".',
            },
            {
              name: 'os',
              message: 'Forbidden import: packages/core must not import Node built-in "os".',
            },
            {
              name: 'node:os',
              message: 'Forbidden import: packages/core must not import Node built-in "node:os".',
            },
            {
              name: 'crypto',
              message: 'Forbidden import: packages/core must not import Node built-in "crypto".',
            },
            {
              name: 'node:crypto',
              message:
                'Forbidden import: packages/core must not import Node built-in "node:crypto".',
            },
            {
              name: 'child_process',
              message:
                'Forbidden import: packages/core must not import Node built-in "child_process".',
            },
            {
              name: 'node:child_process',
              message:
                'Forbidden import: packages/core must not import Node built-in "node:child_process".',
            },
            {
              name: 'http',
              message: 'Forbidden import: packages/core must not import Node built-in "http".',
            },
            {
              name: 'node:http',
              message: 'Forbidden import: packages/core must not import Node built-in "node:http".',
            },
            {
              name: 'https',
              message: 'Forbidden import: packages/core must not import Node built-in "https".',
            },
            {
              name: 'node:https',
              message:
                'Forbidden import: packages/core must not import Node built-in "node:https".',
            },
            {
              name: 'events',
              message: 'Forbidden import: packages/core must not import Node built-in "events".',
            },
            {
              name: 'node:events',
              message:
                'Forbidden import: packages/core must not import Node built-in "node:events".',
            },
            {
              name: 'stream',
              message: 'Forbidden import: packages/core must not import Node built-in "stream".',
            },
            {
              name: 'node:stream',
              message:
                'Forbidden import: packages/core must not import Node built-in "node:stream".',
            },
            {
              name: 'util',
              message: 'Forbidden import: packages/core must not import Node built-in "util".',
            },
            {
              name: 'node:util',
              message: 'Forbidden import: packages/core must not import Node built-in "node:util".',
            },
            {
              name: 'electron',
              message: 'Forbidden import: packages/core must not import Electron.',
            },
            {
              name: 'better-sqlite3',
              message: 'Forbidden import: packages/core must not import database libraries.',
            },
            { name: 'react', message: 'Forbidden import: packages/core must not import React.' },
            {
              name: 'react-dom',
              message: 'Forbidden import: packages/core must not import ReactDOM.',
            },
            {
              name: '@gst/data',
              message: 'Forbidden import: packages/core must not import @gst/data.',
            },
            {
              name: '@gst/app',
              message: 'Forbidden import: packages/core must not import @gst/app.',
            },
            {
              name: '@gst/ui',
              message: 'Forbidden import: packages/core must not import @gst/ui.',
            },
          ],
          patterns: [
            {
              group: ['node:*'],
              message: 'Forbidden import: packages/core must not import Node built-ins (node:*).',
            },
            {
              group: ['@gst/data*', '@gst/app*', '@gst/ui*'],
              message: 'Forbidden import: packages/core must not import from other layers.',
            },
            {
              group: ['../*', '../../*'],
              message: 'Forbidden import: packages/core must not import outside its own directory.',
            },
          ],
        },
      ],
    },
  },
  // Layering Rule 2: packages/ui must not import packages/data or packages/app
  {
    files: ['packages/ui/src/**/*.{ts,tsx,js,jsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@gst/data',
              message: 'Forbidden import: UI layer must not import from data layer (@gst/data).',
            },
            {
              name: '@gst/app',
              message: 'Forbidden import: UI layer must not import from app layer (@gst/app).',
            },
          ],
          patterns: [
            {
              group: [
                '@gst/data*',
                '@gst/app*',
                '**/packages/data/**',
                '**/packages/app/**',
                '../../data/**',
                '../../app/**',
                '../data/**',
                '../app/**',
              ],
              message: 'Forbidden import: UI layer must not import from data or app layer.',
            },
          ],
        },
      ],
    },
  },
  // Layering Rule 3: packages/data must not import packages/app or packages/ui
  {
    files: ['packages/data/src/**/*.{ts,tsx,js,jsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@gst/app',
              message: 'Forbidden import: Data layer must not import from app layer (@gst/app).',
            },
            {
              name: '@gst/ui',
              message: 'Forbidden import: Data layer must not import from ui layer (@gst/ui).',
            },
          ],
          patterns: [
            {
              group: [
                '@gst/app*',
                '@gst/ui*',
                '**/packages/app/**',
                '**/packages/ui/**',
                '../../app/**',
                '../../ui/**',
                '../app/**',
                '../ui/**',
              ],
              message: 'Forbidden import: Data layer must not import from app or ui layer.',
            },
          ],
        },
      ],
    },
  },
  // Layering Rule 4: packages/app must not import packages/ui
  {
    files: ['packages/app/src/**/*.{ts,tsx,js,jsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@gst/ui',
              message: 'Forbidden import: App layer must not import from ui layer (@gst/ui).',
            },
          ],
          patterns: [
            {
              group: ['@gst/ui*', '**/packages/ui/**', '../../ui/**', '../ui/**'],
              message: 'Forbidden import: App layer must not import from ui layer.',
            },
          ],
        },
      ],
    },
  },
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/dist-electron/**',
      '**/release/**',
      '**/coverage/**',
      '**/*.d.ts',
      'scripts/**',
    ],
  },
);
