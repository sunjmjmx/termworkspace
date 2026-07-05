const path = require('path');
const fs = require('fs-extra');

const src = 'node_modules/electron/dist';
const dest = 'build/electron-dist-flattened';

async function main() {
  // 1. Clean and copy the entire Electron.app structure
  await fs.remove(dest);
  console.log('Copying Electron.app to flatten dir...');
  await fs.copy(src, dest);

  // 2. Flatten symlinks in the copy
  async function flattenSymlinks(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        const target = await fs.readlink(fullPath);
        const resolved = path.resolve(path.dirname(fullPath), target);
        try {
          const stat = await fs.stat(resolved);
          if (stat) {
            await fs.remove(fullPath);
            await fs.copy(resolved, fullPath);
            // console.log('Flattened:', path.relative(dest, fullPath));
          }
        } catch (e) {
          // dangling symlink - skip
        }
      } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
        await flattenSymlinks(fullPath);
      }
    }
  }

  await flattenSymlinks(dest);

  // 3. Verify
  const topLevel = path.join(dest, 'Electron.app');
  const frameworksDir = path.join(topLevel, 'Contents/Frameworks/Electron Framework.framework/Versions');
  const versEntries = await fs.readdir(frameworksDir, { withFileTypes: true });
  const remainingLinks = versEntries.filter(e => e.isSymbolicLink());
  console.log('Remaining symlinks in Versions/:', remainingLinks.length);
  console.log('Done! Flattened Electron.app at:', dest);
}

main().catch(e => { console.error(e); process.exit(1); });
