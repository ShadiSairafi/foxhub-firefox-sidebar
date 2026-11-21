"""FoxHub E2E test infrastructure library."""

from __future__ import annotations

import importlib
from typing import Any

__all__ = [
    "FixtureServer",
    "FirefoxHarness",
    "FirefoxHarnessError",
    "HeadlessFirefox",
    "LintFinding",
    "MarionetteClient",
    "MarionetteError",
    "get_child_pids",
    "lint_extension",
]

_LAZY_IMPORTS: dict[str, tuple[str, str]] = {
    "LintFinding": (".amo_lint", "LintFinding"),
    "lint_extension": (".amo_lint", "lint_extension"),
    "FirefoxHarness": (".firefox_harness", "FirefoxHarness"),
    "FirefoxHarnessError": (".firefox_harness", "FirefoxHarnessError"),
    "HeadlessFirefox": (".firefox_harness", "HeadlessFirefox"),
    "MarionetteClient": (".firefox_harness", "MarionetteClient"),
    "MarionetteError": (".firefox_harness", "MarionetteError"),
    "get_child_pids": (".firefox_harness", "get_child_pids"),
    "FixtureServer": (".http_fixtures", "FixtureServer"),
}


def __getattr__(name: str) -> Any:
    if name in _LAZY_IMPORTS:
        mod_name, attr_name = _LAZY_IMPORTS[name]
        mod = importlib.import_module(mod_name, __name__)
        val = getattr(mod, attr_name)
        globals()[name] = val
        return val
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
