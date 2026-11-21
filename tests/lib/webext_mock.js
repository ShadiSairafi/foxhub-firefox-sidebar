(function initFoxHubWebExtMock() {
  "use strict";

  const DEFAULT_MANIFEST = {
    manifest_version: 2,
    name: "FoxHub: Gmail, Social & Media Sidebar",
    short_name: "FoxHub",
    version: "2.8.0",
    permissions: [
      "<all_urls>",
      "*://mail.google.com/*",
      "*://accounts.google.com/*",
      "https://www.googleapis.com/*",
      "cookies",
      "storage",
      "notifications",
      "alarms",
      "tabs",
      "identity",
      "webRequest",
      "webRequestBlocking",
      "contextMenus",
    ],
    browser_specific_settings: {
      gecko: {
        id: "pocketmail-local@workspace.local",
        strict_min_version: "142.0",
      },
    },
  };

  function safeClone(val) {
    if (val === undefined) return undefined;
    if (val === null || typeof val !== "object") {
      return typeof val === "function" ? "[Function]" : val;
    }
    try {
      return JSON.parse(JSON.stringify(val));
    } catch (_err) {
      if (Array.isArray(val)) {
        return val.map((item) => safeClone(item));
      }
      const out = {};
      for (const k of Object.keys(val)) {
        const v = val[k];
        if (typeof v !== "function") {
          out[k] = v === null || typeof v !== "object" ? v : String(v);
        }
      }
      return out;
    }
  }

  function makeEvent() {
    const listeners = [];
    return {
      addListener(fn) {
        if (typeof fn === "function" && !listeners.includes(fn)) {
          listeners.push(fn);
        }
      },
      removeListener(fn) {
        const idx = listeners.indexOf(fn);
        if (idx !== -1) listeners.splice(idx, 1);
      },
      hasListener(fn) {
        return listeners.includes(fn);
      },
      hasListeners() {
        return listeners.length > 0;
      },
      _listeners: listeners,
      _fire(...args) {
        const snapshot = listeners.slice();
        const results = [];
        for (const fn of snapshot) {
          results.push(fn(...args));
        }
        return results;
      },
      _clear() {
        listeners.length = 0;
      },
    };
  }

  function patternToRegex(pattern) {
    if (pattern === "<all_urls>") {
      return /^(?:https?|wss?|file|ftp|moz-extension):\/\/.*$/i;
    }
    const m = /^(\*|https?|wss?|ftp|file):\/\/([^/]+)(\/.*)$/i.exec(pattern);
    if (!m) {
      const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
      return new RegExp("^" + escaped + "$", "i");
    }
    const schemePart = m[1] === "*" ? "(?:https?|wss?)" : m[1].replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    let hostPart;
    if (m[2] === "*") {
      hostPart = "[^/]+";
    } else if (m[2].startsWith("*.")) {
      const rest = m[2].slice(2).replace(/[.+?^${}()|[\]\\]/g, "\\$&");
      hostPart = "(?:[^/]+\\.)?" + rest;
    } else {
      hostPart = m[2].replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*");
    }
    const pathPart = m[3].replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp("^" + schemePart + "://" + hostPart + pathPart + "$", "i");
  }

  function matchesUrlPatterns(url, patterns) {
    if (!patterns || patterns.length === 0) return true;
    for (const p of patterns) {
      if (patternToRegex(String(p)).test(String(url))) {
        return true;
      }
    }
    return false;
  }

  function defaultBaseUrl() {
    if (
      typeof window !== "undefined" &&
      window.location &&
      (window.location.protocol === "http:" || window.location.protocol === "https:")
    ) {
      return window.location.origin + "/";
    }
    return "moz-extension://foxhub-test-uuid/";
  }

  // Mutable state reset via __webextMock.reset()
  let state;

  function createInitialState() {
    return {
      callLog: [],
      storageLocal: Object.create(null),
      manifest: safeClone(DEFAULT_MANIFEST),
      extensionId: "pocketmail-local@workspace.local",
      baseUrl: defaultBaseUrl(),
      backgroundPage: null,
      lastError: null,
      senderTab: { id: 1, windowId: 1, url: defaultBaseUrl() + "src/popup/popup.html" },
      customMessageHandler: null,
      messageResponses: Object.create(null),
      ports: [],
      tabs: [
        {
          id: 1,
          windowId: 1,
          index: 0,
          active: true,
          highlighted: true,
          pinned: false,
          audible: false,
          mutedInfo: { muted: false },
          title: "New Tab",
          url: "about:blank",
          status: "complete",
        },
      ],
      nextTabId: 2,
      tabMessageHandlers: Object.create(null),
      tabMessageResults: Object.create(null),
      windows: [
        {
          id: 1,
          focused: true,
          top: 0,
          left: 0,
          width: 1200,
          height: 800,
          type: "normal",
          state: "normal",
          incognito: false,
          alwaysOnTop: false,
        },
      ],
      nextWindowId: 2,
      sidebarState: {
        isOpen: false,
        panel: "src/popup/popup.html?sidebar=1",
        title: "FoxHub",
        icon: "icons/icon-32.png",
      },
      browserActionState: {
        badgeText: "",
        badgeBackgroundColor: "#4f46e5",
        title: "FoxHub",
        icon: "icons/icon-32.png",
        popupOpenCount: 0,
      },
      commands: [
        { name: "_execute_browser_action", description: "Open FoxHub", shortcut: "Alt+Shift+F" },
        { name: "_execute_sidebar_action", description: "Toggle FoxHub Sidebar", shortcut: "Ctrl+Shift+F" },
        { name: "open-foxhub-popout", description: "Open FoxHub Popout", shortcut: "" },
      ],
      defaultCommands: null,
      contextMenuItems: new Map(),
      nextContextMenuSeq: 1,
      webRequestListeners: {
        onBeforeRequest: [],
        onBeforeSendHeaders: [],
        onHeadersReceived: [],
        onCompleted: [],
        onErrorOccurred: [],
      },
      streamFilters: new Map(),
      cookies: [],
      alarms: new Map(),
      notifications: new Map(),
      nextNotificationSeq: 1,
      permissions: {
        permissions: safeClone(DEFAULT_MANIFEST.permissions),
        origins: ["<all_urls>"],
      },
      i18nMessages: Object.create(null),
      i18nUiLanguage: "en-US",
      identityRedirectBase: "https://foxhub-test.chromiumapp.org/",
      identityAuthResultUrl: null,
      clipboardHistory: [],
    };
  }

  state = createInitialState();
  state.defaultCommands = safeClone(state.commands);

  const events = {
    storageOnChanged: makeEvent(),
    runtimeOnMessage: makeEvent(),
    runtimeOnConnect: makeEvent(),
    runtimeOnInstalled: makeEvent(),
    runtimeOnStartup: makeEvent(),
    tabsOnCreated: makeEvent(),
    tabsOnUpdated: makeEvent(),
    tabsOnActivated: makeEvent(),
    tabsOnRemoved: makeEvent(),
    windowsOnCreated: makeEvent(),
    windowsOnRemoved: makeEvent(),
    windowsOnFocusChanged: makeEvent(),
    browserActionOnClicked: makeEvent(),
    commandsOnCommand: makeEvent(),
    contextMenusOnClicked: makeEvent(),
    cookiesOnChanged: makeEvent(),
    alarmsOnAlarm: makeEvent(),
    notificationsOnClicked: makeEvent(),
    notificationsOnClosed: makeEvent(),
  };

  function recordCall(ns, method, args) {
    state.callLog.push({
      api: ns,
      method,
      fullName: ns + "." + method,
      args: safeClone(args),
      ts: Date.now(),
    });
  }

  function makeDualMethod(ns, method, implFn, opts) {
    const syncReturn = Boolean(opts && opts.syncReturn);
    const chromeMethod = function (...args) {
      let cb = null;
      const callArgs = args.slice();
      if (callArgs.length > 0 && typeof callArgs[callArgs.length - 1] === "function") {
        cb = callArgs.pop();
      }
      recordCall(ns, method, callArgs);
      if (cb) {
        const invokeCb = (errObj, resolved) => {
          state.lastError = errObj;
          try {
            cb(resolved);
          } finally {
            state.lastError = null;
          }
        };
        try {
          const val = implFn(...callArgs);
          Promise.resolve(val).then(
            (resolved) => invokeCb(null, resolved),
            (err) => invokeCb({ message: err && err.message ? err.message : String(err) }, undefined)
          );
        } catch (err) {
          const errObj = { message: err && err.message ? err.message : String(err) };
          Promise.resolve().then(() => invokeCb(errObj, undefined));
        }
        return undefined;
      }
      if (syncReturn) {
        state.lastError = null;
        return implFn(...callArgs);
      }
      return new Promise((resolve, reject) => {
        try {
          resolve(implFn(...callArgs));
        } catch (err) {
          reject(err);
        }
      });
    };

    const browserMethod = function (...args) {
      recordCall(ns, method, args);
      if (syncReturn) {
        state.lastError = null;
        return implFn(...args);
      }
      return new Promise((resolve, reject) => {
        try {
          resolve(implFn(...args));
        } catch (err) {
          reject(err);
        }
      });
    };

    return { browserMethod, chromeMethod };
  }

  function buildNamespaces() {
    const browserApi = {};
    const chromeApi = {};

    function registerMethod(ns, method, implFn, opts) {
      if (!browserApi[ns]) browserApi[ns] = {};
      if (!chromeApi[ns]) chromeApi[ns] = {};
      const { browserMethod, chromeMethod } = makeDualMethod(ns, method, implFn, opts);
      browserApi[ns][method] = browserMethod;
      chromeApi[ns][method] = chromeMethod;
    }

    function registerNestedMethod(ns, sub, method, implFn, opts) {
      if (!browserApi[ns]) browserApi[ns] = {};
      if (!chromeApi[ns]) chromeApi[ns] = {};
      if (!browserApi[ns][sub]) browserApi[ns][sub] = {};
      if (!chromeApi[ns][sub]) chromeApi[ns][sub] = {};
      const { browserMethod, chromeMethod } = makeDualMethod(ns + "." + sub, method, implFn, opts);
      browserApi[ns][sub][method] = browserMethod;
      chromeApi[ns][sub][method] = chromeMethod;
    }

    function registerProp(ns, prop, descriptorOrValue) {
      if (!browserApi[ns]) browserApi[ns] = {};
      if (!chromeApi[ns]) chromeApi[ns] = {};
      if (typeof descriptorOrValue === "object" && descriptorOrValue !== null && ("get" in descriptorOrValue || "set" in descriptorOrValue)) {
        Object.defineProperty(browserApi[ns], prop, { ...descriptorOrValue, enumerable: true, configurable: true });
        Object.defineProperty(chromeApi[ns], prop, { ...descriptorOrValue, enumerable: true, configurable: true });
      } else {
        browserApi[ns][prop] = descriptorOrValue;
        chromeApi[ns][prop] = descriptorOrValue;
      }
    }

    // 1. storage.local + storage.onChanged
    registerNestedMethod("storage", "local", "get", (keys) => {
      const out = {};
      if (keys === null || keys === undefined) {
        for (const k of Object.keys(state.storageLocal)) {
          out[k] = safeClone(state.storageLocal[k]);
        }
        return out;
      }
      if (typeof keys === "string") {
        if (Object.prototype.hasOwnProperty.call(state.storageLocal, keys)) {
          out[keys] = safeClone(state.storageLocal[keys]);
        }
        return out;
      }
      if (Array.isArray(keys)) {
        for (const k of keys) {
          if (Object.prototype.hasOwnProperty.call(state.storageLocal, k)) {
            out[k] = safeClone(state.storageLocal[k]);
          }
        }
        return out;
      }
      if (typeof keys === "object") {
        for (const k of Object.keys(keys)) {
          if (Object.prototype.hasOwnProperty.call(state.storageLocal, k)) {
            out[k] = safeClone(state.storageLocal[k]);
          } else if (keys[k] !== undefined) {
            out[k] = safeClone(keys[k]);
          }
        }
        return out;
      }
      return out;
    });

    registerNestedMethod("storage", "local", "set", (items) => {
      if (!items || typeof items !== "object") return;
      const changes = {};
      let hasChanges = false;
      for (const k of Object.keys(items)) {
        if (items[k] === undefined) continue;
        const had = Object.prototype.hasOwnProperty.call(state.storageLocal, k);
        const oldVal = had ? safeClone(state.storageLocal[k]) : undefined;
        const newVal = safeClone(items[k]);
        state.storageLocal[k] = safeClone(newVal);
        changes[k] = had ? { oldValue: oldVal, newValue: newVal } : { newValue: newVal };
        hasChanges = true;
      }
      if (hasChanges) {
        events.storageOnChanged._fire(safeClone(changes), "local");
      }
    });

    registerNestedMethod("storage", "local", "remove", (keys) => {
      const list = Array.isArray(keys) ? keys : [keys];
      const changes = {};
      let hasChanges = false;
      for (const k of list) {
        if (Object.prototype.hasOwnProperty.call(state.storageLocal, k)) {
          changes[k] = { oldValue: safeClone(state.storageLocal[k]) };
          delete state.storageLocal[k];
          hasChanges = true;
        }
      }
      if (hasChanges) {
        events.storageOnChanged._fire(safeClone(changes), "local");
      }
    });

    registerNestedMethod("storage", "local", "clear", () => {
      const changes = {};
      let hasChanges = false;
      for (const k of Object.keys(state.storageLocal)) {
        changes[k] = { oldValue: safeClone(state.storageLocal[k]) };
        delete state.storageLocal[k];
        hasChanges = true;
      }
      if (hasChanges) {
        events.storageOnChanged._fire(safeClone(changes), "local");
      }
    });

    registerProp("storage", "onChanged", events.storageOnChanged);

    // 2. runtime + extension
    registerProp("runtime", "id", {
      get() {
        return state.extensionId;
      },
    });
    registerProp("runtime", "lastError", {
      get() {
        return state.lastError;
      },
      set(v) {
        state.lastError = v;
      },
    });
    registerMethod("runtime", "getManifest", () => safeClone(state.manifest), { syncReturn: true });
    registerMethod(
      "runtime",
      "getURL",
      (path) => {
        const clean = String(path || "").replace(/^\/+/, "");
        const base = state.baseUrl.endsWith("/") ? state.baseUrl : state.baseUrl + "/";
        return base + clean;
      },
      { syncReturn: true }
    );
    registerMethod("runtime", "openOptionsPage", () => undefined);

    registerMethod("runtime", "sendMessage", (...args) => {
      let msg;
      if (args.length >= 2 && typeof args[0] === "string") {
        msg = args[1];
      } else {
        msg = args[0];
      }
      if (typeof state.customMessageHandler === "function") {
        const res = state.customMessageHandler(safeClone(msg));
        if (res !== undefined) return res;
      }
      const msgKey = msg && (msg.type || msg.action);
      if (msgKey && Object.prototype.hasOwnProperty.call(state.messageResponses, msgKey)) {
        return safeClone(state.messageResponses[msgKey]);
      }

      const listeners = events.runtimeOnMessage._listeners.slice();
      if (listeners.length === 0) return undefined;

      const sender = {
        id: state.extensionId,
        url: state.baseUrl + "src/popup/popup.html",
        tab: safeClone(state.senderTab),
      };

      return new Promise((resolve, reject) => {
        let settled = false;
        let pendingAsync = 0;

        function finish(val) {
          if (!settled) {
            settled = true;
            resolve(val === undefined ? undefined : safeClone(val));
          }
        }

        function maybeResolveEmpty() {
          if (!settled && pendingAsync === 0) {
            settled = true;
            resolve(undefined);
          }
        }

        for (const listener of listeners) {
          if (settled) break;
          let syncResponded = false;
          let asyncDeclared = false;
          const sendResponse = (resp) => {
            syncResponded = true;
            if (!settled && resp !== undefined) {
              finish(resp);
            } else if (asyncDeclared) {
              pendingAsync = Math.max(0, pendingAsync - 1);
              maybeResolveEmpty();
            }
          };

          let ret;
          try {
            ret = listener(safeClone(msg), safeClone(sender), sendResponse);
          } catch (err) {
            if (!settled) {
              settled = true;
              reject(err);
            }
            return;
          }

          if (ret && typeof ret.then === "function") {
            pendingAsync += 1;
            ret.then(
              (val) => {
                pendingAsync = Math.max(0, pendingAsync - 1);
                if (!settled && val !== undefined) {
                  finish(val);
                } else {
                  maybeResolveEmpty();
                }
              },
              (err) => {
                pendingAsync = Math.max(0, pendingAsync - 1);
                if (!settled) {
                  settled = true;
                  reject(err);
                }
              }
            );
          } else if (ret === true && !syncResponded) {
            asyncDeclared = true;
            pendingAsync += 1;
          }
        }

        maybeResolveEmpty();
      });
    });

    registerMethod(
      "runtime",
      "connect",
      (connectInfo) => {
        const portName = connectInfo && connectInfo.name ? String(connectInfo.name) : "";
        let disconnected = false;
        const clientOnMessage = makeEvent();
        const clientOnDisconnect = makeEvent();
        const serverOnMessage = makeEvent();
        const serverOnDisconnect = makeEvent();

        const clientPort = {
          name: portName,
          sender: undefined,
          error: null,
          onMessage: clientOnMessage,
          onDisconnect: clientOnDisconnect,
          postMessage(payload) {
            if (disconnected) throw new Error("Attempting to use a disconnected port object");
            const cloned = safeClone(payload);
            Promise.resolve().then(() => {
              serverOnMessage._fire(cloned, serverPort);
            });
          },
          disconnect() {
            if (disconnected) return;
            disconnected = true;
            Promise.resolve().then(() => {
              serverOnDisconnect._fire(serverPort);
            });
          },
        };

        const serverPort = {
          name: portName,
          sender: {
            id: state.extensionId,
            url: state.baseUrl + "src/popup/popup.html",
            tab: safeClone(state.senderTab),
          },
          error: null,
          onMessage: serverOnMessage,
          onDisconnect: serverOnDisconnect,
          postMessage(payload) {
            if (disconnected) throw new Error("Attempting to use a disconnected port object");
            const cloned = safeClone(payload);
            Promise.resolve().then(() => {
              clientOnMessage._fire(cloned, clientPort);
            });
          },
          disconnect() {
            if (disconnected) return;
            disconnected = true;
            Promise.resolve().then(() => {
              clientOnDisconnect._fire(clientPort);
            });
          },
        };

        state.ports.push({ name: portName, clientPort, serverPort });
        events.runtimeOnConnect._fire(serverPort);
        return clientPort;
      },
      { syncReturn: true }
    );

    registerProp("runtime", "onMessage", events.runtimeOnMessage);
    registerProp("runtime", "onConnect", events.runtimeOnConnect);
    registerProp("runtime", "onInstalled", events.runtimeOnInstalled);
    registerProp("runtime", "onStartup", events.runtimeOnStartup);

    registerMethod("extension", "getBackgroundPage", () => state.backgroundPage, { syncReturn: true });

    // 3. tabs
    registerMethod("tabs", "query", (queryInfo) => {
      const q = queryInfo || {};
      return state.tabs
        .filter((t) => {
          if (q.active !== undefined && Boolean(t.active) !== Boolean(q.active)) return false;
          if (q.audible !== undefined && Boolean(t.audible) !== Boolean(q.audible)) return false;
          if (q.pinned !== undefined && Boolean(t.pinned) !== Boolean(q.pinned)) return false;
          if (q.muted !== undefined && Boolean(t.mutedInfo && t.mutedInfo.muted) !== Boolean(q.muted)) return false;
          if (q.windowId !== undefined && t.windowId !== q.windowId) return false;
          if (q.currentWindow) {
            const focusedWin = state.windows.find((w) => w.focused) || state.windows[0];
            if (focusedWin && t.windowId !== focusedWin.id) return false;
          }
          if (q.url !== undefined) {
            const pats = Array.isArray(q.url) ? q.url : [q.url];
            if (!matchesUrlPatterns(t.url, pats)) return false;
          }
          return true;
        })
        .map((t) => safeClone(t));
    });

    registerMethod("tabs", "get", (tabId) => {
      const tab = state.tabs.find((t) => t.id === tabId);
      if (!tab) throw new Error("No tab with id: " + tabId);
      return safeClone(tab);
    });

    registerMethod("tabs", "create", (props) => {
      const p = props || {};
      const winId = p.windowId !== undefined ? p.windowId : (state.windows[0] ? state.windows[0].id : 1);
      const makeActive = p.active !== undefined ? Boolean(p.active) : true;
      if (makeActive) {
        for (const t of state.tabs) {
          if (t.windowId === winId) t.active = false;
        }
      }
      const tab = {
        id: state.nextTabId++,
        windowId: winId,
        index: state.tabs.filter((t) => t.windowId === winId).length,
        active: makeActive,
        highlighted: makeActive,
        pinned: Boolean(p.pinned),
        audible: Boolean(p.audible),
        mutedInfo: { muted: Boolean(p.muted) },
        title: p.title || p.url || "New Tab",
        url: p.url || "about:blank",
        status: "complete",
      };
      state.tabs.push(tab);
      const cloned = safeClone(tab);
      events.tabsOnCreated._fire(cloned);
      if (makeActive) {
        events.tabsOnActivated._fire({ tabId: tab.id, windowId: winId });
      }
      return cloned;
    });

    registerMethod("tabs", "update", (tabId, props) => {
      const id = tabId == null ? (state.tabs.find((t) => t.active) || state.tabs[0] || {}).id : tabId;
      const tab = state.tabs.find((t) => t.id === id);
      if (!tab) throw new Error("No tab with id: " + tabId);
      const p = props || {};
      const changeInfo = {};
      if (p.url !== undefined && p.url !== tab.url) {
        tab.url = p.url;
        changeInfo.url = p.url;
      }
      if (p.title !== undefined && p.title !== tab.title) {
        tab.title = p.title;
        changeInfo.title = p.title;
      }
      if (p.pinned !== undefined && p.pinned !== tab.pinned) {
        tab.pinned = Boolean(p.pinned);
        changeInfo.pinned = tab.pinned;
      }
      if (p.muted !== undefined) {
        tab.mutedInfo = { muted: Boolean(p.muted) };
        changeInfo.mutedInfo = safeClone(tab.mutedInfo);
      }
      if (p.active === true) {
        for (const t of state.tabs) {
          if (t.windowId === tab.windowId) t.active = t.id === tab.id;
        }
        events.tabsOnActivated._fire({ tabId: tab.id, windowId: tab.windowId });
      }
      const cloned = safeClone(tab);
      if (Object.keys(changeInfo).length > 0) {
        events.tabsOnUpdated._fire(tab.id, changeInfo, cloned);
      }
      return cloned;
    });

    registerMethod("tabs", "remove", (tabIds) => {
      const ids = Array.isArray(tabIds) ? tabIds : [tabIds];
      for (const id of ids) {
        const idx = state.tabs.findIndex((t) => t.id === id);
        if (idx !== -1) {
          const [removed] = state.tabs.splice(idx, 1);
          events.tabsOnRemoved._fire(id, { windowId: removed.windowId, isWindowClosing: false });
        }
      }
    });

    registerMethod("tabs", "sendMessage", (tabId, msg) => {
      const handler = state.tabMessageHandlers[tabId];
      if (typeof handler === "function") {
        return handler(safeClone(msg), tabId);
      }
      if (Object.prototype.hasOwnProperty.call(state.tabMessageResults, tabId)) {
        return safeClone(state.tabMessageResults[tabId]);
      }
      return undefined;
    });

    registerMethod("tabs", "executeScript", () => [undefined]);
    registerMethod("tabs", "insertCSS", () => undefined);

    registerProp("tabs", "onCreated", events.tabsOnCreated);
    registerProp("tabs", "onUpdated", events.tabsOnUpdated);
    registerProp("tabs", "onActivated", events.tabsOnActivated);
    registerProp("tabs", "onRemoved", events.tabsOnRemoved);

    // 4. windows
    registerProp("windows", "WINDOW_ID_CURRENT", -2);
    registerProp("windows", "WINDOW_ID_NONE", -1);

    registerMethod("windows", "create", (props) => {
      const p = props || {};
      const win = {
        id: state.nextWindowId++,
        focused: p.focused !== undefined ? Boolean(p.focused) : true,
        top: p.top ?? 0,
        left: p.left ?? 0,
        width: p.width ?? 1024,
        height: p.height ?? 768,
        type: p.type || "normal",
        state: p.state || "normal",
        incognito: Boolean(p.incognito),
        alwaysOnTop: Boolean(p.alwaysOnTop),
      };
      if (win.focused) {
        for (const w of state.windows) w.focused = false;
      }
      state.windows.push(win);
      if (p.url) {
        const urls = Array.isArray(p.url) ? p.url : [p.url];
        for (let i = 0; i < urls.length; i += 1) {
          state.tabs.push({
            id: state.nextTabId++,
            windowId: win.id,
            index: i,
            active: i === 0,
            highlighted: i === 0,
            pinned: false,
            audible: false,
            mutedInfo: { muted: false },
            title: urls[i],
            url: urls[i],
            status: "complete",
          });
        }
      }
      const cloned = safeClone(win);
      events.windowsOnCreated._fire(cloned);
      return cloned;
    });

    registerMethod("windows", "get", (winId) => {
      const win = state.windows.find((w) => w.id === winId);
      if (!win) throw new Error("No window with id: " + winId);
      return safeClone(win);
    });

    registerMethod("windows", "getCurrent", () => safeClone(state.windows[0] || null));
    registerMethod("windows", "getLastFocused", () => {
      const win = state.windows.find((w) => w.focused) || state.windows[0] || null;
      return safeClone(win);
    });
    registerMethod("windows", "getAll", () => state.windows.map((w) => safeClone(w)));

    registerMethod("windows", "update", (winId, props) => {
      const win = state.windows.find((w) => w.id === winId);
      if (!win) throw new Error("No window with id: " + winId);
      const p = props || {};
      if (p.focused === true) {
        for (const w of state.windows) w.focused = w.id === winId;
        events.windowsOnFocusChanged._fire(winId);
      }
      Object.assign(win, p);
      return safeClone(win);
    });

    registerMethod("windows", "remove", (winId) => {
      const idx = state.windows.findIndex((w) => w.id === winId);
      if (idx !== -1) {
        state.windows.splice(idx, 1);
        state.tabs = state.tabs.filter((t) => t.windowId !== winId);
        events.windowsOnRemoved._fire(winId);
      }
    });

    registerProp("windows", "onCreated", events.windowsOnCreated);
    registerProp("windows", "onRemoved", events.windowsOnRemoved);
    registerProp("windows", "onFocusChanged", events.windowsOnFocusChanged);

    // 5. sidebarAction
    registerMethod("sidebarAction", "open", () => {
      state.sidebarState.isOpen = true;
    });
    registerMethod("sidebarAction", "close", () => {
      state.sidebarState.isOpen = false;
    });
    registerMethod("sidebarAction", "toggle", () => {
      state.sidebarState.isOpen = !state.sidebarState.isOpen;
    });
    registerMethod("sidebarAction", "isOpen", () => Boolean(state.sidebarState.isOpen));
    registerMethod("sidebarAction", "setPanel", (details) => {
      if (details && details.panel !== undefined) state.sidebarState.panel = String(details.panel);
    });
    registerMethod("sidebarAction", "getPanel", () => state.sidebarState.panel);
    registerMethod("sidebarAction", "setTitle", (details) => {
      if (details && details.title !== undefined) state.sidebarState.title = String(details.title);
    });
    registerMethod("sidebarAction", "getTitle", () => state.sidebarState.title);
    registerMethod("sidebarAction", "setIcon", (details) => {
      if (details && details.path !== undefined) state.sidebarState.icon = safeClone(details.path);
    });

    // 6. browserAction
    registerMethod("browserAction", "setBadgeText", (details) => {
      state.browserActionState.badgeText = details && details.text != null ? String(details.text) : "";
    });
    registerMethod("browserAction", "getBadgeText", () => state.browserActionState.badgeText);
    registerMethod("browserAction", "setBadgeBackgroundColor", (details) => {
      if (details && details.color !== undefined) {
        state.browserActionState.badgeBackgroundColor = safeClone(details.color);
      }
    });
    registerMethod("browserAction", "getBadgeBackgroundColor", () => safeClone(state.browserActionState.badgeBackgroundColor));
    registerMethod("browserAction", "setTitle", (details) => {
      if (details && details.title !== undefined) state.browserActionState.title = String(details.title);
    });
    registerMethod("browserAction", "getTitle", () => state.browserActionState.title);
    registerMethod("browserAction", "setIcon", (details) => {
      if (details && details.path !== undefined) state.browserActionState.icon = safeClone(details.path);
    });
    registerMethod("browserAction", "openPopup", () => {
      state.browserActionState.popupOpenCount += 1;
    });
    registerProp("browserAction", "onClicked", events.browserActionOnClicked);

    // 7. commands
    registerMethod("commands", "getAll", () => safeClone(state.commands));
    registerMethod("commands", "update", (details) => {
      if (!details || !details.name) throw new Error("Command name is required");
      const cmd = state.commands.find((c) => c.name === details.name);
      if (!cmd) throw new Error("Unknown command: " + details.name);
      if (details.shortcut !== undefined) cmd.shortcut = String(details.shortcut);
      if (details.description !== undefined) cmd.description = String(details.description);
    });
    registerMethod("commands", "reset", (name) => {
      const cmd = state.commands.find((c) => c.name === name);
      const def = (state.defaultCommands || []).find((c) => c.name === name);
      if (cmd && def) {
        cmd.shortcut = def.shortcut;
        cmd.description = def.description;
      }
    });
    registerProp("commands", "onCommand", events.commandsOnCommand);

    // 8. contextMenus
    registerMethod(
      "contextMenus",
      "create",
      (createProps) => {
        const p = createProps || {};
        const id = p.id !== undefined ? String(p.id) : "cm-" + state.nextContextMenuSeq++;
        if (state.contextMenuItems.has(id)) {
          throw new Error("Duplicate contextMenus item id: " + id);
        }
        const entry = { ...safeClone(p), id };
        if (typeof p.onclick === "function") {
          entry.onclick = p.onclick;
        }
        state.contextMenuItems.set(id, entry);
        return id;
      },
      { syncReturn: true }
    );
    registerMethod("contextMenus", "update", (id, updateProps) => {
      const key = String(id);
      if (!state.contextMenuItems.has(key)) throw new Error("Cannot find menu item with id " + key);
      const prev = state.contextMenuItems.get(key);
      const next = { ...prev, ...safeClone(updateProps), id: key };
      if (updateProps && typeof updateProps.onclick === "function") next.onclick = updateProps.onclick;
      state.contextMenuItems.set(key, next);
    });
    registerMethod("contextMenus", "remove", (id) => {
      state.contextMenuItems.delete(String(id));
    });
    registerMethod("contextMenus", "removeAll", () => {
      state.contextMenuItems.clear();
    });
    registerProp("contextMenus", "onClicked", events.contextMenusOnClicked);

    // 9. webRequest
    function makeWebRequestEvent(bucketName) {
      return {
        addListener(callback, filter, extraInfoSpec) {
          if (typeof callback !== "function") return;
          const bucket = state.webRequestListeners[bucketName];
          if (!bucket.some((item) => item.callback === callback)) {
            bucket.push({
              callback,
              filter: safeClone(filter || { urls: ["<all_urls>"] }),
              extraInfoSpec: safeClone(extraInfoSpec || []),
            });
          }
        },
        removeListener(callback) {
          const bucket = state.webRequestListeners[bucketName];
          const idx = bucket.findIndex((item) => item.callback === callback);
          if (idx !== -1) bucket.splice(idx, 1);
        },
        hasListener(callback) {
          return state.webRequestListeners[bucketName].some((item) => item.callback === callback);
        },
      };
    }

    registerProp("webRequest", "onBeforeRequest", makeWebRequestEvent("onBeforeRequest"));
    registerProp("webRequest", "onBeforeSendHeaders", makeWebRequestEvent("onBeforeSendHeaders"));
    registerProp("webRequest", "onHeadersReceived", makeWebRequestEvent("onHeadersReceived"));
    registerProp("webRequest", "onCompleted", makeWebRequestEvent("onCompleted"));
    registerProp("webRequest", "onErrorOccurred", makeWebRequestEvent("onErrorOccurred"));

    registerMethod(
      "webRequest",
      "filterResponseData",
      (requestId) => {
        const key = String(requestId);
        const filterObj = {
          requestId: key,
          status: "uninitialized",
          ondata: null,
          onstop: null,
          onerror: null,
          _written: [],
          write(data) {
            filterObj._written.push(data);
          },
          close() {
            filterObj.status = "closed";
          },
          disconnect() {
            filterObj.status = "disconnected";
          },
        };
        state.streamFilters.set(key, filterObj);
        return filterObj;
      },
      { syncReturn: true }
    );

    // 10. cookies
    function cookieMatches(c, d) {
      if (!d) return true;
      if (d.name !== undefined && c.name !== d.name) return false;
      if (d.domain !== undefined && c.domain !== d.domain) return false;
      if (d.path !== undefined && c.path !== d.path) return false;
      if (d.secure !== undefined && Boolean(c.secure) !== Boolean(d.secure)) return false;
      if (d.storeId !== undefined && c.storeId !== d.storeId) return false;
      if (d.url !== undefined) {
        try {
          const u = new URL(d.url);
          const cd = String(c.domain || "").replace(/^\./, "");
          if (cd && u.hostname !== cd && !u.hostname.endsWith("." + cd)) return false;
          if (c.path && !u.pathname.startsWith(c.path)) return false;
        } catch (_err) {
          return false;
        }
      }
      return true;
    }

    registerMethod("cookies", "get", (details) => {
      const found = state.cookies.find((c) => cookieMatches(c, details));
      return found ? safeClone(found) : null;
    });
    registerMethod("cookies", "getAll", (details) =>
      state.cookies.filter((c) => cookieMatches(c, details)).map((c) => safeClone(c))
    );
    registerMethod("cookies", "set", (details) => {
      const d = details || {};
      let domain = d.domain || "";
      let path = d.path || "/";
      if (!domain && d.url) {
        try {
          domain = new URL(d.url).hostname;
        } catch (_err) {
          domain = "";
        }
      }
      const cookie = {
        name: String(d.name || ""),
        value: String(d.value || ""),
        domain,
        path,
        secure: Boolean(d.secure),
        httpOnly: Boolean(d.httpOnly),
        sameSite: d.sameSite || "no_restriction",
        storeId: d.storeId || "firefox-default",
        expirationDate: d.expirationDate,
      };
      const idx = state.cookies.findIndex(
        (c) => c.name === cookie.name && c.domain === cookie.domain && c.path === cookie.path
      );
      if (idx !== -1) state.cookies[idx] = cookie;
      else state.cookies.push(cookie);
      const cloned = safeClone(cookie);
      events.cookiesOnChanged._fire({ removed: false, cookie: cloned, cause: "explicit" });
      return cloned;
    });
    registerMethod("cookies", "remove", (details) => {
      const idx = state.cookies.findIndex((c) => cookieMatches(c, details));
      if (idx === -1) return null;
      const [removed] = state.cookies.splice(idx, 1);
      const cloned = safeClone(removed);
      events.cookiesOnChanged._fire({ removed: true, cookie: cloned, cause: "explicit" });
      return { url: details.url || "", name: cloned.name, storeId: cloned.storeId };
    });
    registerProp("cookies", "onChanged", events.cookiesOnChanged);

    // 11. alarms
    registerMethod(
      "alarms",
      "create",
      (name, alarmInfo) => {
        let alarmName = "";
        let info = alarmInfo;
        if (typeof name === "object" && name !== null) {
          info = name;
        } else if (name !== undefined) {
          alarmName = String(name);
        }
        const entry = {
          name: alarmName,
          scheduledTime: (info && info.when) || Date.now() + ((info && (info.delayInMinutes || info.periodInMinutes)) || 1) * 60000,
          periodInMinutes: info && info.periodInMinutes !== undefined ? info.periodInMinutes : null,
        };
        state.alarms.set(alarmName, entry);
      },
      { syncReturn: true }
    );
    registerMethod("alarms", "get", (name) => safeClone(state.alarms.get(name || "") || null));
    registerMethod("alarms", "getAll", () => Array.from(state.alarms.values()).map((a) => safeClone(a)));
    registerMethod("alarms", "clear", (name) => state.alarms.delete(name || ""));
    registerMethod("alarms", "clearAll", () => {
      const had = state.alarms.size > 0;
      state.alarms.clear();
      return had;
    });
    registerProp("alarms", "onAlarm", events.alarmsOnAlarm);

    // 12. notifications
    registerMethod("notifications", "create", (idOrOpts, maybeOpts) => {
      let id;
      let opts;
      if (typeof idOrOpts === "string") {
        id = idOrOpts;
        opts = maybeOpts || {};
      } else {
        id = "notif-" + state.nextNotificationSeq++;
        opts = idOrOpts || {};
      }
      state.notifications.set(id, { id, options: safeClone(opts) });
      return id;
    });
    registerMethod("notifications", "clear", (id) => {
      const existed = state.notifications.delete(String(id));
      if (existed) events.notificationsOnClosed._fire(String(id), false);
      return existed;
    });
    registerMethod("notifications", "getAll", () => {
      const out = {};
      for (const [k, v] of state.notifications.entries()) out[k] = safeClone(v.options);
      return out;
    });
    registerProp("notifications", "onClicked", events.notificationsOnClicked);
    registerProp("notifications", "onClosed", events.notificationsOnClosed);

    // 13. identity
    registerMethod("identity", "getRedirectURL", (path) => state.identityRedirectBase + String(path || "").replace(/^\/+/, ""), {
      syncReturn: true,
    });
    registerMethod("identity", "launchWebAuthFlow", (details) => {
      if (state.identityAuthResultUrl) return state.identityAuthResultUrl;
      return (details && details.url) || state.identityRedirectBase + "#access_token=mock_token";
    });

    // 14. i18n
    registerMethod(
      "i18n",
      "getMessage",
      (key, substitutions) => {
        if (Object.prototype.hasOwnProperty.call(state.i18nMessages, key)) {
          return String(state.i18nMessages[key]);
        }
        return Array.isArray(substitutions) && substitutions.length > 0
          ? String(key) + ":" + substitutions.join(",")
          : String(key || "");
      },
      { syncReturn: true }
    );
    registerMethod("i18n", "getUILanguage", () => state.i18nUiLanguage, { syncReturn: true });
    registerMethod("i18n", "getAcceptLanguages", () => [state.i18nUiLanguage, "en"]);

    // 15. permissions
    registerMethod("permissions", "contains", (perms) => {
      const reqP = (perms && perms.permissions) || [];
      const reqO = (perms && perms.origins) || [];
      return (
        reqP.every((p) => state.permissions.permissions.includes(p)) &&
        reqO.every((o) => state.permissions.origins.includes(o))
      );
    });
    registerMethod("permissions", "getAll", () => safeClone(state.permissions));
    registerMethod("permissions", "request", (perms) => {
      for (const p of (perms && perms.permissions) || []) {
        if (!state.permissions.permissions.includes(p)) state.permissions.permissions.push(p);
      }
      for (const o of (perms && perms.origins) || []) {
        if (!state.permissions.origins.includes(o)) state.permissions.origins.push(o);
      }
      return true;
    });
    registerMethod("permissions", "remove", (perms) => {
      const remP = (perms && perms.permissions) || [];
      const remO = (perms && perms.origins) || [];
      state.permissions.permissions = state.permissions.permissions.filter((p) => !remP.includes(p));
      state.permissions.origins = state.permissions.origins.filter((o) => !remO.includes(o));
      return true;
    });

    return { browserApi, chromeApi };
  }

  function applyConfiguration(opts) {
    if (!opts || typeof opts !== "object") return;
    if (opts.manifest) state.manifest = safeClone(opts.manifest);
    if (opts.extensionId) state.extensionId = String(opts.extensionId);
    if (opts.baseUrl) state.baseUrl = String(opts.baseUrl);
    if ("backgroundPage" in opts) state.backgroundPage = opts.backgroundPage;
    if (opts.senderTab) state.senderTab = safeClone(opts.senderTab);
    if (opts.storage && typeof opts.storage === "object") {
      for (const k of Object.keys(opts.storage)) {
        state.storageLocal[k] = safeClone(opts.storage[k]);
      }
    }
    if (Array.isArray(opts.tabs)) {
      state.tabs = safeClone(opts.tabs);
      const maxId = state.tabs.reduce((acc, t) => Math.max(acc, Number(t.id) || 0), 0);
      state.nextTabId = maxId + 1;
    }
    if (Array.isArray(opts.windows)) {
      state.windows = safeClone(opts.windows);
      const maxId = state.windows.reduce((acc, w) => Math.max(acc, Number(w.id) || 0), 0);
      state.nextWindowId = maxId + 1;
    }
    if (Array.isArray(opts.cookies)) {
      state.cookies = safeClone(opts.cookies);
    }
    if (Array.isArray(opts.commands)) {
      state.commands = safeClone(opts.commands);
      state.defaultCommands = safeClone(opts.commands);
    }
    if (opts.messageResponses && typeof opts.messageResponses === "object") {
      Object.assign(state.messageResponses, safeClone(opts.messageResponses));
    }
    if (opts.sidebarState && typeof opts.sidebarState === "object") {
      Object.assign(state.sidebarState, safeClone(opts.sidebarState));
    }
    if (opts.browserActionState && typeof opts.browserActionState === "object") {
      Object.assign(state.browserActionState, safeClone(opts.browserActionState));
    }
    if (opts.i18nMessages && typeof opts.i18nMessages === "object") {
      Object.assign(state.i18nMessages, safeClone(opts.i18nMessages));
    }
  }

  function matchesWebRequestFilter(details, filter) {
    if (!filter) return true;
    if (Array.isArray(filter.types) && filter.types.length > 0) {
      if (!filter.types.includes(details.type || "other")) return false;
    }
    if (Array.isArray(filter.urls) && filter.urls.length > 0) {
      if (!matchesUrlPatterns(details.url, filter.urls)) return false;
    }
    if (filter.tabId !== undefined && filter.tabId !== null && details.tabId !== filter.tabId) {
      return false;
    }
    if (filter.windowId !== undefined && filter.windowId !== null && details.windowId !== filter.windowId) {
      return false;
    }
    return true;
  }

  const { browserApi, chromeApi } = buildNamespaces();

  const controller = {
    configure(opts) {
      applyConfiguration(opts);
      return controller;
    },
    reset() {
      for (const ev of Object.values(events)) {
        ev._clear();
      }
      state = createInitialState();
      state.defaultCommands = safeClone(state.commands);
    },
    getCalls(prefix) {
      if (!prefix) return safeClone(state.callLog);
      return safeClone(
        state.callLog.filter((entry) => entry.fullName.startsWith(prefix) || entry.api === prefix)
      );
    },
    clearCalls() {
      state.callLog.length = 0;
    },
    storage: {
      seed(data, silent) {
        if (!data || typeof data !== "object") return;
        const changes = {};
        for (const k of Object.keys(data)) {
          if (data[k] === undefined) continue;
          const had = Object.prototype.hasOwnProperty.call(state.storageLocal, k);
          const oldVal = had ? safeClone(state.storageLocal[k]) : undefined;
          const newVal = safeClone(data[k]);
          state.storageLocal[k] = safeClone(newVal);
          changes[k] = had ? { oldValue: oldVal, newValue: newVal } : { newValue: newVal };
        }
        if (!silent && Object.keys(changes).length > 0) {
          events.storageOnChanged._fire(safeClone(changes), "local");
        }
      },
      dump() {
        return safeClone(state.storageLocal);
      },
      clear(silent) {
        const changes = {};
        for (const k of Object.keys(state.storageLocal)) {
          changes[k] = { oldValue: safeClone(state.storageLocal[k]) };
          delete state.storageLocal[k];
        }
        if (!silent && Object.keys(changes).length > 0) {
          events.storageOnChanged._fire(safeClone(changes), "local");
        }
      },
    },
    runtime: {
      setMessageHandler(fn) {
        state.customMessageHandler = typeof fn === "function" ? fn : null;
      },
      setMessageResponses(map) {
        state.messageResponses = map && typeof map === "object" ? safeClone(map) : Object.create(null);
      },
      getPorts() {
        return state.ports.map((p) => ({ name: p.name }));
      },
      triggerInstalled(details) {
        return events.runtimeOnInstalled._fire(safeClone(details || { reason: "install" }));
      },
      triggerStartup() {
        return events.runtimeOnStartup._fire();
      },
    },
    tabs: {
      seed(tabs) {
        state.tabs = safeClone(tabs || []);
        const maxId = state.tabs.reduce((acc, t) => Math.max(acc, Number(t.id) || 0), 0);
        state.nextTabId = maxId + 1;
      },
      dump() {
        return safeClone(state.tabs);
      },
      setTabMessageHandler(tabId, fn) {
        state.tabMessageHandlers[tabId] = typeof fn === "function" ? fn : null;
      },
      setTabMessageResult(tabId, result) {
        state.tabMessageResults[tabId] = safeClone(result);
      },
      triggerUpdated(tabId, changeInfo, tabPatch) {
        const tab = state.tabs.find((t) => t.id === tabId);
        if (tab && tabPatch && typeof tabPatch === "object") {
          Object.assign(tab, safeClone(tabPatch));
        }
        const tabSnapshot = tab ? safeClone(tab) : safeClone({ id: tabId, ...(tabPatch || {}) });
        return events.tabsOnUpdated._fire(tabId, safeClone(changeInfo || {}), tabSnapshot);
      },
      triggerActivated(tabId, windowId) {
        const tab = state.tabs.find((t) => t.id === tabId);
        const winId = windowId !== undefined ? windowId : tab ? tab.windowId : 1;
        for (const t of state.tabs) {
          if (t.windowId === winId) t.active = t.id === tabId;
        }
        return events.tabsOnActivated._fire({ tabId, windowId: winId });
      },
      triggerRemoved(tabId, removeInfo) {
        const idx = state.tabs.findIndex((t) => t.id === tabId);
        let winId = 1;
        if (idx !== -1) {
          winId = state.tabs[idx].windowId;
          state.tabs.splice(idx, 1);
        }
        return events.tabsOnRemoved._fire(tabId, safeClone(removeInfo || { windowId: winId, isWindowClosing: false }));
      },
    },
    windows: {
      seed(wins) {
        state.windows = safeClone(wins || []);
        const maxId = state.windows.reduce((acc, w) => Math.max(acc, Number(w.id) || 0), 0);
        state.nextWindowId = maxId + 1;
      },
      dump() {
        return safeClone(state.windows);
      },
      triggerRemoved(winId) {
        state.windows = state.windows.filter((w) => w.id !== winId);
        return events.windowsOnRemoved._fire(winId);
      },
    },
    sidebarAction: {
      getState() {
        return safeClone(state.sidebarState);
      },
    },
    browserAction: {
      getState() {
        return safeClone(state.browserActionState);
      },
      triggerClick(tab) {
        return events.browserActionOnClicked._fire(safeClone(tab || state.tabs[0] || { id: 1 }));
      },
    },
    commands: {
      seed(cmds) {
        state.commands = safeClone(cmds || []);
        state.defaultCommands = safeClone(cmds || []);
      },
      trigger(commandName, tab) {
        return events.commandsOnCommand._fire(String(commandName), safeClone(tab || state.tabs[0] || { id: 1 }));
      },
    },
    contextMenus: {
      list() {
        return Array.from(state.contextMenuItems.values()).map((item) => safeClone(item));
      },
      triggerClick(info, tab) {
        const clickInfo = safeClone(info || {});
        const tabInfo = safeClone(tab || state.tabs[0] || { id: 1, url: clickInfo.pageUrl || "https://example.com/" });
        const item = clickInfo.menuItemId ? state.contextMenuItems.get(String(clickInfo.menuItemId)) : null;
        const results = [];
        if (item && typeof item.onclick === "function") {
          results.push(item.onclick(safeClone(clickInfo), safeClone(tabInfo)));
        }
        results.push(...events.contextMenusOnClicked._fire(safeClone(clickInfo), safeClone(tabInfo)));
        return results;
      },
    },
    webRequest: {
      async triggerBeforeRequest(details) {
        const cur = {
          requestId: "req-1",
          method: "GET",
          type: "sub_frame",
          tabId: -1,
          frameId: 1,
          parentFrameId: 0,
          timeStamp: Date.now(),
          ...safeClone(details || {}),
        };
        let cancelled = false;
        let redirectUrl = null;
        for (const entry of state.webRequestListeners.onBeforeRequest.slice()) {
          if (!matchesWebRequestFilter(cur, entry.filter)) continue;
          const res = await Promise.resolve(entry.callback(safeClone(cur)));
          if (res && res.cancel) {
            cancelled = true;
            break;
          }
          if (res && res.redirectUrl) {
            redirectUrl = res.redirectUrl;
            cur.url = res.redirectUrl;
          }
        }
        return { cancel: cancelled, redirectUrl, details: cur };
      },
      async triggerBeforeSendHeaders(details) {
        const cur = {
          requestId: "req-1",
          method: "GET",
          type: "sub_frame",
          tabId: -1,
          frameId: 1,
          parentFrameId: 0,
          requestHeaders: [],
          timeStamp: Date.now(),
          ...safeClone(details || {}),
        };
        let cancelled = false;
        for (const entry of state.webRequestListeners.onBeforeSendHeaders.slice()) {
          if (!matchesWebRequestFilter(cur, entry.filter)) continue;
          const res = await Promise.resolve(entry.callback(safeClone(cur)));
          if (res && res.cancel) {
            cancelled = true;
            break;
          }
          if (res && Array.isArray(res.requestHeaders)) {
            cur.requestHeaders = safeClone(res.requestHeaders);
          }
        }
        return { cancel: cancelled, requestHeaders: cur.requestHeaders, details: cur };
      },
      async triggerHeadersReceived(details) {
        const cur = {
          requestId: "req-1",
          method: "GET",
          type: "sub_frame",
          tabId: -1,
          frameId: 1,
          parentFrameId: 0,
          statusCode: 200,
          responseHeaders: [],
          timeStamp: Date.now(),
          ...safeClone(details || {}),
        };
        let cancelled = false;
        for (const entry of state.webRequestListeners.onHeadersReceived.slice()) {
          if (!matchesWebRequestFilter(cur, entry.filter)) continue;
          const res = await Promise.resolve(entry.callback(safeClone(cur)));
          if (res && res.cancel) {
            cancelled = true;
            break;
          }
          if (res && Array.isArray(res.responseHeaders)) {
            cur.responseHeaders = safeClone(res.responseHeaders);
          }
        }
        return { cancel: cancelled, responseHeaders: cur.responseHeaders, details: cur };
      },
      feedFilterData(requestId, data) {
        const f = state.streamFilters.get(String(requestId));
        if (!f) throw new Error("No stream filter for requestId: " + requestId);
        if (typeof f.ondata === "function") f.ondata({ data });
        if (typeof f.onstop === "function") f.onstop({});
      },
      getFilterOutput(requestId) {
        const f = state.streamFilters.get(String(requestId));
        return f ? f._written.slice() : [];
      },
    },
    cookies: {
      seed(list) {
        state.cookies = safeClone(list || []);
      },
      dump() {
        return safeClone(state.cookies);
      },
    },
    alarms: {
      trigger(name) {
        const alarm = state.alarms.get(name || "") || { name: name || "", scheduledTime: Date.now() };
        return events.alarmsOnAlarm._fire(safeClone(alarm));
      },
      dump() {
        return Array.from(state.alarms.values()).map((a) => safeClone(a));
      },
    },
    notifications: {
      triggerClick(id) {
        return events.notificationsOnClicked._fire(String(id));
      },
      dump() {
        return Array.from(state.notifications.values()).map((n) => safeClone(n));
      },
    },
    installClipboardSpy() {
      const history = state.clipboardHistory;
      if (typeof navigator !== "undefined") {
        const fakeClipboard = {
          writeText(txt) {
            history.push({ via: "navigator.clipboard.writeText", text: String(txt) });
            return Promise.resolve();
          },
          readText() {
            const last = history.length > 0 ? history[history.length - 1].text : "";
            return Promise.resolve(last);
          },
        };
        try {
          Object.defineProperty(navigator, "clipboard", {
            value: fakeClipboard,
            configurable: true,
          });
        } catch (_err) {
          // Ignore if read-only in strict env
        }
      }
      if (typeof document !== "undefined" && typeof document.execCommand === "function") {
        const origExec = document.execCommand.bind(document);
        document.execCommand = function (cmd, showUI, value) {
          if (String(cmd).toLowerCase() === "copy") {
            const active = document.activeElement;
            const sel = typeof window !== "undefined" && window.getSelection ? String(window.getSelection()) : "";
            const txt = sel || (active && typeof active.value === "string" ? active.value : "");
            history.push({ via: "execCommand", text: txt });
            return true;
          }
          return origExec(cmd, showUI, value);
        };
      }
      return {
        getText() {
          return history.length > 0 ? history[history.length - 1].text : "";
        },
        getHistory() {
          return safeClone(history);
        },
      };
    },
  };

  if (typeof window !== "undefined") {
    window.browser = browserApi;
    window.chrome = chromeApi;
    window.__webextMock = controller;
    if (window.__FOXHUB_TEST_SEED__ && typeof window.__FOXHUB_TEST_SEED__ === "object") {
      controller.configure(window.__FOXHUB_TEST_SEED__);
    }
  }
})();
