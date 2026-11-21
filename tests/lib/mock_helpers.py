"""Python helper wrappers over HeadlessFirefox for driving tests/lib/webext_mock.js."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

_DEFAULT_ROOT = Path(__file__).resolve().parent.parent.parent
_DEFAULT_MOCK_JS = Path(__file__).resolve().parent / "webext_mock.js"


def load_manifest(root_dir: str | Path | None = None) -> dict[str, Any]:
    root = Path(root_dir) if root_dir is not None else _DEFAULT_ROOT
    return json.loads((root / "manifest.json").read_text(encoding="utf-8"))


def build_mock_init_script(
    manifest: dict[str, Any] | None = None,
    storage_seed: dict[str, Any] | None = None,
    base_url: str | None = None,
    sender_tab: dict[str, Any] | None = None,
    mock_js_path: str | Path | None = None,
) -> str:
    js_path = Path(mock_js_path) if mock_js_path is not None else _DEFAULT_MOCK_JS
    base_code = js_path.read_text(encoding="utf-8")
    cfg: dict[str, Any] = {}
    if manifest is not None:
        cfg["manifest"] = manifest
    if storage_seed is not None:
        cfg["storage"] = storage_seed
    if base_url is not None:
        cfg["baseUrl"] = base_url
    if sender_tab is not None:
        cfg["senderTab"] = sender_tab
    if cfg:
        return base_code + f"\nwindow.__webextMock.configure({json.dumps(cfg)});\n"
    return base_code


def inject_mock(
    harness: Any,
    manifest: dict[str, Any] | None = None,
    storage_seed: dict[str, Any] | None = None,
    base_url: str | None = None,
    sender_tab: dict[str, Any] | None = None,
) -> None:
    script = build_mock_init_script(
        manifest=manifest,
        storage_seed=storage_seed,
        base_url=base_url,
        sender_tab=sender_tab,
    )
    harness.eval_js(script)


def seed_storage(harness: Any, data: dict[str, Any], silent: bool = True) -> None:
    harness.eval_js("window.__webextMock.storage.seed(arguments[0], arguments[1]);", data, bool(silent))


def get_storage(harness: Any, keys: Any = None) -> dict[str, Any]:
    if keys is None:
        return harness.eval_js("return window.__webextMock.storage.dump();")
    return harness.eval_async_js(
        "return await browser.storage.local.get(arguments[0]);",
        keys,
    )


def clear_storage(harness: Any, silent: bool = True) -> None:
    harness.eval_js("window.__webextMock.storage.clear(arguments[0]);", bool(silent))


def get_calls(harness: Any, prefix: str | None = None) -> list[dict[str, Any]]:
    return harness.eval_js("return window.__webextMock.getCalls(arguments[0]);", prefix)


def clear_calls(harness: Any) -> None:
    harness.eval_js("window.__webextMock.clearCalls();")


def set_message_responses(harness: Any, mapping: dict[str, Any]) -> None:
    harness.eval_js("window.__webextMock.runtime.setMessageResponses(arguments[0]);", mapping)


def trigger_command(harness: Any, command_name: str, tab: dict[str, Any] | None = None) -> Any:
    return harness.eval_async_js(
        "const res = window.__webextMock.commands.trigger(arguments[0], arguments[1]);\n"
        "return await Promise.all(Array.isArray(res) ? res : [res]);",
        command_name,
        tab,
    )


def get_context_menus(harness: Any) -> list[dict[str, Any]]:
    return harness.eval_js("return window.__webextMock.contextMenus.list();")


def trigger_context_menu_click(
    harness: Any,
    menu_item_id: str,
    link_url: str | None = None,
    page_url: str | None = None,
    tab: dict[str, Any] | None = None,
) -> Any:
    info: dict[str, Any] = {"menuItemId": menu_item_id}
    if link_url is not None:
        info["linkUrl"] = link_url
    if page_url is not None:
        info["pageUrl"] = page_url
    return harness.eval_async_js(
        "const res = window.__webextMock.contextMenus.triggerClick(arguments[0], arguments[1]);\n"
        "return await Promise.all(Array.isArray(res) ? res : [res]);",
        info,
        tab,
    )


def trigger_before_send_headers(
    harness: Any,
    url: str,
    request_headers: list[dict[str, str]] | None = None,
    req_type: str = "sub_frame",
    tab_id: int = -1,
    origin_url: str | None = None,
    document_url: str | None = None,
) -> dict[str, Any]:
    details: dict[str, Any] = {
        "url": url,
        "type": req_type,
        "tabId": tab_id,
        "requestHeaders": request_headers or [],
    }
    if origin_url is not None:
        details["originUrl"] = origin_url
    if document_url is not None:
        details["documentUrl"] = document_url
    return harness.eval_async_js(
        "return await window.__webextMock.webRequest.triggerBeforeSendHeaders(arguments[0]);",
        details,
    )


def trigger_headers_received(
    harness: Any,
    url: str,
    response_headers: list[dict[str, str]] | None = None,
    status_code: int = 200,
    req_type: str = "sub_frame",
    tab_id: int = -1,
    origin_url: str | None = None,
) -> dict[str, Any]:
    details: dict[str, Any] = {
        "url": url,
        "type": req_type,
        "tabId": tab_id,
        "statusCode": status_code,
        "responseHeaders": response_headers or [],
    }
    if origin_url is not None:
        details["originUrl"] = origin_url
    return harness.eval_async_js(
        "return await window.__webextMock.webRequest.triggerHeadersReceived(arguments[0]);",
        details,
    )


def trigger_before_request(
    harness: Any,
    url: str,
    req_type: str = "sub_frame",
    tab_id: int = -1,
    origin_url: str | None = None,
) -> dict[str, Any]:
    details: dict[str, Any] = {
        "url": url,
        "type": req_type,
        "tabId": tab_id,
    }
    if origin_url is not None:
        details["originUrl"] = origin_url
    return harness.eval_async_js(
        "return await window.__webextMock.webRequest.triggerBeforeRequest(arguments[0]);",
        details,
    )


def seed_tabs(harness: Any, tabs: list[dict[str, Any]]) -> None:
    harness.eval_js("window.__webextMock.tabs.seed(arguments[0]);", tabs)


def trigger_tab_updated(
    harness: Any,
    tab_id: int,
    change_info: dict[str, Any],
    tab_patch: dict[str, Any] | None = None,
) -> Any:
    return harness.eval_async_js(
        "const res = window.__webextMock.tabs.triggerUpdated(arguments[0], arguments[1], arguments[2]);\n"
        "return await Promise.all(Array.isArray(res) ? res : [res]);",
        tab_id,
        change_info,
        tab_patch,
    )


def trigger_tab_activated(harness: Any, tab_id: int, window_id: int = 1) -> Any:
    return harness.eval_async_js(
        "const res = window.__webextMock.tabs.triggerActivated(arguments[0], arguments[1]);\n"
        "return await Promise.all(Array.isArray(res) ? res : [res]);",
        tab_id,
        window_id,
    )


def trigger_tab_removed(harness: Any, tab_id: int) -> Any:
    return harness.eval_async_js(
        "const res = window.__webextMock.tabs.triggerRemoved(arguments[0]);\n"
        "return await Promise.all(Array.isArray(res) ? res : [res]);",
        tab_id,
    )


def set_tab_message_result(harness: Any, tab_id: int, result: Any) -> None:
    harness.eval_js(
        "window.__webextMock.tabs.setTabMessageResult(arguments[0], arguments[1]);",
        tab_id,
        result,
    )


def seed_cookies(harness: Any, cookies: list[dict[str, Any]]) -> None:
    harness.eval_js("window.__webextMock.cookies.seed(arguments[0]);", cookies)


def get_cookies(harness: Any, details: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    return harness.eval_async_js(
        "return await browser.cookies.getAll(arguments[0] || {});",
        details,
    )


def get_sidebar_state(harness: Any) -> dict[str, Any]:
    return harness.eval_js("return window.__webextMock.sidebarAction.getState();")


def get_browser_action_state(harness: Any) -> dict[str, Any]:
    return harness.eval_js("return window.__webextMock.browserAction.getState();")
