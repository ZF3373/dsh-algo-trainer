import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    'index': 'src/index.ts',
    'client': 'client/index.ts',
  },
  format: 'esm',
  dts: false,
  outDir: 'lib',
  platform: 'node',
  target: 'es2022',
  deps: {
    neverBundle: [
      '@deepseek-ai/cordis',
      '@deepseek-ai/dsh-tools',
      '@deepseek-ai/schemastery',
      'react',
      'react-dom',
      'react/jsx-runtime',
    ],
  },
})
