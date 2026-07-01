# typed: true
# frozen_string_literal: true

# TermWorkspace — Homebrew Formula
#
# Install:
#   brew tap termworkspace/tap
#   brew install termworkspace
#
# Or from a local checkout:
#   brew install --formula Formula/termworkspace.rb
#
# Requirements: macOS 12+ or Linux, Python 3.12+

class Termworkspace < Formula
  include Language::Python::Virtualenv

  desc "Terminal-native multi-model AI workspace — bring your own API keys"
  homepage "https://github.com/sunjmjmx/termworkspace"
  url "https://github.com/sunjmjmx/termworkspace/archive/refs/tags/v0.1.0.tar.gz"
  version "0.1.0"
  sha256 "" # Fill on first release: shasum -a 256 v0.1.0.tar.gz
  license "MIT"

  depends_on "python@3.12"

  def install
    # ── Create a virtualenv at libexec ──────────────────────────────
    venv = virtualenv_create(libexec, "python3.12")

    # ── Install TermWorkspace from the unpacked source ──────────────
    # pip resolves all transitive dependencies automatically, so we
    # don't need to maintain resource blocks for every sub-dependency.
    venv.pip_install buildpath

    # ── Symlink the entry point into bin ────────────────────────────
    # Homebrew's virtualenv helper handles this via pip_install, but
    # ensure the entry point script is linked for PATH access.
    bin.install_symlink libexec/"bin/termworkspace"
  end

  test do
    # Verify the CLI produces help output
    assert_match "termworkspace", shell_output("#{bin}/termworkspace --help")
    # Verify version string
    assert_match version.to_s, shell_output("#{bin}/termworkspace --version")
  end
end
