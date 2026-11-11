import { createServer } from 'node:net';
import { patchSveltekit, startDevServer } from '@eslym/sveltekit-adapter-bun/dev';

async function isPortAvailable(port: number, host: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') resolve(false);
      else reject(error);
    });
    server.listen(port, host, () => {
      server.close((error) => error ? reject(error) : resolve(true));
    });
  });
}

await patchSveltekit();
const host = process.env.HOST || '0.0.0.0';
const startPort = Number.parseInt(process.env.PORT || '5173', 10);
let port = startPort;

while (port <= 65535 && !(await isPortAvailable(port, host))) {
  console.warn(`Port ${port} is already in use; trying ${port + 1}...`);
  port += 1;
}

if (port > 65535) throw new Error(`No available port found starting from ${startPort}`);
console.log(`Starting Toolsmith Console dev server on http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
await startDevServer({ host, port });
