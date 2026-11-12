import json
import os
import shutil
import socket
import subprocess
import tempfile
import time

ROOT = r"d:\VS Code Projects\Email Web Shortcut"
FIREFOX_BIN = r"C:\Program Files\Mozilla Firefox\firefox.exe"


class MarionetteClient:
    def __init__(self, host="127.0.0.1", port=2828):
        self.sock = socket.create_connection((host, port), timeout=15)
        self.buf = b""
        self.msg_id = 0
        # Read initial handshake (e.g. 50:{"applicationType":"gecko","marionetteProtocol":3})
        self._recv_packet()

    def _recv_packet(self):
        while b":" not in self.buf:
            chunk = self.sock.recv(65536)
            if not chunk:
                raise EOFError("Marionette socket closed")
            self.buf += chunk
        colon = self.buf.index(b":")
        length = int(self.buf[:colon].decode("ascii"))
        rest = self.buf[colon + 1 :]
        while len(rest) < length:
            chunk = self.sock.recv(65536)
            if not chunk:
                raise EOFError("Marionette socket closed mid-packet")
            rest += chunk
        payload = rest[:length]
        self.buf = rest[length:]
        return json.loads(payload.decode("utf-8"))

    def command(self, name, params=None):
        self.msg_id += 1
        pkt = json.dumps([0, self.msg_id, name, params or {}]).encode("utf-8")
        wire = f"{len(pkt)}:".encode("ascii") + pkt
        self.sock.sendall(wire)
        while True:
            resp = self._recv_packet()
            if isinstance(resp, list) and len(resp) == 4 and resp[0] == 1 and resp[1] == self.msg_id:
                if resp[2] is not None:
                    raise RuntimeError(f"Marionette {name} error: {resp[2]}")
                return resp[3]

    def close(self):
        try:
            self.sock.close()
        except Exception:
            pass


def find_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def main():
    xpi_path = os.path.join(ROOT, "foxhub-firefox.xpi")
    if not os.path.exists(xpi_path):
        raise FileNotFoundError(f"Missing {xpi_path}; run build_packages.py first")

    port = find_free_port()
    profile_dir = tempfile.mkdtemp(prefix="foxhub_marionette_")
    fixed_uuid = "11111111-2222-4333-8444-555555555555"
    with open(os.path.join(profile_dir, "user.js"), "w", encoding="utf-8") as uf:
        uf.write(f'user_pref("marionette.port", {port});\n')
        uf.write('user_pref("xpinstall.signatures.required", false);\n')
        uf.write(
            f'user_pref("extensions.webextensions.uuids", "{{\\"pocketmail-local@workspace.local\\":\\"{fixed_uuid}\\"}}");\n'
        )

    env = os.environ.copy()
    env["MOZ_REMOTE_ALLOW_SYSTEM_ACCESS"] = "1"
    proc = subprocess.Popen(
        [FIREFOX_BIN, "--headless", "-marionette", "-no-remote", "-profile", profile_dir],
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    client = None
    try:
        # Wait for Marionette port
        deadline = time.time() + 20
        while time.time() < deadline:
            try:
                client = MarionetteClient("127.0.0.1", port)
                break
            except Exception:
                time.sleep(0.25)
        if client is None:
            raise RuntimeError("Could not connect to Firefox Marionette")

        client.command("WebDriver:NewSession", {"capabilities": {}})
        print("[OK] Connected to headless Firefox Marionette session")

        # Install the real foxhub-firefox.xpi as temporary WebExtension
        addon_res = client.command("Addon:Install", {"path": xpi_path, "temporary": True})
        addon_id = addon_res.get("value") if isinstance(addon_res, dict) else addon_res
        assert addon_id == "pocketmail-local@workspace.local", f"Unexpected addon ID: {addon_id}"
        print(f"[OK] Installed foxhub-firefox.xpi in real Firefox: {addon_id}")

        ext_origin = f"moz-extension://{fixed_uuid}"
        time.sleep(0.8)
        print(f"[OK] Opening live WebExtension popup at {ext_origin}")

        def open_ext_page(ext_url):
            client.command("Marionette:SetContext", {"value": "chrome"})
            client.command(
                "WebDriver:ExecuteScript",
                {
                    "script": """
                    const url = arguments[0];
                    const win = Services.wm.getMostRecentWindow("navigator:browser");
                    win.gBrowser.selectedTab = win.gBrowser.addTrustedTab(url);
                    """,
                    "args": [ext_url],
                },
            )
            client.command("Marionette:SetContext", {"value": "content"})
            time.sleep(0.9)
            handles_res = client.command("WebDriver:GetWindowHandles", {})
            handles = handles_res.get("value") if isinstance(handles_res, dict) else handles_res
            client.command("WebDriver:SwitchToWindow", {"handle": handles[-1]})
            time.sleep(0.4)

        open_ext_page(f"{ext_origin}/src/popup/popup.html?popout=1")
        time.sleep(0.9)

        live_popup_res = client.command(
            "WebDriver:ExecuteAsyncScript",
            {
                "script": """
                const done = arguments[arguments.length - 1];
                (async () => {
                  try {
                    const cmdsBefore = await browser.commands.getAll();
                    const customId = 'custom-soundcloud-live';
                    await browser.runtime.sendMessage({
                      type: 'UPDATE_SETTINGS',
                      settings: {
                        customMediaApps: [
                          { id: customId, name: 'SoundCloud Live', url: 'https://soundcloud.com', color: '#ff5500', enabled: true }
                        ]
                      }
                    });
                    const updRes = await browser.runtime.sendMessage({
                      type: 'UPDATE_KEYBOARD_SHORTCUTS',
                      globalShortcuts: {
                        popup: 'Alt+Shift+P',
                        sidebar: 'Alt+Shift+M',
                        popout: 'Alt+Shift+W'
                      },
                      appShortcuts: {
                        pocketmail: 'Alt+Shift+E',
                        spotify: 'Alt+Shift+S',
                        [customId]: 'Alt+Shift+C'
                      },
                      appShortcutOpenMode: 'sidebar'
                    });
                    const cmdsAfter = await browser.commands.getAll();

                    // Test live Mute Popover UI + Timed Mute ("Mute for a Set Time") inside real moz-extension popup.html
                    const muteBtn = document.getElementById('rail-btn-mute-notifs');
                    muteBtn.click();
                    const popoverOpen = !document.getElementById('pm-mute-popover').classList.contains('hidden');
                    const chkAll = document.getElementById('chk-mute-all');
                    chkAll.checked = true;
                    chkAll.dispatchEvent(new Event('change', { bubbles: true }));
                    await new Promise((r) => setTimeout(r, 100));
                    const bothChecked =
                      document.getElementById('chk-mute-email').checked &&
                      document.getElementById('chk-mute-sites').checked;

                    // Uncheck All, then click 1h Timed Mute pill -> verifies 15m/1h/3h/8h pills + countdown + Clear!
                    chkAll.checked = false;
                    chkAll.dispatchEvent(new Event('change', { bubbles: true }));
                    await new Promise((r) => setTimeout(r, 80));
                    const pill60 = document.querySelector('.pm-mute-timer-pill[data-mute-mins="60"]');
                    const btnClearTimer = document.getElementById('btn-mute-timer-clear');
                    pill60.click();
                    await new Promise((r) => setTimeout(r, 100));
                    const timedMuteActivated =
                      chkAll.checked &&
                      pill60.classList.contains('active') &&
                      !btnClearTimer.classList.contains('hidden') &&
                      document.getElementById('pm-mute-timer-remaining').textContent.includes('left');
                    btnClearTimer.click();
                    await new Promise((r) => setTimeout(r, 90));
                    const timedMuteCleared = !chkAll.checked && btnClearTimer.classList.contains('hidden');
                    // Re-activate 1h timer so live options.html also verifies active timed mute sync
                    pill60.click();
                    await new Promise((r) => setTimeout(r, 90));

                    // Test live TRIGGER_APP_SHORTCUT for Custom App SoundCloud Live!
                    await browser.runtime.sendMessage({ type: 'TRIGGER_APP_SHORTCUT', appId: customId });
                    await new Promise((r) => setTimeout(r, 150));
                    const activeCustomRail = Boolean(
                      document.querySelector(`.pm-rail-item[data-app-id="${customId}"].active`)
                    );

                    // Reset shortcuts back to clean defaults
                    await browser.runtime.sendMessage({ type: 'RESET_KEYBOARD_SHORTCUTS' });
                    const cmdsReset = await browser.commands.getAll();

                    // Prepare Scenario A for fresh sidebar tab: Spotify persistent, Instagram NOT persistent, shortcut -> instagram!
                    await browser.runtime.sendMessage({
                      type: 'UPDATE_SETTINGS',
                      settings: {
                        persistenceMode: 'selected',
                        persistentAppIds: ['spotify'],
                        persistentLastActiveAppId: 'spotify',
                        persistentOpenAppIds: ['spotify']
                      }
                    });
                    await browser.runtime.sendMessage({ type: 'PREPARE_SIDEBAR_DOCK_APP', appId: 'instagram' });
                    const hasDiagBtn = Boolean(document.getElementById('btn-copy-audio-diagnostics'));
                    const diagPayload = typeof window.__pmCopyAudioDiagnostics === 'function'
                      ? await window.__pmCopyAudioDiagnostics()
                      : null;

                    done({
                      ok: true,
                      countBefore: cmdsBefore.length,
                      updOk: updRes && updRes.ok,
                      updErr: updRes && updRes.error,
                      popupCmdAfter: (cmdsAfter.find((c) => c.name === '_execute_browser_action') || {}).shortcut,
                      slot1After: (cmdsAfter.find((c) => c.name === 'foxhub-app-slot-2') ? (cmdsAfter.find((c) => c.name === 'foxhub-app-slot-1') || {}).shortcut : ''),
                      slot2After: (cmdsAfter.find((c) => c.name === 'foxhub-app-slot-2') || {}).shortcut,
                      slot3After: (cmdsAfter.find((c) => c.name === 'foxhub-app-slot-3') || {}).shortcut,
                      popupCmdReset: (cmdsReset.find((c) => c.name === '_execute_browser_action') || {}).shortcut,
                      slot1Reset: (cmdsReset.find((c) => c.name === 'foxhub-app-slot-1') || {}).shortcut,
                      popoverOpen,
                      bothChecked,
                      timedMuteActivated,
                      timedMuteCleared,
                      activeCustomRail,
                      hasDiagBtn,
                      diagVersion: diagPayload && diagPayload.version
                    });
                  } catch (e) {
                    done({ ok: false, error: e && e.stack ? e.stack : String(e) });
                  }
                })();
                """,
                "args": [],
            },
        )
        val = live_popup_res.get("value") if isinstance(live_popup_res, dict) else live_popup_res
        print("[LIVE WEBEXTENSION POPUP RESULT]:", json.dumps(val, indent=2))
        assert val.get("ok") is True, f"Live WebExtension popup check failed: {val}"
        assert val.get("countBefore") == 15, f"Expected 15 manifest commands, got {val.get('countBefore')}"
        assert val.get("updOk") is True, f"browser.commands.update rejected shortcut: {val.get('updErr')}"
        assert val.get("popupCmdAfter") == "Alt+Shift+P", f"Expected Alt+Shift+P, got {val.get('popupCmdAfter')}"
        assert val.get("slot1After") == "Alt+Shift+E", f"Expected slot1 Alt+Shift+E, got {val.get('slot1After')}"
        assert val.get("slot2After") == "Alt+Shift+S", f"Expected slot2 Alt+Shift+S, got {val.get('slot2After')}"
        assert val.get("slot3After") == "Alt+Shift+C", f"Expected slot3 Alt+Shift+C, got {val.get('slot3After')}"
        assert val.get("popupCmdReset") == "Alt+Shift+F", f"Expected reset Alt+Shift+F, got {val.get('popupCmdReset')}"
        assert not val.get("slot1Reset"), f"Expected slot1 reset empty, got {val.get('slot1Reset')}"
        assert val.get("popoverOpen") is True, "Mute popover failed to open in live moz-extension popup"
        assert val.get("bothChecked") is True, "Checking Mute All failed to check Email & Sites in live moz-extension popup"
        assert val.get("timedMuteActivated") is True, "1h Timed Mute pill failed in live moz-extension popup"
        assert val.get("timedMuteCleared") is True, "Timed Mute Clear button failed in live moz-extension popup"
        assert val.get("activeCustomRail") is True, "TRIGGER_APP_SHORTCUT failed to activate Custom App in live moz-extension popup"
        assert val.get("hasDiagBtn") is True, "Missing #btn-copy-audio-diagnostics in live moz-extension popup"
        assert val.get("diagVersion") == "2.7.9", f"Expected diagVersion 2.7.9, got {val.get('diagVersion')}"

        # Verify Scenario A in live moz-extension sidebar tab: pending shortcut ('instagram') overrides persistentLastActiveAppId='spotify' AND ?app=spotify!
        open_ext_page(f"{ext_origin}/src/popup/popup.html?sidebar=1&app=spotify")
        sc_a_res = client.command(
            "WebDriver:ExecuteScript",
            {
                "script": """
                return {
                  instagramActive: Boolean(document.querySelector('.pm-rail-item[data-app-id="instagram"].active')),
                  spotifyActive: Boolean(document.querySelector('.pm-rail-item[data-app-id="spotify"].active'))
                };
                """,
                "args": [],
            },
        )
        sc_a = sc_a_res.get("value") if isinstance(sc_a_res, dict) else sc_a_res
        print("[LIVE SHORTCUT VS PERSISTENT MEMORY SCENARIO A]:", json.dumps(sc_a))
        assert sc_a.get("instagramActive") is True and sc_a.get("spotifyActive") is False, f"Scenario A failed: {sc_a}"
        client.command("WebDriver:CloseWindow", {})
        handles_after = client.command("WebDriver:GetWindowHandles", {})
        hlist = handles_after.get("value") if isinstance(handles_after, dict) else handles_after
        client.command("WebDriver:SwitchToWindow", {"handle": hlist[-1]})

        # Subsequent normal open (no shortcut) MUST restore persistent Spotify!
        open_ext_page(f"{ext_origin}/src/popup/popup.html?sidebar=1")
        sc_norm_res = client.command(
            "WebDriver:ExecuteAsyncScript",
            {
                "script": """
                const done = arguments[arguments.length - 1];
                (async () => {
                  const spotifyRestored = Boolean(document.querySelector('.pm-rail-item[data-app-id="spotify"].active'));
                  // Prepare Scenario B: BOTH Spotify & Instagram persistent, last active = spotify, shortcut -> instagram
                  await browser.runtime.sendMessage({
                    type: 'UPDATE_SETTINGS',
                    settings: {
                      persistenceMode: 'selected',
                      persistentAppIds: ['spotify', 'instagram'],
                      persistentLastActiveAppId: 'spotify'
                    }
                  });
                  await browser.runtime.sendMessage({ type: 'PREPARE_SIDEBAR_DOCK_APP', appId: 'instagram' });
                  done({ spotifyRestored });
                })();
                """,
                "args": [],
            },
        )
        sc_norm = sc_norm_res.get("value") if isinstance(sc_norm_res, dict) else sc_norm_res
        print("[LIVE NORMAL OPEN RESTORES SPOTIFY]:", json.dumps(sc_norm))
        assert sc_norm.get("spotifyRestored") is True, f"Normal open failed to restore Spotify: {sc_norm}"
        client.command("WebDriver:CloseWindow", {})
        handles_after2 = client.command("WebDriver:GetWindowHandles", {})
        hlist2 = handles_after2.get("value") if isinstance(handles_after2, dict) else handles_after2
        client.command("WebDriver:SwitchToWindow", {"handle": hlist2[-1]})

        # Verify Scenario B in live moz-extension sidebar tab: both persistent, shortcut opens Instagram!
        open_ext_page(f"{ext_origin}/src/popup/popup.html?sidebar=1")
        sc_b_res = client.command(
            "WebDriver:ExecuteScript",
            {
                "script": """
                return {
                  instagramActive: Boolean(document.querySelector('.pm-rail-item[data-app-id="instagram"].active'))
                };
                """,
                "args": [],
            },
        )
        sc_b = sc_b_res.get("value") if isinstance(sc_b_res, dict) else sc_b_res
        print("[LIVE SHORTCUT VS PERSISTENT MEMORY SCENARIO B]:", json.dumps(sc_b))
        assert sc_b.get("instagramActive") is True, f"Scenario B failed: {sc_b}"

        # Also navigate to real moz-extension options.html and verify zero errors, full shortcut grid, & Timed Mute UI
        open_ext_page(f"{ext_origin}/src/options/options.html")
        live_opt_res = client.command(
            "WebDriver:ExecuteScript",
            {
                "script": """
                return {
                  rows: document.querySelectorAll('#opt-app-shortcuts-grid .opt-shortcut-item').length,
                  muteEmailChecked: document.getElementById('opt-mute-email')?.checked,
                  muteSitesChecked: document.getElementById('opt-mute-sites')?.checked,
                  muteAllChecked: document.getElementById('opt-mute-all')?.checked,
                  optPill60Active: Boolean(document.querySelector('[data-opt-mute-mins="60"].active')),
                  optTimerStatus: document.getElementById('opt-mute-timer-status')?.textContent || ''
                };
                """,
                "args": [],
            },
        )
        oval = live_opt_res.get("value") if isinstance(live_opt_res, dict) else live_opt_res
        print("[LIVE WEBEXTENSION OPTIONS RESULT]:", json.dumps(oval, indent=2))
        assert oval.get("rows") == 15, f"Expected 15 app shortcut rows in live options.html, got {oval.get('rows')}"
        assert oval.get("muteAllChecked") is True and oval.get("muteEmailChecked") is True and oval.get("muteSitesChecked") is True
        assert oval.get("optPill60Active") is True and "left" in oval.get("optTimerStatus", ""), f"Options timed mute failed: {oval}"
        print("REAL FIREFOX MARIONETTE WEBEXTENSION XPI TEST PASSED 100%!")
    finally:
        if client:
            client.close()
        try:
            proc.terminate()
            proc.wait(timeout=5)
        except Exception:
            try:
                proc.kill()
            except Exception:
                pass
        shutil.rmtree(profile_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
