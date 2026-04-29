import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Pin Turbopack's workspace root to this repo. Otherwise Next walks
  // up the filesystem looking for lockfiles and can pick the wrong
  // ancestor directory (e.g., a stray bun.lockb in $HOME), which breaks
  // dependency resolution on some machines.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
