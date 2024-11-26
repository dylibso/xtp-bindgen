const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const fileContentPlugin = (filePath) => ({
  name: 'file-content',
  setup(build) {
    build.onResolve({ filter: /BUILTIN_JSON_SCHEMA$/ }, args => ({
      path: args.path,
      namespace: 'file-content'
    }));

    build.onLoad({ filter: /.*/, namespace: 'file-content' }, () => {
      const content = fs.readFileSync(filePath, 'utf8');
      return {
        contents: `export default ${content}`,
        loader: 'js'
      };
    });
  }
});

esbuild
  .build({
    entryPoints: ['src/index.ts'],
    outdir: 'dist',
    bundle: true,
    sourcemap: true,
    minify: false, // might want to use true for production build
    format: 'cjs', // needs to be CJS for now
    target: ['es2020'], // don't go over es2020 because quickjs doesn't support it
    plugins: [fileContentPlugin(path.resolve(__dirname, 'schema.json'))],
    define: {
      'BUILTIN_JSON_SCHEMA': 'BUILTIN_JSON_SCHEMA'
    }
  })
  .catch((error) => {
    console.error('Build failed:', error);
    process.exit(1);
  });