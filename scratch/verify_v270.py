import json
import os
import re
import sys

ROOT = r"d:\VS Code Projects\Email Web Shortcut"

# 1. Manifest JSON check
with open(os.path.join(ROOT, "manifest.json"), "r", encoding="utf-8") as f:
    manifest = json.load(f)
assert manifest["version"] == "2.7.9", f"Expected 2.7.9, got {manifest['version']}"
cmds = manifest.get("commands", {})
for req_cmd in [
    "_execute_browser_action",
    "_execute_sidebar_action",
    "open-foxhub-popout",
    *[f"foxhub-app-slot-{i}" for i in range(1, 13)],
]:
    assert req_cmd in cmds, f"Missing command {req_cmd} in manifest.json"
print("[OK] manifest.json version:", manifest["version"], f"({len(cmds)} commands)")


# 2. Full JS Lexer + Bracket Balance + Block-Scope Duplicate const/let + Zero innerHTML check
def check_js_file(path):
    with open(path, "r", encoding="utf-8") as f:
        code = f.read()

    # Check innerHTML / outerHTML assignment
    if re.search(r"\.(innerHTML|outerHTML)\s*=", code):
        raise AssertionError(f"Forbidden innerHTML/outerHTML assignment in {path}")

    n = len(code)
    i = 0
    line = 1
    stack = []  # (char, line)
    scope_stack = [set()]  # block scopes for const/let
    tokens = []
    prev_sig = ""  # last significant token text

    regex_prev_keywords = {
        "return", "typeof", "instanceof", "in", "of", "delete", "void",
        "throw", "case", "new", "await", "yield", "else", "do"
    }

    while i < n:
        c = code[i]
        if c == "\n":
            line += 1
            i += 1
            continue
        if c in " \t\r":
            i += 1
            continue
        # Line comment
        if c == "/" and i + 1 < n and code[i + 1] == "/":
            i += 2
            while i < n and code[i] != "\n":
                i += 1
            continue
        # Block comment
        if c == "/" and i + 1 < n and code[i + 1] == "*":
            start_l = line
            i += 2
            while i + 1 < n and not (code[i] == "*" and code[i + 1] == "/"):
                if code[i] == "\n":
                    line += 1
                i += 1
            if i + 1 >= n:
                raise AssertionError(f"Unclosed block comment in {path} at line {start_l}")
            i += 2
            continue
        # Single or double string
        if c in ("'", '"'):
            q = c
            start_l = line
            i += 1
            while i < n and code[i] != q:
                if code[i] == "\\":
                    i += 2
                    continue
                if code[i] == "\n":
                    raise AssertionError(f"Unterminated string in {path} at line {start_l}")
                i += 1
            if i >= n:
                raise AssertionError(f"Unterminated string in {path} at line {start_l}")
            i += 1
            prev_sig = "STR"
            tokens.append(("STR", q, line))
            continue
        # Template literal
        if c == "`":
            stack.append(("`", line))
            i += 1
            while i < n:
                if code[i] == "\\":
                    if code[i + 1 : i + 2] == "\n":
                        line += 1
                    i += 2
                    continue
                if code[i] == "\n":
                    line += 1
                    i += 1
                    continue
                if code[i] == "`":
                    stack.pop()
                    i += 1
                    prev_sig = "TPL"
                    tokens.append(("TPL", "`", line))
                    break
                if code[i] == "$" and i + 1 < n and code[i + 1] == "{":
                    stack.append(("${", line))
                    scope_stack.append(set())
                    i += 2
                    prev_sig = "${"
                    tokens.append(("PUNC", "${", line))
                    break
                i += 1
            continue
        # If closing a ${ ... } inside template literal
        if c == "}" and stack and stack[-1][0] == "${":
            stack.pop()
            scope_stack.pop()
            i += 1
            # Continue scanning template literal tail!
            while i < n:
                if code[i] == "\\":
                    if code[i + 1 : i + 2] == "\n":
                        line += 1
                    i += 2
                    continue
                if code[i] == "\n":
                    line += 1
                    i += 1
                    continue
                if code[i] == "`":
                    if not stack or stack[-1][0] != "`":
                        raise AssertionError(f"Template stack mismatch in {path} at line {line}")
                    stack.pop()
                    i += 1
                    prev_sig = "TPL"
                    tokens.append(("TPL", "`", line))
                    break
                if code[i] == "$" and i + 1 < n and code[i + 1] == "{":
                    stack.append(("${", line))
                    scope_stack.append(set())
                    i += 2
                    prev_sig = "${"
                    tokens.append(("PUNC", "${", line))
                    break
                i += 1
            continue
        # Regex literal heuristic
        if c == "/":
            can_be_regex = (
                prev_sig == ""
                or prev_sig in ("(", "[", "{", ",", ";", ":", "=", "==", "===", "!=", "!==", "!", "&&", "||", "??", "?", "+", "-", "*", "%", "~", "^", "&", "|", "<", ">", "<=", ">=", "=>", "${")
                or prev_sig in regex_prev_keywords
            )
            if can_be_regex and not (i + 1 < n and code[i + 1] == "=" and prev_sig in ("IDENT", ")", "]")):
                start_l = line
                i += 1
                in_class = False
                while i < n:
                    rc = code[i]
                    if rc == "\\":
                        i += 2
                        continue
                    if rc == "[":
                        in_class = True
                    elif rc == "]":
                        in_class = False
                    elif rc == "/" and not in_class:
                        i += 1
                        while i < n and code[i].isalpha():
                            i += 1
                        break
                    elif rc == "\n":
                        raise AssertionError(f"Unterminated regex in {path} at line {start_l}")
                    i += 1
                prev_sig = "REGEX"
                tokens.append(("REGEX", "/", line))
                continue

        # Identifier / Keyword
        if c.isalpha() or c in ("_", "$"):
            start = i
            while i < n and (code[i].isalnum() or code[i] in ("_", "$")):
                i += 1
            word = code[start:i]
            tokens.append(("ID", word, line, id(scope_stack[-1]), scope_stack[-1]))
            prev_sig = word if word in regex_prev_keywords or word in ("const", "let", "var", "function") else "IDENT"
            continue

        # Numbers
        if c.isdigit():
            while i < n and (code[i].isalnum() or code[i] in (".", "_")):
                i += 1
            prev_sig = "NUM"
            tokens.append(("NUM", "0", line))
            continue

        # Brackets
        if c in "([{":
            stack.append((c, line))
            if c == "{":
                scope_stack.append(set())
            i += 1
            prev_sig = c
            tokens.append(("PUNC", c, line))
            continue
        if c in ")]}":
            expected = {")": "(", "]": "[", "}": "{"}[c]
            if not stack or stack[-1][0] != expected:
                raise AssertionError(
                    f"Mismatched '{c}' at {path}:{line} (top of stack: {stack[-1] if stack else 'EMPTY'})"
                )
            stack.pop()
            if c == "}":
                scope_stack.pop()
            i += 1
            prev_sig = c
            tokens.append(("PUNC", c, line))
            continue

        # Multi-char operators
        two = code[i : i + 2]
        three = code[i : i + 3]
        if three in ("===", "!=="):
            i += 3
            prev_sig = three
            tokens.append(("OP", three, line))
            continue
        if two in ("==", "!=", "<=", ">=", "&&", "||", "??", "=>"):
            i += 2
            prev_sig = two
            tokens.append(("OP", two, line))
            continue

        i += 1
        prev_sig = c
        tokens.append(("OP", c, line))

    if stack:
        raise AssertionError(f"Unclosed bracket/template in {path}: {stack[-3:]}")

    # Check exact block-scope duplicate const/let declarations using pass-1 scope sets
    idx = 0
    tlen = len(tokens)
    while idx < tlen:
        tk = tokens[idx]
        if tk[0] == "ID" and tk[1] in ("const", "let"):
            prev_tk = tokens[idx - 1] if idx > 0 else ("", "", 0)
            if prev_tk[1] != "." and idx + 1 < tlen and tokens[idx + 1][0] == "ID":
                var_name = tokens[idx + 1][1]
                var_line = tokens[idx + 1][2]
                scope_set = tokens[idx + 1][4]
                prev2 = tokens[idx - 1] if idx >= 1 else ("", "", 0)
                prev3 = tokens[idx - 2] if idx >= 2 else ("", "", 0)
                prev4 = tokens[idx - 3] if idx >= 3 else ("", "", 0)
                in_for_paren = prev2[1] == "(" and (prev3[1] == "for" or (prev3[1] == "await" and prev4[1] == "for"))
                if not in_for_paren:
                    if var_name in scope_set:
                        raise AssertionError(
                            f"Duplicate '{tk[1]} {var_name}' in same block scope at {path}:{var_line}"
                        )
                    scope_set.add(var_name)
        idx += 1

    print(f"[OK] JS verified: {os.path.relpath(path, ROOT)} ({line} lines)")


for root_dir, _, files in os.walk(os.path.join(ROOT, "src")):
    for fn in sorted(files):
        fp = os.path.join(root_dir, fn)
        if fn.endswith(".js"):
            check_js_file(fp)
        elif fn.endswith(".css"):
            with open(fp, "r", encoding="utf-8") as cf:
                css = cf.read()
            # Strip comments & strings before counting braces
            css_clean = re.sub(r"/\*[\s\S]*?\*/", "", css)
            css_clean = re.sub(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'', '""', css_clean)
            opens = css_clean.count("{")
            closes = css_clean.count("}")
            assert opens == closes, f"CSS brace mismatch in {fp}: {opens} != {closes}"
            print(f"[OK] CSS verified: {os.path.relpath(fp, ROOT)} ({opens} rules)")

# 3. Verify HTML IDs and zero duplicate IDs in popup.html & options.html
for rel_html, req_ids in [
    (
        os.path.join("src", "popup", "popup.html"),
        [
            "rail-btn-manage-apps",
            "rail-btn-sidebar-settings",
            "rail-btn-mute-notifs",
            "btn-dnd",
            "pm-mute-popover",
            "pm-mute-popover-badge",
            "chk-mute-all",
            "chk-mute-email",
            "chk-mute-sites",
            "pm-mute-timer-remaining",
            "btn-mute-timer-clear",
            "btn-sc-global-popup",
            "btn-sc-global-sidebar",
            "btn-sc-global-popout",
            "btn-sc-app-pocketmail",
            "btn-sc-clear-pocketmail",
            "opt-app-shortcut-mode-grid",
            "btn-reset-shortcuts-drawer",
            "btn-open-full-settings-drawer",
            "pm-pinned-apps-heading",
            "pm-media-loader",
            "pm-settings-gear-coachmark",
            "pm-settings-coachmark-body",
            "btn-dismiss-settings-coachmark",
            "chk-custom-video-loadbar",
            "pm-loadbar-customizer-wrap",
            "input-loadbar-custom-color",
            "opt-loadbar-style-grid",
            "opt-loadbar-size-grid",
            "btn-copy-audio-diagnostics",
        ],
    ),
    (
        os.path.join("src", "options", "options.html"),
        [
            "opt-mute-all",
            "opt-mute-email",
            "opt-mute-sites",
            "opt-mute-timer-status",
            "opt-btn-mute-timer-clear",
            "opt-sc-global-popup",
            "opt-sc-global-sidebar",
            "opt-sc-global-popout",
            "opt-app-shortcut-open-mode",
            "opt-btn-reset-shortcuts",
            "opt-app-shortcuts-grid",
        ],
    ),
]:
    with open(os.path.join(ROOT, rel_html), "r", encoding="utf-8") as hf:
        html = hf.read()
    found_ids = re.findall(r'\bid="([^"]+)"', html)
    seen = set()
    dups = []
    for hid in found_ids:
        if hid in seen:
            dups.append(hid)
        seen.add(hid)
    assert not dups, f"Duplicate HTML IDs in {rel_html}: {dups}"
    for required_id in req_ids:
        assert required_id in seen, f"Missing id={required_id} in {rel_html}"
    if "popup.html" in rel_html:
        assert "pm-media-freeze-frame" not in seen, "pm-media-freeze-frame must not exist in popup.html"
    print(f"[OK] {rel_html} verified ({len(seen)} unique IDs, 0 duplicates)")

print("ALL CHECKS PASSED!")
