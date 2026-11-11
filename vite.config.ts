import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type Plugin } from 'vite';

const bunPlatformUpgradeFix: Plugin = {
  name: 'toolsmith-console-bun-platform-upgrade-fix',
  apply: 'serve',
  enforce: 'post',
  transform(code, id, options) {
    if (
      !options?.ssr ||
      !id.split('?')[0].endsWith('/@sveltejs/kit/src/runtime/server/respond.js') ||
      code.includes('state.emulator.platform({ request: event.request,')
    ) {
      return;
    }

    return code.replaceAll(
      'state.emulator.platform({',
      'state.emulator.platform({ request: event.request,',
    );
  },
};

export default defineConfig({ plugins: [sveltekit(), bunPlatformUpgradeFix] });
