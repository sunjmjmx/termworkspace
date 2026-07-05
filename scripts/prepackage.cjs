const path = require('path');
const fs = require('fs-extra');

const ELECTRON_SRC = 'node_modules/electron/dist';
const FLATTENED_DEST = 'build/electron-dist-flattened';

/**
 * Verify that the flattened Electron.app cache is intact by checking
 * key files that must exist. Prevents stale-marker corruption (e.g.
 * from interrupted builds or residual files where only the marker
 * survived but the actual app is broken).
 */
async function verifyIntegrity(electronApp) {
  if (!await fs.pathExists(electronApp)) return false;

  const checks = [
    {
      name: 'Electron.app/Contents/MacOS/Electron',
      path: path.join(electronApp, 'Contents', 'MacOS', 'Electron')
    },
    {
      name: 'Electron.app/Contents/Frameworks/Electron Framework.framework/Electron Framework',
      path: path.join(electronApp, 'Contents', 'Frameworks', 'Electron Framework.framework', 'Electron Framework')
    }
  ];

  // Need at least one Helper.app
  const frameworksDir = path.join(electronApp, 'Contents', 'Frameworks');
  let hasHelper = false;
  if (await fs.pathExists(frameworksDir)) {
    const entries = await fs.readdir(frameworksDir, { withFileTypes: true });
    hasHelper = entries.some(e => e.isDirectory() && e.name.includes('Helper') && e.name.endsWith('.app'));
  }

  for (const check of checks) {
    if (!await fs.pathExists(check.path)) {
      console.error('  ✗ Missing:', check.name);
      return false;
    }
  }

  if (!hasHelper) {
    console.error('  ✗ Missing: at least one Helper.app in Frameworks/');
    return false;
  }

  return true;
}

async function main() {
  const markerFile = path.join(FLATTENED_DEST, '.flattened');
  const versionFile = path.join(ELECTRON_SRC, 'version');

  let needRefresh = true;
  try {
    if (await fs.pathExists(markerFile) && await fs.pathExists(versionFile)) {
      const markerVersion = (await fs.readFile(markerFile, 'utf-8')).trim();
      const currentVersion = (await fs.readFile(versionFile, 'utf-8')).trim();
      needRefresh = markerVersion !== currentVersion;
    }
  } catch (_) {
    needRefresh = true;
  }

  if (!needRefresh) {
    // Marker matches — also verify cache integrity
    const electronApp = path.join(FLATTENED_DEST, 'Electron.app');
    if (await verifyIntegrity(electronApp)) {
      console.log('✓ Flattened Electron.app is up-to-date');
      return;
    }
    // Cache is corrupted — invalidate marker and force rebuild
    console.error('⚠ Cache integrity check failed — corrupted Electron dist detected');
    console.error('  Cleaning up and rebuilding...');
    needRefresh = true;
  }

  if (!await fs.pathExists(path.join(ELECTRON_SRC, 'Electron.app'))) {
    console.error('✗ Electron source not found at', ELECTRON_SRC);
    process.exit(1);
  }

  console.log('Copying Electron.app to flatten dir...');
  await fs.remove(FLATTENED_DEST);
  // Use copy with filter to skip symlinks - we'll handle them manually
  await fs.copy(ELECTRON_SRC, FLATTENED_DEST);

  const electronApp = path.join(FLATTENED_DEST, 'Electron.app');
  const contentsDir = path.join(electronApp, 'Contents');
  const frameworksDir = path.join(contentsDir, 'Frameworks');

  /**
   * Strategy:
   *
   * Electron framework symlinks come in two types:
   *   TYPE A: Framework top-level (Electron Framework -> Versions/Current/Electron Framework)
   *           These depend on Versions/Current -> A existing
   *   TYPE B: Versions/Current -> A
   *           Shallow, no parent dependency
   *
   * The bug: copyAppFiles creates TYPE A and TYPE B symlinks in parallel.
   * TYPE A fails because the path Versions/Current/... can't resolve when
   * TYPE B hasn't been created yet.
   *
   * Solution: Flatten TYPE A symlinks (replace with hard copies), keep TYPE B
   * as symlinks. Since TYPE A no longer need TYPE B to resolve, and TYPE B
   * is the only remaining symlink (no dependencies), the bug doesn't trigger.
   */

  async function flattenFrameworkSymlinks(frameworksDir) {
    if (!await fs.pathExists(frameworksDir)) return;

    const entries = await fs.readdir(frameworksDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.endsWith('.framework')) continue;

      const frameworkPath = path.join(frameworksDir, entry.name);
      const sourceFrameworkPath = path.join(ELECTRON_SRC, 'Electron.app/Contents/Frameworks', entry.name);

      // Step 1: Read original symlink targets from source
      const sourceEntries = await fs.readdir(sourceFrameworkPath, { withFileTypes: true });
      const originalLinks = [];
      for (const se of sourceEntries) {
        if (se.isSymbolicLink()) {
          const target = await fs.readlink(path.join(sourceFrameworkPath, se.name));
          originalLinks.push({ name: se.name, target });
        }
      }

      // Step 2: Remove current (copied) path and re-create top-level symlinks
      // that DON'T reference Versions/Current/... from the source, and flatten
      // the ones that DO.
      for (const link of originalLinks) {
        const fullPath = path.join(frameworkPath, link.name);

        // Skip Versions/Current -> A - keep as symlink
        if (link.name === 'Versions' || link.name.startsWith('.')) continue;

        // Check if this symlink references Versions/Current/...
        if (link.target.startsWith('Versions/Current/')) {
          // TYPE A: Flatten - replace with hard copy
          await fs.remove(fullPath);
          const resolvedTarget = path.resolve(path.join(frameworkPath, link.target));
          try {
            await fs.copy(resolvedTarget, fullPath);
            console.log('  Flattened:', entry.name + '/' + link.name);
          } catch (e) {
            console.log('  Failed to flatten', link.name, ':', e.message);
          }
        } else {
          // Other symlink - recreate from source
          await fs.remove(fullPath);
          await fs.symlink(link.target, fullPath);
          console.log('  Kept symlink:', entry.name + '/' + link.name, '->', link.target);
        }
      }

      // Step 3: Re-create Versions/Current -> A symlink (was copied as dir)
      const versionsDir = path.join(frameworkPath, 'Versions');
      if (await fs.pathExists(versionsDir)) {
        const sourceVersionsDir = path.join(sourceFrameworkPath, 'Versions');
        const sourceVersionsEntries = await fs.readdir(sourceVersionsDir, { withFileTypes: true });
        for (const ve of sourceVersionsEntries) {
          if (ve.isSymbolicLink()) {
            const destPath = path.join(versionsDir, ve.name);
            await fs.remove(destPath);
            const target = await fs.readlink(path.join(sourceVersionsDir, ve.name));
            await fs.symlink(target, destPath);
            console.log('  Created symlink:', entry.name + '/Versions/' + ve.name, '->', target);
          }
        }
      }
    }
  }

  console.log('Optimizing framework symlinks...');
  await flattenFrameworkSymlinks(frameworksDir);

  // Verify: count remaining symlinks
  let symlinkCount = 0;
  let symlinkNames = [];
  async function countSymlinks(dir) {
    if (!await fs.pathExists(dir)) return;
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        const target = await fs.readlink(fullPath);
        symlinkCount++;
        symlinkNames.push(path.relative(FLATTENED_DEST, fullPath) + ' -> ' + target);
      } else if (entry.isDirectory() && !entry.name.startsWith('.')) {
        await countSymlinks(fullPath);
      }
    }
  }
  await countSymlinks(electronApp);
  console.log('Remaining symlinks:', symlinkCount);
  symlinkNames.forEach(s => console.log('  ' + s));

  // Write marker
  const version = await fs.readFile(versionFile, 'utf-8');
  await fs.writeFile(markerFile, version.trim());

  const { execSync } = require('child_process');
  const appSize = execSync(`du -sh "${electronApp}"`, { encoding: 'utf-8' }).trim();
  console.log('✓ Flattened Electron.app size:', appSize);
  console.log('✓ Ready at', FLATTENED_DEST);
}

main().catch(e => { console.error(e); process.exit(1); });
