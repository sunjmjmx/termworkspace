/**
 * Runtime monkey-patch for electron-builder 25.x parallel ensureSymlink bug.
 *
 * Bug: copyAppFiles creates macOS framework symlinks in parallel via
 * bluebird.map with concurrency. When a deep symlink's parent path
 * involves another symlink (e.g., Versions/Current -> A) that hasn't
 * been created yet, fs.symlink gets ENOENT because it can't resolve
 * the parent directory chain.
 *
 * Fix: if ensureSymlink fails with ENOENT, create the parent directory
 * (as a real dir) and retry. The parent symlink will either overwrite
 * it later (via symlink syscall replacing the dir) or ensureSymlink
 * catches EEXIST and returns silently.
 *
 * Note: A few framework Version paths end up as real directories instead
 * of symlinks, but the top-level framework symlinks (Electron Framework -> ...,
 * Resources -> ..., etc.) still resolve correctly because their targets
 * are relative paths that work whether Versions/Current is a dir or symlink.
 */
const fs = require('fs-extra');
const path = require('path');

const origEnsureSymlink = fs.ensureSymlink.bind(fs);

fs.ensureSymlink = async function (src, dest) {
  try {
    return await origEnsureSymlink(src, dest);
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      // Parent directory chain couldn't be resolved (bug: parallel symlink creation).
      // Create parent as a real directory and retry.
      try {
        await fs.mkdirp(path.dirname(dest));
      } catch (_) {
        // Race: another parallel task might have created it already
      }
      return await origEnsureSymlink(src, dest);
    }
    throw err;
  }
};
