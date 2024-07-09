const esbuild = require('esbuild');

esbuild.build({
  entryPoints: ['src/index.ts'],
  outdir: 'dist',
  bundle: true,
  sourcemap: true,
  format: 'esm',
  target: 'es2020',
  splitting: true,
  preserveSymlinks: true,
  minify: true
}).catch(() => process.exit(1));

