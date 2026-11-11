import adapterBun from '@eslym/sveltekit-adapter-bun';
import adapterStatic from '@sveltejs/adapter-static';

const cloudflare = process.env.TOOLSMITH_CONSOLE_TARGET === 'cloudflare';

export default {
  kit: {
    files: { assets: 'public' },
    // Cloudflare serves the SPA from nested routes too; root-relative assets avoid
    // resolving `./_app/...` under routes such as `/workspace/`.
    paths: { relative: !cloudflare },
    alias: { $features: './src/features' },
    adapter: cloudflare
      ? adapterStatic({ pages: 'dist', assets: 'dist', strict: false })
      : adapterBun({ out: 'build', serveStatic: true, precompress: true, bundler: 'bun' }),
  },
  vitePlugin: {
    dynamicCompileOptions({ filename }) {
      if (filename.includes('node_modules')) return undefined;
      return { runes: true };
    },
  },
};
