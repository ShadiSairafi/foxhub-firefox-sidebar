"""AMO MV2 static & SpiderMonkey JS syntax linter for FoxHub (zero Node.js)."""

from __future__ import annotations

import argparse
from dataclasses import asdict, dataclass, field
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sys
from typing import Any
from urllib.parse import urlsplit

ALLOWED_MV2_PERMISSIONS: frozenset[str] = frozenset(
    {
        "alarms",
        "activeTab",
        "bookmarks",
        "browsingData",
        "clipboardRead",
        "clipboardWrite",
        "contextMenus",
        "contextualIdentities",
        "cookies",
        "downloads",
        "find",
        "history",
        "identity",
        "idle",
        "menus",
        "notifications",
        "sessions",
        "storage",
        "tabs",
        "theme",
        "unlimitedStorage",
        "webNavigation",
        "webRequest",
        "webRequestBlocking",
    }
)

HIGH_RISK_PERMISSIONS: frozenset[str] = frozenset(
    {
        "debugger",
        "nativeMessaging",
        "management",
        "proxy",
        "privacy",
        "pkcs11",
        "geckoProfiler",
    }
)

ALLOWED_POCKETMAIL_TOKENS: frozenset[str] = frozenset(
    {
        "pocketmail",
        "pocketmail-media-frame",
        "SIDEBAR_NAVIGATE_POCKETMAIL",
        "btn-sc-app-pocketmail",
        "btn-sc-clear-pocketmail",
        "pocketmail-local@workspace.local",
        '[data-sc-app="pocketmail"]',
        "[data-sc-app='pocketmail']",
        "#btn-sc-app-pocketmail",
        "#btn-sc-clear-pocketmail",
    }
)

_REGEX_PREV_KEYWORDS: frozenset[str] = frozenset(
    {
        "return",
        "throw",
        "case",
        "default",
        "delete",
        "void",
        "typeof",
        "in",
        "instanceof",
        "new",
        "await",
        "yield",
        "else",
        "do",
    }
)

_REGEX_PREV_PUNCT: frozenset[str] = frozenset("([{,;:=!&|?+-*%^~<>/" "\n")


@dataclass
class LintFinding:
    rule: str
    severity: str  # "error" | "warning"
    file: str
    line: int | None
    message: str
    snippet: str | None = None


@dataclass
class LexedJS:
    code_with_strings: str
    code_no_strings: str
    strings: list[tuple[int, str, str]]
    templates: list[tuple[int, str]] = field(default_factory=list)


def _line_from_offset(text: str, pos: int) -> int:
    return text.count("\n", 0, pos) + 1


def _snippet_at(text: str, line_no: int | None) -> str | None:
    if line_no is None or line_no <= 0:
        return None
    lines = text.splitlines()
    if 1 <= line_no <= len(lines):
        return lines[line_no - 1].strip()[:180]
    return None


def _lex_js(source: str) -> LexedJS:
    """Single-pass JS lexer stripping comments/strings accurately while keeping 1:1 line numbers."""
    n = len(source)
    out_with_str: list[str] = []
    out_no_str: list[str] = []
    strings: list[tuple[int, str, str]] = []
    templates: list[tuple[int, str]] = []

    i = 0
    line = 1
    mode = "code"  # code | line_comment | block_comment | string | template | regex
    quote_char = ""
    str_start_line = 1
    str_buf: list[str] = []
    template_expr_stack: list[int] = []
    tpl_start_stack: list[tuple[int, int]] = []
    regex_in_class = False

    prev_sig: str | None = None
    prev_two: str = ""
    prev_word: str = ""
    word_preceded_by_dot = False
    paren_stack: list[bool] = []
    just_closed_header_paren = False

    def can_start_regex() -> bool:
        if prev_sig is None or just_closed_header_paren:
            return True
        if prev_two in ("++", "--"):
            return False
        if prev_word in _REGEX_PREV_KEYWORDS:
            return True
        if prev_sig in ("(", "[", "{", ",", ";", ":", "=", "!", "&", "|", "?", "+", "-", "*", "%", "^", "~", "<", ">", "/"):
            return True
        return False

    while i < n:
        ch = source[i]
        nxt = source[i + 1] if i + 1 < n else ""

        if mode == "code":
            if ch == "/" and nxt == "/":
                out_with_str.extend("  ")
                out_no_str.extend("  ")
                mode = "line_comment"
                i += 2
                continue
            if ch == "/" and nxt == "*":
                out_with_str.extend("  ")
                out_no_str.extend("  ")
                mode = "block_comment"
                i += 2
                continue
            if ch == "/" and can_start_regex():
                out_with_str.append(ch)
                out_no_str.append(ch)
                mode = "regex"
                regex_in_class = False
                just_closed_header_paren = False
                i += 1
                continue
            if ch in ("'", '"'):
                out_with_str.append(ch)
                out_no_str.append(ch)
                mode = "string"
                quote_char = ch
                str_start_line = line
                str_buf = []
                just_closed_header_paren = False
                i += 1
                continue
            if ch == "`":
                tpl_start_stack.append((line, len(out_with_str)))
                out_with_str.append(ch)
                out_no_str.append(ch)
                mode = "template"
                str_start_line = line
                str_buf = []
                just_closed_header_paren = False
                i += 1
                continue

            if ch == "{" and template_expr_stack:
                template_expr_stack[-1] += 1
            elif ch == "}" and template_expr_stack:
                template_expr_stack[-1] -= 1
                if template_expr_stack[-1] == 0:
                    template_expr_stack.pop()
                    out_with_str.append(ch)
                    out_no_str.append(ch)
                    mode = "template"
                    str_start_line = line
                    str_buf = []
                    just_closed_header_paren = False
                    i += 1
                    continue

            out_with_str.append(ch)
            out_no_str.append(ch)

            if ch == "\n":
                line += 1
            elif not ch.isspace():
                if ch == "(":
                    is_ctrl = (not word_preceded_by_dot) and (prev_word in ("if", "while", "for", "with"))
                    paren_stack.append(is_ctrl)
                    just_closed_header_paren = False
                elif ch == ")":
                    just_closed_header_paren = paren_stack.pop() if paren_stack else False
                else:
                    just_closed_header_paren = False

                if ch.isalnum() or ch in ("_", "$"):
                    if prev_sig and (prev_sig.isalnum() or prev_sig in ("_", "$")):
                        prev_word += ch
                    else:
                        word_preceded_by_dot = prev_sig == "."
                        prev_word = ch
                else:
                    prev_word = ""
                    word_preceded_by_dot = False
                prev_two = (prev_sig or "") + ch
                prev_sig = ch
            i += 1
            continue

        if mode == "line_comment":
            if ch == "\n":
                out_with_str.append("\n")
                out_no_str.append("\n")
                line += 1
                mode = "code"
            else:
                out_with_str.append(" ")
                out_no_str.append(" ")
            i += 1
            continue

        if mode == "block_comment":
            if ch == "*" and nxt == "/":
                out_with_str.extend("  ")
                out_no_str.extend("  ")
                mode = "code"
                i += 2
                continue
            if ch == "\n":
                out_with_str.append("\n")
                out_no_str.append("\n")
                line += 1
            else:
                out_with_str.append(" ")
                out_no_str.append(" ")
            i += 1
            continue

        if mode == "string":
            if ch == "\\" and i + 1 < n:
                out_with_str.append(ch)
                out_with_str.append(nxt)
                if nxt == "\n":
                    out_no_str.append("\n")
                    line += 1
                else:
                    out_no_str.extend("  ")
                    str_buf.append(ch)
                    str_buf.append(nxt)
                i += 2
                continue
            if ch == quote_char:
                out_with_str.append(ch)
                out_no_str.append(ch)
                strings.append((str_start_line, quote_char, "".join(str_buf)))
                mode = "code"
                prev_sig = quote_char
                prev_two = quote_char
                prev_word = ""
                i += 1
                continue
            if ch == "\n":
                out_with_str.append("\n")
                out_no_str.append("\n")
                line += 1
                mode = "code"
            else:
                out_with_str.append(ch)
                out_no_str.append(" ")
                str_buf.append(ch)
            i += 1
            continue

        if mode == "template":
            if ch == "\\" and i + 1 < n:
                out_with_str.append(ch)
                out_with_str.append(nxt)
                if nxt == "\n":
                    out_no_str.append("\n")
                    line += 1
                else:
                    out_no_str.extend("  ")
                    str_buf.append(ch)
                    str_buf.append(nxt)
                i += 2
                continue
            if ch == "$" and nxt == "{":
                out_with_str.extend("${")
                out_no_str.extend("${")
                strings.append((str_start_line, "`", "".join(str_buf)))
                str_buf = []
                template_expr_stack.append(1)
                mode = "code"
                prev_sig = "{"
                prev_two = "${"
                prev_word = ""
                i += 2
                continue
            if ch == "`":
                out_with_str.append("`")
                out_no_str.append("`")
                strings.append((str_start_line, "`", "".join(str_buf)))
                if tpl_start_stack:
                    t_line, t_start = tpl_start_stack.pop()
                    templates.append((t_line, "".join(out_with_str[t_start:])))
                mode = "code"
                prev_sig = "`"
                prev_two = "`"
                prev_word = ""
                i += 1
                continue
            out_with_str.append(ch)
            if ch == "\n":
                out_no_str.append("\n")
                line += 1
            else:
                out_no_str.append(" ")
            str_buf.append(ch)
            i += 1
            continue

        if mode == "regex":
            out_with_str.append(ch)
            if ch == "\\" and i + 1 < n:
                out_with_str.append(nxt)
                out_no_str.append(" ")
                out_no_str.append("\n" if nxt == "\n" else " ")
                if nxt == "\n":
                    line += 1
                i += 2
                continue
            if ch == "[":
                regex_in_class = True
                out_no_str.append(" ")
                i += 1
                continue
            if ch == "]" and regex_in_class:
                regex_in_class = False
                out_no_str.append(" ")
                i += 1
                continue
            if ch == "/" and not regex_in_class:
                out_no_str.append("/")
                mode = "code"
                prev_sig = "/"
                prev_two = "/"
                prev_word = ""
                i += 1
                # consume flags
                while i < n and source[i].isalpha():
                    out_with_str.append(source[i])
                    out_no_str.append(" ")
                    i += 1
                continue
            if ch == "\n":
                out_no_str.append("\n")
                line += 1
                mode = "code"
            else:
                out_no_str.append(" ")
            i += 1

    return LexedJS(
        code_with_strings="".join(out_with_str),
        code_no_strings="".join(out_no_str),
        strings=strings,
        templates=templates,
    )


def _is_remote_url(val: str) -> bool:
    s = val.strip().lower()
    return s.startswith("http://") or s.startswith("https://") or s.startswith("//")


def _resolve_local_asset(root: Path, ref: str) -> tuple[bool, Path | None, str | None]:
    stripped = ref.strip()
    if not stripped:
        return False, None, "Empty file path reference"
    if _is_remote_url(stripped) or stripped.lower().startswith("data:"):
        return False, None, f"Remote or data URI not allowed: {stripped}"
    clean_path = urlsplit(stripped).path.lstrip("/")
    if not clean_path:
        return False, None, f"Invalid empty path in reference: {stripped}"
    candidate = (root / clean_path).resolve()
    root_resolved = root.resolve()
    if not candidate.is_relative_to(root_resolved):
        return False, None, f"Path escapes extension root: {stripped}"
    if not candidate.is_file():
        return False, candidate, f"Referenced file does not exist: {clean_path}"
    return True, candidate, None


def _is_valid_match_pattern(perm: str) -> bool:
    if perm == "<all_urls>":
        return True
    return bool(re.match(r"^(?:https?|wss?|\*|file|ftp)://.+", perm))


def _check_manifest(root: Path, findings: list[LintFinding]) -> bool:
    manifest_path = root / "manifest.json"
    if not manifest_path.is_file():
        findings.append(LintFinding("manifest.missing", "error", "manifest.json", None, "manifest.json does not exist"))
        return False
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except Exception as exc:
        findings.append(LintFinding("manifest.invalid_json", "error", "manifest.json", None, f"Invalid JSON: {exc}"))
        return False
    if not isinstance(manifest, dict):
        findings.append(LintFinding("manifest.invalid_type", "error", "manifest.json", None, "manifest.json root must be an object"))
        return False

    ok = True

    def add_err(rule: str, msg: str) -> None:
        nonlocal ok
        ok = False
        findings.append(LintFinding(rule, "error", "manifest.json", None, msg))

    if manifest.get("manifest_version") != 2:
        add_err("manifest.version_mv2", f"Expected manifest_version 2, got {manifest.get('manifest_version')!r}")

    for req_key in ("name", "version", "manifest_version", "permissions", "browser_specific_settings"):
        if req_key not in manifest:
            add_err("manifest.missing_key", f"Missing required manifest key: {req_key}")

    version = manifest.get("version")
    if not isinstance(version, str) or not re.match(r"^\d+\.\d+\.\d+(?:\.\d+)?$", version):
        add_err("manifest.invalid_version", f"Invalid extension version format: {version!r}")

    bss = manifest.get("browser_specific_settings")
    if isinstance(bss, dict):
        gecko = bss.get("gecko")
        if not isinstance(gecko, dict) or not isinstance(gecko.get("id"), str) or not gecko["id"].strip():
            add_err("manifest.gecko_id", "Missing browser_specific_settings.gecko.id")
        else:
            gid = gecko["id"].strip()
            if not (
                re.match(r"^\{[0-9a-fA-F-]{36}\}$", gid)
                or re.match(r"^[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+$", gid)
            ):
                add_err("manifest.gecko_id_format", f"Invalid AMO gecko.id format: {gid!r}")
        if isinstance(gecko, dict) and "strict_min_version" in gecko:
            smv = str(gecko["strict_min_version"])
            if not re.match(r"^\d+(?:\.\d+|\.\*)?(?:\.\d+)?$", smv):
                add_err("manifest.strict_min_version", f"Invalid strict_min_version: {smv!r}")
    else:
        add_err("manifest.gecko_settings", "browser_specific_settings must be an object")

    # Permissions
    perms = manifest.get("permissions")
    if not isinstance(perms, list):
        add_err("manifest.permissions_type", "permissions must be a list")
    else:
        for p in perms:
            if not isinstance(p, str):
                add_err("manifest.permission_entry", f"Non-string permission: {p!r}")
                continue
            if p in HIGH_RISK_PERMISSIONS:
                add_err("manifest.permission_disallowed", f"High-risk/disallowed permission: {p}")
            elif p not in ALLOWED_MV2_PERMISSIONS and not _is_valid_match_pattern(p):
                add_err("manifest.permission_unknown", f"Unknown or unsupported permission: {p}")

    # CSP
    csp = manifest.get("content_security_policy")
    if csp is not None:
        if not isinstance(csp, str):
            add_err("manifest.csp_type", "content_security_policy must be a string")
        else:
            lower_csp = csp.lower()
            for bad_tok in ("'unsafe-eval'", "'unsafe-inline'", "http://", "https://", "ws://", "wss://"):
                if bad_tok in lower_csp:
                    add_err("manifest.csp_unsafe", f"Disallowed CSP token {bad_tok!r} in content_security_policy")
            for directive in csp.split(";"):
                parts = directive.strip().split()
                if parts and parts[0].lower() in ("script-src", "object-src", "default-src"):
                    if "*" in parts[1:]:
                        add_err("manifest.csp_wildcard", f"Wildcard '*' disallowed in CSP directive {parts[0]}")

    # File references
    def check_ref(ref: Any, context_label: str) -> None:
        if not isinstance(ref, str):
            add_err("manifest.path_type", f"Expected string path for {context_label}, got {type(ref).__name__}")
            return
        valid, _cand, err_msg = _resolve_local_asset(root, ref)
        if not valid:
            add_err("manifest.missing_asset", f"{context_label}: {err_msg}")

    icons = manifest.get("icons")
    if isinstance(icons, dict):
        for size, path_val in icons.items():
            check_ref(path_val, f"icons[{size}]")

    for action_key, page_key in (("browser_action", "default_popup"), ("sidebar_action", "default_panel")):
        section = manifest.get(action_key)
        if isinstance(section, dict):
            if page_key in section:
                check_ref(section[page_key], f"{action_key}.{page_key}")
            dicon = section.get("default_icon")
            if isinstance(dicon, str):
                check_ref(dicon, f"{action_key}.default_icon")
            elif isinstance(dicon, dict):
                for sz, pval in dicon.items():
                    check_ref(pval, f"{action_key}.default_icon[{sz}]")

    options_ui = manifest.get("options_ui")
    if isinstance(options_ui, dict) and "page" in options_ui:
        check_ref(options_ui["page"], "options_ui.page")

    bg = manifest.get("background")
    if isinstance(bg, dict):
        if "page" in bg:
            check_ref(bg["page"], "background.page")
        for idx, sc in enumerate(bg.get("scripts") or []):
            check_ref(sc, f"background.scripts[{idx}]")

    for idx, cs in enumerate(manifest.get("content_scripts") or []):
        if not isinstance(cs, dict):
            add_err("manifest.content_scripts", f"content_scripts[{idx}] must be an object")
            continue
        if not cs.get("matches"):
            add_err("manifest.content_scripts_matches", f"content_scripts[{idx}] missing non-empty matches")
        for jidx, js_ref in enumerate(cs.get("js") or []):
            check_ref(js_ref, f"content_scripts[{idx}].js[{jidx}]")
        for cidx, css_ref in enumerate(cs.get("css") or []):
            check_ref(css_ref, f"content_scripts[{idx}].css[{cidx}]")

    for idx, war in enumerate(manifest.get("web_accessible_resources") or []):
        if not isinstance(war, str) or not war.strip():
            add_err("manifest.war_invalid", f"web_accessible_resources[{idx}] must be a non-empty string")
            continue
        clean_war = war.strip().lstrip("/")
        if clean_war.startswith(".git") or clean_war.startswith("tests"):
            add_err("manifest.war_sensitive", f"web_accessible_resources[{idx}] exposes sensitive path: {war}")
            continue
        if ".." in Path(clean_war).parts:
            add_err("manifest.war_traversal", f"web_accessible_resources[{idx}] contains '..': {war}")
            continue
        matches = list(root.glob(clean_war))
        if not any(m.is_file() for m in matches):
            add_err("manifest.war_missing", f"web_accessible_resources[{idx}] matches no files: {war}")

    # Manifest branding check (excluding gecko.id)
    for field in ("name", "short_name", "description", "author"):
        val = manifest.get(field)
        if isinstance(val, str) and "pocketmail" in val.lower():
            add_err("branding.pocketmail_manifest", f"User-facing manifest.{field} contains 'PocketMail': {val!r}")
    for section_key in ("browser_action", "sidebar_action"):
        sec = manifest.get(section_key)
        if isinstance(sec, dict):
            dt = sec.get("default_title")
            if isinstance(dt, str) and "pocketmail" in dt.lower():
                add_err("branding.pocketmail_manifest", f"{section_key}.default_title contains 'PocketMail': {dt!r}")
    cmds = manifest.get("commands")
    if isinstance(cmds, dict):
        for cmd_name, cmd_obj in cmds.items():
            if isinstance(cmd_obj, dict):
                desc = cmd_obj.get("description")
                if isinstance(desc, str) and "pocketmail" in desc.lower():
                    add_err("branding.pocketmail_manifest", f"commands.{cmd_name}.description contains 'PocketMail'")

    return ok


class _AmoHtmlScanner(HTMLParser):
    def __init__(self, root: Path, html_file: Path, rel_path: str, findings: list[LintFinding]) -> None:
        super().__init__(convert_charrefs=True)
        self.root = root
        self.html_dir = html_file.parent
        self.rel_path = rel_path
        self.findings = findings
        self.in_script = False
        self.script_has_src = False
        self.script_start_line = 1
        self.script_buf: list[str] = []
        self.in_style = False

    def _resolve_html_ref(self, ref: str) -> tuple[bool, str | None]:
        cleaned = urlsplit(ref.strip()).path
        if not cleaned:
            return False, "Empty asset path"
        if cleaned.startswith("/"):
            cand = (self.root / cleaned.lstrip("/")).resolve()
        else:
            cand = (self.html_dir / cleaned).resolve()
        root_res = self.root.resolve()
        if not cand.is_relative_to(root_res):
            return False, f"Path escapes extension root: {ref}"
        if not cand.is_file():
            return False, f"Referenced local asset missing: {ref}"
        return True, None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        t = tag.lower()
        line, _col = self.getpos()
        attr_map: dict[str, str] = {}
        for k, v in attrs:
            kl = k.lower()
            val = v or ""
            attr_map[kl] = val
            if re.match(r"^on[a-z]+$", kl):
                self.findings.append(
                    LintFinding("html.inline_event_handler", "error", self.rel_path, line, f"Inline event handler attribute '{kl}' in <{t}>")
                )
            norm_uri = re.sub(r"[\x00-\x20]+", "", html.unescape(val)).lower()
            if kl in ("href", "src", "action", "formaction") and (
                norm_uri.startswith("javascript:") or norm_uri.startswith("data:text/javascript")
            ):
                self.findings.append(
                    LintFinding("html.javascript_uri", "error", self.rel_path, line, f"Disallowed javascript/data URI in {kl} of <{t}>")
                )

        # Branding check on user-facing attributes
        input_type = attr_map.get("type", "").lower()
        for k, val in attr_map.items():
            if k in ("title", "aria-label", "placeholder", "alt", "label") or (
                t == "input" and k == "value" and input_type in ("button", "submit", "reset")
            ):
                if "pocketmail" in val.lower():
                    self.findings.append(
                        LintFinding("branding.pocketmail_html", "error", self.rel_path, line, f"User-facing 'PocketMail' in <{t} {k}=...>: {val!r}")
                    )

        if t == "script":
            self.in_script = True
            self.script_start_line = line
            self.script_buf = []
            src = attr_map.get("src")
            if src is None or not src.strip():
                self.script_has_src = False
                self.findings.append(
                    LintFinding("html.inline_script", "error", self.rel_path, line, "Inline <script> without src attribute is disallowed")
                )
            else:
                self.script_has_src = True
                if _is_remote_url(src) or src.strip().lower().startswith("data:"):
                    self.findings.append(
                        LintFinding("html.remote_script", "error", self.rel_path, line, f"Remote/data <script src> is disallowed: {src!r}")
                    )
                else:
                    ok, err = self._resolve_html_ref(src)
                    if not ok:
                        self.findings.append(
                            LintFinding("html.missing_script", "error", self.rel_path, line, err or f"Missing script {src}")
                        )
        elif t == "style":
            self.in_style = True
        elif t == "link":
            href = attr_map.get("href", "").strip()
            rels = {r.strip().lower() for r in attr_map.get("rel", "").split() if r.strip()}
            if href and rels & {"stylesheet", "import", "preload", "modulepreload", "icon"}:
                if _is_remote_url(href):
                    self.findings.append(
                        LintFinding("html.remote_link", "error", self.rel_path, line, f"Remote <link rel={sorted(rels)} href={href!r}> is disallowed")
                    )
                elif "stylesheet" in rels:
                    ok, err = self._resolve_html_ref(href)
                    if not ok:
                        self.findings.append(
                            LintFinding("html.missing_stylesheet", "error", self.rel_path, line, err or f"Missing stylesheet {href}")
                        )
        elif t in ("img", "iframe") and "src" in attr_map:
            src_val = attr_map["src"].strip()
            if t == "img" and src_val and not _is_remote_url(src_val) and not src_val.lower().startswith("data:"):
                ok, err = self._resolve_html_ref(src_val)
                if not ok:
                    self.findings.append(
                        LintFinding("html.missing_image", "error", self.rel_path, line, err or f"Missing image {src_val}")
                    )

    def handle_endtag(self, tag: str) -> None:
        t = tag.lower()
        if t == "script":
            if self.in_script and self.script_has_src and "".join(self.script_buf).strip():
                self.findings.append(
                    LintFinding("html.inline_script_body", "error", self.rel_path, self.script_start_line, "<script src=...> must not have inline body content")
                )
            self.in_script = False
            self.script_has_src = False
            self.script_buf = []
        elif t == "style":
            self.in_style = False

    def handle_data(self, data: str) -> None:
        if self.in_script:
            self.script_buf.append(data)
            return
        if self.in_style:
            return
        if "pocketmail" in data.lower():
            line, _col = self.getpos()
            self.findings.append(
                LintFinding(
                    "branding.pocketmail_html",
                    "error",
                    self.rel_path,
                    line,
                    f"User-facing 'PocketMail' text in HTML: {data.strip()[:120]!r}",
                )
            )


_ALLOWED_POCKETMAIL_SUBSTRINGS: tuple[str, ...] = (
    'sidebarcommand="pocketmail-local_workspace_local-sidebar-action"',
    "sidebarcommand='pocketmail-local_workspace_local-sidebar-action'",
    "#btn-sc-app-pocketmail",
    "#btn-sc-clear-pocketmail",
    'data-sc-app="pocketmail"',
    "data-sc-app='pocketmail'",
)

_JS_STR_ESC_RE = re.compile(
    r"\\(?:"
    r"x([0-9a-fA-F]{2})"
    r"|u([0-9a-fA-F]{4})"
    r"|u\{([0-9a-fA-F]+)\}"
    r"|(\r\n|\n|\r)"
    r"|(['\"`\\bfnrtv0])"
    r"|(.)"
    r")"
)
_JS_SIMPLE_ESC_MAP: dict[str, str] = {
    "'": "'",
    '"': '"',
    "`": "`",
    "\\": "\\",
    "b": "\b",
    "f": "\f",
    "n": "\n",
    "r": "\r",
    "t": "\t",
    "v": "\v",
    "0": "\0",
}


def _decode_js_string_escapes(raw: str) -> str:
    def _repl(m: re.Match[str]) -> str:
        hx, u4, ubr, nl, simple, other = m.groups()
        if hx is not None:
            return chr(int(hx, 16))
        if u4 is not None:
            return chr(int(u4, 16))
        if ubr is not None:
            try:
                cp = int(ubr, 16)
                if 0 <= cp <= 0x10FFFF:
                    return chr(cp)
            except ValueError:
                pass
            return m.group(0)
        if nl is not None:
            return ""
        if simple is not None:
            return _JS_SIMPLE_ESC_MAP.get(simple, simple)
        return other if other is not None else m.group(0)

    return _JS_STR_ESC_RE.sub(_repl, raw)


_CODE_HEX_UNI_RE = re.compile(
    r"\\\\|\\x([0-9a-fA-F]{2})|\\u([0-9a-fA-F]{4})|\\u\{([0-9a-fA-F]+)\}"
)
_IDENT_UNI_RE = re.compile(r"\\u([0-9a-fA-F]{4})|\\u\{([0-9a-fA-F]+)\}")
_EMPTY_TPL_INTERP_RE = re.compile(r"\\.|(\$\{\s*(?:''|\"\"|``)(?:\s*\+\s*(?:''|\"\"|``))*\s*\})")

_JS_LIT_PART = r"(?:'(?:\\(?:\r\n|\n|.)|[^'\\\n])*'|\"(?:\\(?:\r\n|\n|.)|[^\"\\\n])*\"|`(?:\\(?:\r\n|\n|.)|[^`\\$]|\$(?!\{))*`)"
_JS_LIT_PART_RE = re.compile(_JS_LIT_PART)
_JS_CONCAT_CHAIN_RE = re.compile(rf"({_JS_LIT_PART}(?:\s*\+\s*{_JS_LIT_PART})+)")
_JS_TPL_HEAD = r"`((?:\\(?:\r\n|\n|.)|[^`\\$]|\$(?!\{))*)\$\{"
_JS_CONCAT_TPL_HEAD_RE = re.compile(rf"({_JS_LIT_PART}(?:\s*\+\s*{_JS_LIT_PART})*)\s*\+\s*{_JS_TPL_HEAD}")
_JS_BRACKET_CONCAT_RE = re.compile(rf"\[\s*({_JS_LIT_PART}(?:\s*\+\s*{_JS_LIT_PART})*)\s*\]")
_JS_DOC_WRITE_BRACKET_RE = re.compile(
    rf"\bdocument\s*\[\s*({_JS_LIT_PART}(?:\s*\+\s*{_JS_LIT_PART})*)\s*\]"
)


def _decode_code_string_escapes(code_with_strings: str) -> str:
    def _repl(m: re.Match[str]) -> str:
        hx, u4, ubr = m.groups()
        if hx is None and u4 is None and ubr is None:
            return m.group(0)  # literal "\\"
        raw_hex = hx or u4 or ubr
        assert raw_hex is not None
        try:
            cp = int(raw_hex, 16)
            if 0x20 <= cp <= 0x10FFFF:
                ch = chr(cp)
                if ch not in ("'", '"', "`", "\\"):
                    return ch
        except ValueError:
            pass
        return m.group(0)

    decoded = _CODE_HEX_UNI_RE.sub(_repl, code_with_strings)
    return _EMPTY_TPL_INTERP_RE.sub(lambda m: "" if m.group(1) is not None else m.group(0), decoded)


def _decode_ident_escapes(code_no_strings: str) -> str:
    def _repl(m: re.Match[str]) -> str:
        u4, ubr = m.groups()
        raw_hex = u4 or ubr
        assert raw_hex is not None
        try:
            cp = int(raw_hex, 16)
            if 0x20 <= cp <= 0x10FFFF:
                ch = chr(cp)
                if ch.isalnum() or ch in ("_", "$"):
                    return ch
        except ValueError:
            pass
        return m.group(0)

    return _IDENT_UNI_RE.sub(_repl, code_no_strings)


def _join_concat_literals(expr: str) -> str:
    parts = _JS_LIT_PART_RE.findall(expr)
    return "".join(_decode_js_string_escapes(p[1:-1]) for p in parts)


def _is_allowed_pocketmail_string(text: str) -> bool:
    stripped = _decode_js_string_escapes(text).strip()
    if stripped in ALLOWED_POCKETMAIL_TOKENS:
        return True
    matched = False
    remainder = stripped
    for token in _ALLOWED_POCKETMAIL_SUBSTRINGS:
        if token in remainder:
            matched = True
            remainder = remainder.replace(token, "")
    return matched and ("pocketmail" not in remainder.lower())


def _check_js_file(js_path: Path, rel_path: str, findings: list[LintFinding]) -> None:
    source = js_path.read_text(encoding="utf-8", errors="replace")
    lexed = _lex_js(source)
    code_no_str = _decode_ident_escapes(lexed.code_no_strings)
    code_with_str = _decode_code_string_escapes(lexed.code_with_strings)

    no_str_patterns: list[tuple[str, re.Pattern[str], str]] = [
        ("js.unsafe_dom.innerHTML", re.compile(r"\binnerHTML\b"), "Use of innerHTML is disallowed (AMO unsafe DOM)"),
        ("js.unsafe_dom.outerHTML", re.compile(r"\bouterHTML\b"), "Use of outerHTML is disallowed (AMO unsafe DOM)"),
        ("js.unsafe_dom.insertAdjacentHTML", re.compile(r"\binsertAdjacentHTML\b"), "Use of insertAdjacentHTML is disallowed (AMO unsafe DOM)"),
        ("js.unsafe_dom.document_write", re.compile(r"\bdocument\s*\.\s*write(?:ln)?\b"), "Use of document.write/writeln is disallowed"),
        ("js.unsafe_eval.eval", re.compile(r"(?:^|[^\w.$])eval\s*(?:\?\.\s*)?\("), "Use of eval() is disallowed"),
        ("js.unsafe_eval.global_eval", re.compile(r"\b(?:window|self|globalThis)\s*\??\.\s*eval\b"), "Use of global eval is disallowed"),
        (
            "js.unsafe_eval.indirect_eval",
            re.compile(r"\(\s*(?:[^()]*,\s*)?(?:(?:window|self|globalThis)\s*\??\.\s*)?eval\s*\)\s*(?:\?\.\s*)?\("),
            "Use of indirect eval() is disallowed",
        ),
        ("js.unsafe_eval.new_Function", re.compile(r"\bnew\s+Function\s*\("), "Use of new Function() is disallowed"),
        ("js.unsafe_eval.Function_call", re.compile(r"(?<![.\w$])Function\s*\("), "Use of Function() constructor is disallowed"),
        (
            "js.unsafe_eval.string_timer",
            re.compile(r"\b(?:setTimeout|setInterval)\s*\(\s*(?:\"[^\"]*\"|'[^']*'|`[^`]*`)"),
            "String argument to setTimeout/setInterval is disallowed",
        ),
    ]

    for rule, pat, msg in no_str_patterns:
        for m in pat.finditer(code_no_str):
            line_no = _line_from_offset(code_no_str, m.start())
            findings.append(LintFinding(rule, "error", rel_path, line_no, msg, _snippet_at(source, line_no)))

    with_str_patterns: list[tuple[str, re.Pattern[str], str]] = [
        (
            "js.unsafe_dom.bracket_bypass",
            re.compile(r"\[\s*['\"`](?:innerHTML|outerHTML|insertAdjacentHTML|eval)['\"`]\s*\]"),
            "Bracket property access to unsafe DOM/eval property is disallowed",
        ),
        (
            "js.remote_code.importScripts",
            re.compile(r"\bimportScripts\s*\([^)]*(?:https?:)?//", re.IGNORECASE),
            "Remote importScripts() is disallowed",
        ),
        (
            "js.remote_code.script_tag",
            re.compile(r"<\s*script\b[^>]*\bsrc\s*=\s*['\"`]?\s*(?:https?:)?//", re.IGNORECASE),
            "Remote <script> tag literal is disallowed",
        ),
    ]

    for rule, pat, msg in with_str_patterns:
        for m in pat.finditer(code_with_str):
            line_no = _line_from_offset(code_with_str, m.start())
            findings.append(LintFinding(rule, "error", rel_path, line_no, msg, _snippet_at(source, line_no)))

    for m_concat_bracket in _JS_BRACKET_CONCAT_RE.finditer(code_with_str):
        expr = m_concat_bracket.group(1)
        if "+" not in expr and "\\" not in expr:
            continue
        joined = _join_concat_literals(expr)
        if joined in ("innerHTML", "outerHTML", "insertAdjacentHTML", "eval"):
            line_no = _line_from_offset(code_with_str, m_concat_bracket.start())
            findings.append(
                LintFinding(
                    "js.unsafe_dom.bracket_bypass",
                    "error",
                    rel_path,
                    line_no,
                    f"Concatenated bracket property access to unsafe DOM/eval property ({joined}) is disallowed",
                    _snippet_at(source, line_no),
                )
            )

    for m_doc_write in _JS_DOC_WRITE_BRACKET_RE.finditer(code_with_str):
        joined = _join_concat_literals(m_doc_write.group(1))
        if joined in ("write", "writeln"):
            line_no = _line_from_offset(code_with_str, m_doc_write.start())
            findings.append(
                LintFinding(
                    "js.unsafe_dom.document_write",
                    "error",
                    rel_path,
                    line_no,
                    f"Bracket access to document.{joined} is disallowed",
                    _snippet_at(source, line_no),
                )
            )

    if re.search(r"\bcreateElement\s*\(\s*['\"`]script['\"`]\s*\)", code_with_str):
        remote_src_pat = re.compile(
            r"(?:\.\s*src\s*=|\[\s*['\"`]src['\"`]\s*\]\s*=|\.\s*setAttribute\s*\(\s*['\"`]src['\"`]\s*,)\s*['\"`]\s*(?:https?:)?//",
            re.IGNORECASE,
        )
        for m_remote in remote_src_pat.finditer(code_with_str):
            line_no = _line_from_offset(code_with_str, m_remote.start())
            findings.append(
                LintFinding(
                    "js.remote_code.dynamic_script",
                    "error",
                    rel_path,
                    line_no,
                    "Dynamic <script> element with remote src is disallowed",
                    _snippet_at(source, line_no),
                )
            )

    for line_no, _q, lit in lexed.strings:
        decoded_lit = _decode_js_string_escapes(lit)
        if "pocketmail" in decoded_lit.lower() and not _is_allowed_pocketmail_string(decoded_lit):
            findings.append(
                LintFinding(
                    "branding.pocketmail_ui_string",
                    "error",
                    rel_path,
                    line_no,
                    f"User-facing JS string contains 'PocketMail': {decoded_lit[:120]!r}",
                    _snippet_at(source, line_no),
                )
            )

    for m_concat_str in _JS_CONCAT_CHAIN_RE.finditer(code_with_str):
        joined = _join_concat_literals(m_concat_str.group(1))
        if "pocketmail" in joined.lower() and not _is_allowed_pocketmail_string(joined):
            line_no = _line_from_offset(code_with_str, m_concat_str.start())
            findings.append(
                LintFinding(
                    "branding.pocketmail_ui_string",
                    "error",
                    rel_path,
                    line_no,
                    f"Concatenated user-facing JS string contains 'PocketMail': {joined[:120]!r}",
                    _snippet_at(source, line_no),
                )
            )

    for m_concat_tpl in _JS_CONCAT_TPL_HEAD_RE.finditer(code_with_str):
        joined = _join_concat_literals(m_concat_tpl.group(1)) + _decode_js_string_escapes(m_concat_tpl.group(2))
        if "pocketmail" in joined.lower() and not _is_allowed_pocketmail_string(joined):
            line_no = _line_from_offset(code_with_str, m_concat_tpl.start())
            findings.append(
                LintFinding(
                    "branding.pocketmail_ui_string",
                    "error",
                    rel_path,
                    line_no,
                    f"Concatenated user-facing JS template string contains 'PocketMail': {joined[:120]!r}",
                    _snippet_at(source, line_no),
                )
            )

    for t_line, raw_tpl in lexed.templates:
        if "${" not in raw_tpl:
            continue
        decoded_tpl = _decode_code_string_escapes(raw_tpl)
        for seg_line, q, seg in _lex_js(decoded_tpl).strings:
            if q != "`":
                continue
            decoded_lit = _decode_js_string_escapes(seg)
            if "pocketmail" in decoded_lit.lower() and not _is_allowed_pocketmail_string(decoded_lit):
                err_line = t_line + seg_line - 1
                findings.append(
                    LintFinding(
                        "branding.pocketmail_ui_string",
                        "error",
                        rel_path,
                        err_line,
                        f"User-facing JS template string contains 'PocketMail': {decoded_lit[:120]!r}",
                        _snippet_at(source, err_line),
                    )
                )


def _check_css_file(css_path: Path, rel_path: str, findings: list[LintFinding]) -> None:
    source = css_path.read_text(encoding="utf-8", errors="replace")
    n = len(source)
    i = 0
    line = 1
    mode = "code"  # code | comment | string
    quote_char = ""
    comment_start_line = 1
    str_start_line = 1
    brace_depth = 0
    paren_depth = 0
    cleaned: list[str] = []

    while i < n:
        ch = source[i]
        nxt = source[i + 1] if i + 1 < n else ""

        if mode == "code":
            if ch == "/" and nxt == "*":
                mode = "comment"
                comment_start_line = line
                cleaned.extend("  ")
                i += 2
                continue
            if ch in ("'", '"'):
                mode = "string"
                quote_char = ch
                str_start_line = line
                cleaned.append(ch)
                i += 1
                continue
            if ch == "{":
                brace_depth += 1
            elif ch == "}":
                brace_depth -= 1
                if brace_depth < 0:
                    findings.append(LintFinding("css.syntax.unmatched_close_brace", "error", rel_path, line, "Unexpected closing '}' in CSS"))
                    brace_depth = 0
            elif ch == "(":
                paren_depth += 1
            elif ch == ")":
                paren_depth -= 1
                if paren_depth < 0:
                    findings.append(LintFinding("css.syntax.unmatched_close_paren", "error", rel_path, line, "Unexpected closing ')' in CSS"))
                    paren_depth = 0

            cleaned.append(ch)
            if ch == "\n":
                line += 1
            i += 1
            continue

        if mode == "comment":
            if ch == "*" and nxt == "/":
                mode = "code"
                cleaned.extend("  ")
                i += 2
                continue
            cleaned.append("\n" if ch == "\n" else " ")
            if ch == "\n":
                line += 1
            i += 1
            continue

        if mode == "string":
            if ch == "\\" and i + 1 < n:
                cleaned.append(ch)
                cleaned.append(nxt)
                if nxt == "\n":
                    line += 1
                i += 2
                continue
            if ch == quote_char:
                mode = "code"
                cleaned.append(ch)
                i += 1
                continue
            cleaned.append(ch)
            if ch == "\n":
                line += 1
            i += 1

    if mode == "comment":
        findings.append(LintFinding("css.syntax.unclosed_comment", "error", rel_path, comment_start_line, "Unclosed '/*' block comment in CSS"))
    elif mode == "string":
        findings.append(LintFinding("css.syntax.unclosed_string", "error", rel_path, str_start_line, f"Unclosed {quote_char} string literal in CSS"))

    if brace_depth > 0:
        findings.append(LintFinding("css.syntax.unclosed_brace", "error", rel_path, line, f"{brace_depth} unclosed '{{' brace(s) in CSS"))
    if paren_depth > 0:
        findings.append(LintFinding("css.syntax.unclosed_paren", "error", rel_path, line, f"{paren_depth} unclosed '(' parenthesis/es in CSS"))

    cleaned_text = "".join(cleaned)
    for pat, rule, msg in (
        (re.compile(r"url\s*\(\s*['\"]?\s*(?:https?:)?//", re.IGNORECASE), "css.remote_url", "Remote url() in CSS is disallowed"),
        (re.compile(r"@import\s+(?:url\s*\(\s*)?['\"]?\s*(?:https?:)?//", re.IGNORECASE), "css.remote_import", "Remote @import in CSS is disallowed"),
        (re.compile(r"-moz-binding\b", re.IGNORECASE), "css.unsafe_moz_binding", "Legacy -moz-binding is disallowed"),
        (re.compile(r"\bexpression\s*\(", re.IGNORECASE), "css.unsafe_expression", "Legacy CSS expression() is disallowed"),
    ):
        for m in pat.finditer(cleaned_text):
            lno = _line_from_offset(cleaned_text, m.start())
            findings.append(LintFinding(rule, "error", rel_path, lno, msg, _snippet_at(source, lno)))


def _verify_js_syntax_firefox(
    js_files: list[Path],
    root: Path,
    findings: list[LintFinding],
    harness: Any = None,
) -> int:
    if not js_files:
        return 0
    if harness is not None:
        results = harness.check_js_syntax(js_files)
    else:
        try:
            from .firefox_harness import HeadlessFirefox
        except ImportError:
            lib_dir = str(Path(__file__).resolve().parent)
            if lib_dir not in sys.path:
                sys.path.insert(0, lib_dir)
            from firefox_harness import HeadlessFirefox

        with HeadlessFirefox() as fx:
            results = fx.check_js_syntax(js_files)

    checked = 0
    for item in results:
        checked += 1
        if not item.get("ok"):
            p = Path(item["path"])
            try:
                rel = p.resolve().relative_to(root.resolve()).as_posix()
            except ValueError:
                rel = p.name
            findings.append(
                LintFinding(
                    "js.syntax.firefox",
                    "error",
                    rel,
                    item.get("line"),
                    f"SpiderMonkey syntax error: {item.get('error')}",
                )
            )
    return checked


def lint_extension(
    root_dir: str | Path,
    *,
    check_firefox_js: bool = True,
    firefox_harness: Any = None,
    check_split_budget: bool = False,
    tab_watcher_max_bytes: int = 8192,
) -> dict[str, Any]:
    root = Path(root_dir).resolve()
    findings: list[LintFinding] = []

    manifest_ok = _check_manifest(root, findings)

    excluded_dirs = {"tests", ".git", ".agents", "node_modules"}

    def _collect(exts: tuple[str, ...]) -> list[Path]:
        found: list[Path] = []
        for p in root.rglob("*"):
            if not p.is_file() or p.suffix.lower() not in exts:
                continue
            rel_parts = p.relative_to(root).parts
            if any(part in excluded_dirs for part in rel_parts):
                continue
            found.append(p)
        return sorted(found)

    js_files = _collect((".js", ".mjs"))
    html_files = _collect((".html", ".htm"))
    css_files = _collect((".css",))

    for js_path in js_files:
        rel = js_path.relative_to(root).as_posix()
        _check_js_file(js_path, rel, findings)

    for html_path in html_files:
        rel = html_path.relative_to(root).as_posix()
        parser = _AmoHtmlScanner(root, html_path, rel, findings)
        parser.feed(html_path.read_text(encoding="utf-8", errors="replace"))
        parser.close()

    for css_path in css_files:
        rel = css_path.relative_to(root).as_posix()
        _check_css_file(css_path, rel, findings)

    tab_watcher_path = root / "src" / "content" / "tab-media-watcher.js"
    tab_watcher_bytes: int | None = None
    if tab_watcher_path.is_file():
        tab_watcher_bytes = tab_watcher_path.stat().st_size
        if check_split_budget:
            if tab_watcher_bytes > tab_watcher_max_bytes:
                findings.append(
                    LintFinding(
                        "arch.split_budget",
                        "error",
                        "src/content/tab-media-watcher.js",
                        None,
                        f"tab-media-watcher.js size {tab_watcher_bytes}B exceeds budget {tab_watcher_max_bytes}B",
                    )
                )
            elif tab_watcher_bytes > 4096:
                findings.append(
                    LintFinding(
                        "arch.split_budget_warn",
                        "warning",
                        "src/content/tab-media-watcher.js",
                        None,
                        f"tab-media-watcher.js size {tab_watcher_bytes}B exceeds 4096B target",
                    )
                )
    elif check_split_budget:
        findings.append(
            LintFinding(
                "arch.missing_tab_watcher",
                "error",
                "src/content/tab-media-watcher.js",
                None,
                "src/content/tab-media-watcher.js does not exist",
            )
        )

    fx_checked = 0
    if check_firefox_js:
        fx_checked = _verify_js_syntax_firefox(js_files, root, findings, harness=firefox_harness)

    errors = [f for f in findings if f.severity == "error"]
    warnings = [f for f in findings if f.severity == "warning"]

    def _has_err(prefix: str) -> bool:
        return not any(f.rule.startswith(prefix) for f in errors)

    return {
        "ok": len(errors) == 0,
        "root_dir": str(root),
        "errors": [asdict(f) for f in errors],
        "warnings": [asdict(f) for f in warnings],
        "stats": {
            "js_files": len(js_files),
            "html_files": len(html_files),
            "css_files": len(css_files),
            "tab_media_watcher_bytes": tab_watcher_bytes,
            "firefox_js_checked": fx_checked,
        },
        "checks": {
            "manifest": manifest_ok and _has_err("manifest."),
            "html": _has_err("html."),
            "js_static": _has_err("js.unsafe_") and _has_err("js.remote_"),
            "css": _has_err("css."),
            "branding": _has_err("branding."),
            "firefox_js_parse": _has_err("js.syntax.firefox") if check_firefox_js else True,
        },
    }


def main(argv: list[str] | None = None) -> int:
    lib_dir = str(Path(__file__).resolve().parent)
    if lib_dir not in sys.path:
        sys.path.insert(0, lib_dir)
    parser = argparse.ArgumentParser(description="FoxHub AMO MV2 static & SpiderMonkey linter")
    parser.add_argument("root_dir", nargs="?", default=str(Path(__file__).resolve().parent.parent.parent))
    parser.add_argument("--no-firefox", action="store_true", help="Skip headless Firefox SpiderMonkey syntax verification")
    parser.add_argument("--check-split", action="store_true", help="Enforce tab-media-watcher.js split budget")
    parser.add_argument("--json", dest="json_path", default=None, help="Write JSON lint report to path")
    args = parser.parse_args(argv)

    report = lint_extension(
        args.root_dir,
        check_firefox_js=not args.no_firefox,
        check_split_budget=args.check_split,
    )
    if args.json_path:
        out_p = Path(args.json_path)
        out_p.parent.mkdir(parents=True, exist_ok=True)
        out_p.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print(
        f"AMO Lint: {'PASS' if report['ok'] else 'FAIL'} | "
        f"errors={len(report['errors'])} warnings={len(report['warnings'])} | "
        f"js={report['stats']['js_files']} html={report['stats']['html_files']} css={report['stats']['css_files']}"
    )
    for err in report["errors"]:
        loc = f":{err['line']}" if err.get("line") else ""
        print(f"  [ERROR] {err['rule']} ({err['file']}{loc}): {err['message']}")
    for warn in report["warnings"]:
        loc = f":{warn['line']}" if warn.get("line") else ""
        print(f"  [WARN]  {warn['rule']} ({warn['file']}{loc}): {warn['message']}")
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
