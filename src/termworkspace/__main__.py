"""TermWorkspace — CLI entry point.

Usage:
    termworkspace [--config PATH] [--verbose]
    termworkspace --help

Run the TermWorkspace TUI application.
"""

import argparse
import sys


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="termworkspace",
        description="Terminal-native multi-model AI workspace. Bring your own API keys.",
        epilog="Configuration: ~/.termworkspace/config.yaml",
    )
    parser.add_argument(
        "--config",
        "-c",
        metavar="PATH",
        help="Path to config file (default: ~/.termworkspace/config.yaml)",
    )
    parser.add_argument(
        "--verbose",
        "-v",
        action="store_true",
        help="Enable verbose logging",
    )
    parser.add_argument(
        "--version",
        action="store_true",
        help="Show version and exit",
    )
    parser.add_argument(
        "--init",
        action="store_true",
        help="Run the interactive configuration wizard to set up API keys",
    )
    return parser


def main() -> None:
    """Parse arguments and launch the TUI."""
    parser = build_parser()
    args, _ = parser.parse_known_args()

    if args.version:
        from termworkspace import __version__

        print(f"termworkspace {__version__}")
        sys.exit(0)

    if args.config:
        import os

        os.environ["TERMWORKSPACE_CONFIG"] = args.config

    if args.verbose:
        import logging

        logging.basicConfig(level=logging.DEBUG)

    if args.init:
        from termworkspace.config import ConfigManager

        ConfigManager.init_wizard()
        sys.exit(0)

    # Defer heavy imports to keep --help snappy
    from termworkspace.app import main as app_main

    app_main()


if __name__ == "__main__":
    main()
