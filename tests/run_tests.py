"""Unified FoxHub E2E & infrastructure test runner (Python 3.12 stdlib)."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
from fnmatch import fnmatchcase
import importlib
import importlib.util
import json
from pathlib import Path
import sys
import time
import traceback
import types
from typing import Any
import unittest


def _iter_tests(suite: unittest.TestSuite) -> list[unittest.TestCase]:
    out: list[unittest.TestCase] = []
    for item in suite:
        if isinstance(item, unittest.TestSuite):
            out.extend(_iter_tests(item))
        else:
            out.append(item)
    return out


def _matches_filter(test_id: str, pattern: str | None) -> bool:
    if not pattern:
        return True
    p = pattern.lower()
    tid = test_id.lower()
    if any(ch in p for ch in ("*", "?", "[")):
        return fnmatchcase(tid, p)
    return p in tid


class _StructuredResult(unittest.TestResult):
    def __init__(self, tier: str, verbose: bool = False) -> None:
        super().__init__()
        self.tier = tier
        self.verbose = verbose
        self.records: list[dict[str, Any]] = []
        self._start_times: dict[str, float] = {}

    def startTest(self, test: unittest.TestCase) -> None:  # noqa: N802
        super().startTest(test)
        self._start_times[test.id()] = time.perf_counter()

    def _elapsed_ms(self, test: unittest.TestCase) -> int:
        t0 = self._start_times.pop(test.id(), None)
        if t0 is None:
            return 0
        return int(round((time.perf_counter() - t0) * 1000))

    def _record(
        self,
        test: unittest.TestCase,
        status: str,
        message: str | None = None,
        tb_text: str | None = None,
    ) -> None:
        tid = test.id()
        ms = self._elapsed_ms(test)
        entry: dict[str, Any] = {
            "id": tid,
            "tier": self.tier,
            "status": status,
            "duration_ms": ms,
            "message": message,
        }
        if tb_text:
            entry["traceback"] = tb_text
        self.records.append(entry)

        short_msg = f": {message.splitlines()[0]}" if message else ""
        if status == "PASS":
            print(f"[PASS] {tid} ({ms}ms)")
        elif status == "SKIP":
            print(f"[SKIP] {tid} ({ms}ms){short_msg}")
        elif status == "FAIL":
            print(f"[FAIL] {tid} ({ms}ms){short_msg}")
            if self.verbose and tb_text:
                print(tb_text.rstrip())
        elif status == "ERROR":
            print(f"[ERROR] {tid} ({ms}ms){short_msg}")
            if self.verbose and tb_text:
                print(tb_text.rstrip())

    def addSuccess(self, test: unittest.TestCase) -> None:  # noqa: N802
        super().addSuccess(test)
        self._record(test, "PASS")

    def addFailure(self, test: unittest.TestCase, err: Any) -> None:  # noqa: N802
        super().addFailure(test, err)
        tb_text = "".join(traceback.format_exception(*err))
        msg = str(err[1]) if err and len(err) > 1 else "Assertion failed"
        self._record(test, "FAIL", message=msg, tb_text=tb_text)

    def addError(self, test: unittest.TestCase, err: Any) -> None:  # noqa: N802
        super().addError(test, err)
        tb_text = "".join(traceback.format_exception(*err))
        msg = str(err[1]) if err and len(err) > 1 else "Unhandled error"
        self._record(test, "ERROR", message=msg, tb_text=tb_text)

    def addSkip(self, test: unittest.TestCase, reason: str) -> None:  # noqa: N802
        super().addSkip(test, reason)
        self._record(test, "SKIP", message=reason)


def _ensure_package_chain(tests_dir: Path, rel_pkg_parts: tuple[str, ...]) -> None:
    """Ensure tier/subdir package modules exist in sys.modules even without __init__.py."""
    for depth in range(1, len(rel_pkg_parts) + 1):
        sub_parts = rel_pkg_parts[:depth]
        pkg_name = ".".join(sub_parts)
        pkg_dir = tests_dir.joinpath(*sub_parts)
        if pkg_name in sys.modules:
            continue
        if (pkg_dir / "__init__.py").is_file():
            importlib.import_module(pkg_name)
        else:
            pkg = types.ModuleType(pkg_name)
            pkg.__path__ = [str(pkg_dir)]
            pkg.__package__ = pkg_name
            sys.modules[pkg_name] = pkg


def _discover_tier(
    tier: str,
    tests_dir: Path,
    filter_pattern: str | None,
) -> tuple[str, list[unittest.TestCase], list[dict[str, Any]]]:
    """Return (tier_status, matched_tests, discovery_errors)."""
    loader = unittest.TestLoader()
    discovery_errors: list[dict[str, Any]] = []

    if tier == "infra":
        infra_file = tests_dir / "test_infra_smoke.py"
        if not infra_file.is_file():
            return "missing", [], []
        try:
            suite = loader.loadTestsFromName("test_infra_smoke")
        except Exception as exc:
            tb_text = traceback.format_exc()
            discovery_errors.append(
                {
                    "id": "test_infra_smoke.<import>",
                    "tier": tier,
                    "status": "ERROR",
                    "duration_ms": 0,
                    "message": str(exc),
                    "traceback": tb_text,
                }
            )
            return "error", [], discovery_errors
    else:
        tier_dir = tests_dir / f"tier{tier}"
        if not tier_dir.is_dir():
            return "missing", [], []
        test_files = sorted(tier_dir.rglob("test_*.py"))
        if not test_files:
            return "empty", [], []

        all_dirs_have_init = (tier_dir / "__init__.py").is_file() and all(
            (parent / "__init__.py").is_file()
            for tf in test_files
            for parent in (tf.parent, *tf.parent.parents)
            if tier_dir in parent.parents
        )

        if all_dirs_have_init:
            try:
                suite = loader.discover(
                    start_dir=str(tier_dir),
                    pattern="test_*.py",
                    top_level_dir=str(tests_dir),
                )
            except Exception as exc:
                tb_text = traceback.format_exc()
                discovery_errors.append(
                    {
                        "id": f"tier{tier}.<discover>",
                        "tier": tier,
                        "status": "ERROR",
                        "duration_ms": 0,
                        "message": str(exc),
                        "traceback": tb_text,
                    }
                )
                return "error", [], discovery_errors
        else:
            suite = unittest.TestSuite()
            for tf in test_files:
                rel_no_ext = tf.relative_to(tests_dir).with_suffix("")
                mod_name = ".".join(rel_no_ext.parts)
                pkg_parts = tf.relative_to(tests_dir).parent.parts
                try:
                    _ensure_package_chain(tests_dir, pkg_parts)
                    spec = importlib.util.spec_from_file_location(mod_name, str(tf))
                    if spec is None or spec.loader is None:
                        raise ImportError(f"Could not create module spec for {tf}")
                    mod = importlib.util.module_from_spec(spec)
                    sys.modules[mod_name] = mod
                    spec.loader.exec_module(mod)
                    suite.addTests(loader.loadTestsFromModule(mod))
                except Exception as exc:
                    err_id = f"{mod_name}.<import>"
                    if _matches_filter(err_id, filter_pattern):
                        discovery_errors.append(
                            {
                                "id": err_id,
                                "tier": tier,
                                "status": "ERROR",
                                "duration_ms": 0,
                                "message": str(exc),
                                "traceback": traceback.format_exc(),
                            }
                        )

    raw_tests = _iter_tests(suite)
    matched: list[unittest.TestCase] = []
    for tc in raw_tests:
        tid = tc.id()
        if _matches_filter(tid, filter_pattern):
            matched.append(tc)

    if filter_pattern is None and not matched and not discovery_errors and loader.errors:
        for idx, err_msg in enumerate(loader.errors):
            discovery_errors.append(
                {
                    "id": f"tier{tier}.<loader_error_{idx}>",
                    "tier": tier,
                    "status": "ERROR",
                    "duration_ms": 0,
                    "message": err_msg.splitlines()[-1] if err_msg else "Import error",
                    "traceback": err_msg,
                }
            )

    return "ok", matched, discovery_errors


def run_suite(
    tier_arg: str = "all",
    filter_pattern: str | None = None,
    json_path: str | Path | None = None,
    verbose: bool = False,
) -> tuple[int, dict[str, Any]]:
    tests_dir = Path(__file__).resolve().parent
    repo_root = tests_dir.parent
    for p in (str(repo_root), str(tests_dir)):
        if p not in sys.path:
            sys.path.insert(0, p)

    selected_tiers = ["infra", "1", "2", "3", "4"] if tier_arg == "all" else [tier_arg]
    started_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    t_start = time.perf_counter()

    all_records: list[dict[str, Any]] = []
    tiers_summary: dict[str, Any] = {}

    for tier in selected_tiers:
        t_status, tests_list, disc_errors = _discover_tier(tier, tests_dir, filter_pattern)
        tier_records: list[dict[str, Any]] = []

        for derr in disc_errors:
            print(f"[ERROR] {derr['id']} (0ms): {derr['message']}")
            tier_records.append(derr)

        if t_status in ("missing", "empty"):
            print(f"[INFO] Tier {tier}: {t_status} (no test files)")
        elif tests_list:
            res = _StructuredResult(tier=tier, verbose=verbose)
            sub_suite = unittest.TestSuite(tests_list)
            sub_suite.run(res)
            tier_records.extend(res.records)

        p_cnt = sum(1 for r in tier_records if r["status"] == "PASS")
        f_cnt = sum(1 for r in tier_records if r["status"] == "FAIL")
        e_cnt = sum(1 for r in tier_records if r["status"] == "ERROR")
        s_cnt = sum(1 for r in tier_records if r["status"] == "SKIP")
        tiers_summary[tier] = {
            "total": len(tier_records),
            "passed": p_cnt,
            "failed": f_cnt,
            "errors": e_cnt,
            "skipped": s_cnt,
            "status": t_status,
        }
        all_records.extend(tier_records)

    total_ms = int(round((time.perf_counter() - t_start) * 1000))
    total = len(all_records)
    passed = sum(1 for r in all_records if r["status"] == "PASS")
    failed = sum(1 for r in all_records if r["status"] == "FAIL")
    errors = sum(1 for r in all_records if r["status"] == "ERROR")
    skipped = sum(1 for r in all_records if r["status"] == "SKIP")

    if failed > 0 or errors > 0:
        exit_code = 1
    elif total == 0:
        exit_code = 2
    else:
        exit_code = 0

    report: dict[str, Any] = {
        "schema_version": 1,
        "started_at": started_at,
        "duration_ms": total_ms,
        "tier_arg": tier_arg,
        "filter_arg": filter_pattern,
        "exit_code": exit_code,
        "summary": {
            "total": total,
            "passed": passed,
            "failed": failed,
            "errors": errors,
            "skipped": skipped,
        },
        "tiers": tiers_summary,
        "tests": all_records,
    }

    if json_path is not None:
        out_file = Path(json_path)
        out_file.parent.mkdir(parents=True, exist_ok=True)
        out_file.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print(
        f"Total: {total} | PASS: {passed} | FAIL: {failed} | "
        f"ERROR: {errors} | SKIP: {skipped} | Duration: {total_ms / 1000:.2f}s"
    )
    return exit_code, report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="FoxHub Unified E2E Test Runner")
    parser.add_argument(
        "--tier",
        choices=["all", "infra", "1", "2", "3", "4"],
        default="all",
        help="Test tier to execute (default: all)",
    )
    parser.add_argument(
        "--filter",
        dest="filter_pattern",
        default=None,
        help="Optional glob or case-insensitive substring filter on test ID",
    )
    parser.add_argument(
        "--json",
        dest="json_path",
        default=None,
        help="Path to write structured JSON report",
    )
    parser.add_argument(
        "-v",
        "--verbose",
        action="store_true",
        help="Print verbose tracebacks on failures",
    )
    args = parser.parse_args(argv)
    exit_code, _report = run_suite(
        tier_arg=args.tier,
        filter_pattern=args.filter_pattern,
        json_path=args.json_path,
        verbose=args.verbose,
    )
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
