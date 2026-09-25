import { defineConfig } from 'tsdown'

const PACKAGE_ID = 'dsh-jev-compaction'

const neverBundle = [
  /^node:/,
  /^@deepseek-ai\//,
  'react',
  'react/jsx-runtime',
  'react-dom',
]

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    platform: 'node',
    outDir: 'lib',
    clean: true,
    dts: false,
    sourcemap: false,
    deps: { neverBundle },
    outputOptions: { entryFileNames: 'index.js' },
  },
  {
    entry: { 'backend/index': 'src/backend/index.ts' },
    format: ['esm'],
    platform: 'node',
    outDir: 'lib',
    clean: false,
    dts: false,
    sourcemap: false,
    deps: { neverBundle },
    outputOptions: { entryFileNames: 'backend/index.js' },
  },
  {
    entry: { client: 'src/client/index.tsx' },
    format: ['cjs'],
    platform: 'browser',
    outDir: 'lib',
    clean: false,
    dts: false,
    sourcemap: true,
    deps: {
      neverBundle: ['react', 'react/jsx-runtime', 'react-dom'],
      // Bundle @yadsh kit into the client so the host need not resolve it.
      alwaysBundle: (id: string) =>
        id === '@yadsh/dsh-plugin-kit' ||
        id.startsWith('@yadsh/dsh-plugin-kit/') ||
        (!id.startsWith('@deepseek-ai/') &&
          id !== 'react' &&
          id !== 'react/jsx-runtime' &&
          id !== 'react-dom'),
    },
    outputOptions: {
      entryFileNames: 'client.js',
      format: 'cjs',
      exports: 'named',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PACKAGE_ID)}, factory: (require) => {`,
      footer: 'return module.exports;\n} });',
      intro: 'var module = { exports: {} };\nvar exports = module.exports;',
    },
  },
])
