"""Local HTTP fixture and extension-serving server for headless Firefox tests."""

from __future__ import annotations

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import html
import json
from pathlib import Path
import re
import threading
import time
from typing import Any
from urllib.parse import parse_qs, unquote, urlsplit

MIME_TYPES: dict[str, str] = {
    ".html": "text/html; charset=utf-8",
    ".htm": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".ico": "image/x-icon",
    ".xml": "application/xml; charset=utf-8",
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
    ".wav": "audio/wav",
}

_MOCK_INJECT_SNIPPET = (
    '<link rel="icon" href="/icons/icon-16.png">\n'
    '<script src="/__test__/mock_seed.js"></script>\n'
    '<script src="/__test__/webext_mock.js"></script>\n'
)


def _inject_before_head_end(html_text: str, snippet: str) -> str:
    m = re.search(r"</head>", html_text, flags=re.IGNORECASE)
    if m:
        idx = m.start()
        return html_text[:idx] + snippet + html_text[idx:]
    m_script = re.search(r"<script\b", html_text, flags=re.IGNORECASE)
    if m_script:
        idx = m_script.start()
        return html_text[:idx] + snippet + html_text[idx:]
    return snippet + html_text


def _inject_after_head_start(html_text: str, snippet: str) -> str:
    m = re.search(r"<head\b[^>]*>", html_text, flags=re.IGNORECASE)
    if m:
        idx = m.end()
        return html_text[:idx] + "\n" + snippet + html_text[idx:]
    return snippet + html_text


def _build_mock_content_scripts(query_params: dict[str, list[str]]) -> str:
    raw = ",".join(query_params.get("inject_content", []))
    paths = [p.strip() for p in raw.split(",") if p.strip()]
    if not paths:
        return ""
    tags = [
        '<script src="/__test__/mock_seed.js"></script>',
        '<script src="/__test__/webext_mock.js"></script>',
    ]
    for p in paths:
        if p.startswith("/src/"):
            tags.append(f'<script src="{html.escape(p, quote=True)}"></script>')
    return "\n".join(tags) + "\n"


def _render_spotify_carousel_mock(rtl: bool = False) -> str:
    dir_attr = ' dir="rtl"' if rtl else ""
    return f"""<!doctype html>
<html{dir_attr}>
<head>
  <meta charset="utf-8">
  <title>Spotify – Web Player Carousel (Mock)</title>
  <style>
    /* Replicate Spotify live Web Player carousel negative bleed & desktop min-width tokens BEFORE FoxHub CSS */
    :root {{
      --content-max-width: 1955px;
      --regular-shelf-max-count: 11;
    }}
    html, body {{
      margin: 0;
      padding: 0;
      background: #121212;
      color: #fff;
      font-family: system-ui, sans-serif;
    }}
    [data-testid="root"] {{
      display: grid;
      grid-template-columns: 240px 1fr 280px;
      min-height: 100vh;
    }}
    [data-testid="main-view"] {{
      min-width: 480px;
    }}
    .sp-shelf-feed {{
      padding-inline: 40px;
    }}
    .contentSpacing {{
      padding-left: 40px;
      padding-right: 40px;
    }}
    section[data-shelf="carousel"] {{
      --carousel-shelf-element-width: calc(var(--content-max-width) / var(--regular-shelf-max-count));
      --shelf-fixed-min-width: 480px;
      --shelf-collapsable-min-width: 460px;
      --onboarding-shelf-min-width: 384px;
      --shelf-carousel-margin-start-mul: -1;
      --shelf-carousel-margin-end-mul: -1;
      --carousel-extra-inline-margin: 0px;
      min-width: var(--shelf-fixed-min-width);
      position: relative;
      margin-bottom: 24px;
    }}
    .sp-carousel-root {{
      position: relative;
      --encore-cards-margin: -12px;
      --margin: calc(40px + var(--encore-cards-margin) + var(--carousel-extra-inline-margin));
      --margin-start: calc(var(--encore-cards-margin) + (var(--shelf-carousel-margin-start-mul) * var(--margin)));
      --margin-end: calc(var(--encore-cards-margin) + (var(--shelf-carousel-margin-end-mul) * var(--margin)));
      margin-inline: var(--margin-start) var(--margin-end);
    }}
    [data-testid="carousel-scroller"] {{
      display: flex;
      overflow-x: auto;
      overflow-y: hidden;
      scroll-behavior: auto;
    }}
    [data-testid="carousel-scroller"] > div[role="presentation"] {{
      display: flex;
      gap: 12px;
      padding-inline-start: 40px;
    }}
    .sp-card {{
      flex: 0 0 auto;
      width: var(--carousel-shelf-element-width, 180px);
      min-width: 140px;
      height: 180px;
      background: #242424;
      border-radius: 8px;
      padding: 12px;
      box-sizing: border-box;
    }}
    .sp-chevrons-overlay {{
      position: absolute;
      inset: 0;
      left: 8px;
      right: 8px;
      display: flex;
      justify-content: space-between;
      pointer-events: none;
      opacity: 0;
    }}
    [data-testid="carousel-previous-button"],
    [data-testid="carousel-next-button"] {{
      position: relative;
      top: 50%;
      margin-top: -16px;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: rgba(0, 0, 0, 0.85);
      color: #fff;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      pointer-events: initial;
      cursor: pointer;
      translate: 8px 0;
    }}
    [data-testid="carousel-next-button"] {{
      translate: -8px 0;
    }}
    .sp-grid-1fr {{
      display: grid;
      grid-template-columns: 1fr;
      gap: 12px;
      margin-bottom: 18px;
    }}
    .sp-chips-carousel-root {{
      position: relative;
      --encore-cards-margin: -8px;
      margin-inline: -16px;
    }}
    .sp-chips-row {{
      display: flex;
      gap: 8px;
      white-space: nowrap;
      padding-inline-start: 24px;
    }}
    .sp-chip {{
      flex: 0 0 auto;
      min-width: 96px;
      padding: 6px 14px;
      border: 0;
      border-radius: 999px;
      background: #2a2a2a;
      color: #fff;
      font-size: 13px;
    }}
    [data-testid="now-playing-bar"] {{
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      background: #000;
      padding: 6px 10px;
    }}
  </style>
  <link id="pm-frame-base-css" rel="stylesheet" href="/src/content/css/base.css">
  <link id="pm-frame-app-css" rel="stylesheet" href="/src/content/css/spotify.css">
</head>
<body>
  <div data-testid="root">
    <div id="Desktop_LeftSidebar_Id">Left Nav</div>
    <div id="main-view" data-testid="main-view">
      <div class="sp-shelf-feed contentSpacing">
        <div class="sp-grid-1fr" data-testid="home-chips-grid">
          <div class="sp-grid-item" data-testid="home-chips-grid-item">
            <div class="sp-chips-carousel-root" data-testid="home-chips-carousel">
              <div data-testid="carousel-scroller" role="list">
                <div role="presentation" class="sp-chips-row">
                  <button type="button" class="sp-chip">All</button>
                  <button type="button" class="sp-chip">Music</button>
                  <button type="button" class="sp-chip">Podcasts</button>
                  <button type="button" class="sp-chip">Audiobooks</button>
                  <button type="button" class="sp-chip">Chill Mix</button>
                  <button type="button" class="sp-chip">Workout Vibes</button>
                  <button type="button" class="sp-chip">Focus Instrumental</button>
                  <button type="button" class="sp-chip">Discover Weekly</button>
                  <button type="button" class="sp-chip">Release Radar</button>
                  <button type="button" class="sp-chip">Electronic Radio</button>
                </div>
              </div>
              <div class="sp-chevrons-overlay">
                <div data-testid="carousel-previous-button" aria-hidden="true">&#8249;</div>
                <div data-testid="carousel-next-button" aria-hidden="true">&#8250;</div>
              </div>
            </div>
          </div>
        </div>
        <div class="sp-grid-1fr" data-testid="home-chips-nav-wrapped-grid">
          <nav aria-label="Filter chips">
            <div class="sp-chips-carousel-root" data-testid="home-chips-nav-wrapped">
              <div data-testid="carousel-scroller" role="list">
                <div role="presentation" class="sp-chips-row">
                  <button type="button" class="sp-chip">All</button>
                  <button type="button" class="sp-chip">Music</button>
                  <button type="button" class="sp-chip">Podcasts</button>
                  <button type="button" class="sp-chip">Audiobooks</button>
                  <button type="button" class="sp-chip">Chill Mix</button>
                  <button type="button" class="sp-chip">Workout Vibes</button>
                  <button type="button" class="sp-chip">Focus Instrumental</button>
                  <button type="button" class="sp-chip">Discover Weekly</button>
                  <button type="button" class="sp-chip">Release Radar</button>
                  <button type="button" class="sp-chip">Electronic Radio</button>
                </div>
              </div>
              <div class="sp-chevrons-overlay">
                <div data-testid="carousel-previous-button" aria-hidden="true">&#8249;</div>
                <div data-testid="carousel-next-button" aria-hidden="true">&#8250;</div>
              </div>
            </div>
          </nav>
        </div>
        <div class="sp-grid-1fr" data-testid="home-chips-nav-direct-grid">
          <nav class="sp-chips-carousel-root" data-testid="home-chips-nav-direct" aria-label="Mood chips">
            <div data-testid="carousel-scroller" role="list">
              <div role="presentation" class="sp-chips-row">
                <button type="button" class="sp-chip">All</button>
                <button type="button" class="sp-chip">Music</button>
                <button type="button" class="sp-chip">Podcasts</button>
                <button type="button" class="sp-chip">Audiobooks</button>
                <button type="button" class="sp-chip">Chill Mix</button>
                <button type="button" class="sp-chip">Workout Vibes</button>
                <button type="button" class="sp-chip">Focus Instrumental</button>
                <button type="button" class="sp-chip">Discover Weekly</button>
                <button type="button" class="sp-chip">Release Radar</button>
                <button type="button" class="sp-chip">Electronic Radio</button>
              </div>
            </div>
            <div class="sp-chevrons-overlay">
              <div data-testid="carousel-previous-button" aria-hidden="true">&#8249;</div>
              <div data-testid="carousel-next-button" aria-hidden="true">&#8250;</div>
            </div>
          </nav>
        </div>
        <section data-shelf="carousel" data-testid="recently-played-shelf">
          <h2>Recently played</h2>
          <div class="sp-carousel-root">
            <div data-testid="carousel-scroller" role="list">
              <div role="presentation">
                <div class="sp-card" data-carousel-item="true">Card 1</div>
                <div class="sp-card" data-carousel-item="true">Card 2</div>
                <div class="sp-card" data-carousel-item="true">Card 3</div>
                <div class="sp-card" data-carousel-item="true">Card 4</div>
                <div class="sp-card" data-carousel-item="true">Card 5</div>
                <div class="sp-card" data-carousel-item="true">Card 6</div>
                <div class="sp-card" data-carousel-item="true">Card 7</div>
                <div class="sp-card" data-carousel-item="true">Card 8</div>
              </div>
            </div>
            <div class="sp-chevrons-overlay">
              <div data-testid="carousel-previous-button" aria-hidden="true">&#8249;</div>
              <div data-testid="carousel-next-button" aria-hidden="true">&#8250;</div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
  <footer data-testid="now-playing-bar">
    <div>
      <div data-testid="now-playing-widget">
        <a data-testid="context-item-info-title" href="#track">Midnight City</a>
        <a data-testid="context-item-info-subtitles" href="#artist">M83</a>
      </div>
      <div>
        <div data-testid="player-controls">
          <button data-testid="control-button-skip-back" type="button" aria-label="Previous">Prev</button>
          <button data-testid="control-button-playpause" type="button" aria-label="Pause">Pause</button>
          <button data-testid="control-button-skip-forward" type="button" aria-label="Next">Next</button>
        </div>
      </div>
      <div><div data-testid="volume-bar"><button type="button" aria-label="Mute">Mute</button><div></div></div></div>
    </div>
  </footer>
  <script>
    (function () {{
      window.__skipEvents = [];
      var isRtl = document.documentElement.getAttribute('dir') === 'rtl';
      var sign = isRtl ? -1 : 1;
      function wireCarousel(rootSel) {{
        var root = document.querySelector(rootSel);
        if (!root) return;
        var scroller = root.querySelector('[data-testid="carousel-scroller"]');
        var nextBtn = root.querySelector('[data-testid="carousel-next-button"]');
        var prevBtn = root.querySelector('[data-testid="carousel-previous-button"]');
        if (nextBtn && scroller) {{
          nextBtn.addEventListener('click', function () {{
            scroller.scrollLeft += 180 * sign;
          }});
        }}
        if (prevBtn && scroller) {{
          prevBtn.addEventListener('click', function () {{
            if (isRtl) {{
              scroller.scrollLeft = Math.min(0, scroller.scrollLeft + 180);
            }} else {{
              scroller.scrollLeft = Math.max(0, scroller.scrollLeft - 180);
            }}
          }});
        }}
      }}
      wireCarousel('[data-testid="recently-played-shelf"]');
      wireCarousel('[data-testid="home-chips-carousel"]');
      wireCarousel('[data-testid="home-chips-nav-wrapped"]');
      wireCarousel('[data-testid="home-chips-nav-direct"]');
      document.querySelector('[data-testid="control-button-skip-back"]').addEventListener('click', function () {{
        window.__skipEvents.push('prev');
      }});
      document.querySelector('[data-testid="control-button-skip-forward"]').addEventListener('click', function () {{
        window.__skipEvents.push('next');
      }});
    }})();
  </script>
</body>
</html>"""


def _render_spotify_mock(playing: bool) -> str:
    state_str = "true" if playing else "false"
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Spotify – Web Player (Mock)</title>
</head>
<body>
  <div data-testid="now-playing-widget">
    <a data-testid="context-item-info-title" href="#track">Midnight City</a>
    <a data-testid="context-item-info-artist" href="#artist">M83</a>
    <button data-testid="control-button-playpause" type="button">Play/Pause</button>
    <button data-testid="control-button-skip-back" type="button">Prev</button>
    <button data-testid="control-button-skip-forward" type="button">Next</button>
  </div>
  <audio id="mock-spotify-audio"></audio>
  <script>
    (function () {{
      var audio = document.getElementById("mock-spotify-audio");
      var isPlaying = {state_str};
      var curTime = isPlaying ? 42.5 : 0;
      Object.defineProperty(audio, "paused", {{ get: function () {{ return !isPlaying; }}, configurable: true }});
      Object.defineProperty(audio, "currentTime", {{
        get: function () {{ return curTime; }},
        set: function (v) {{ curTime = Number(v) || 0; }},
        configurable: true
      }});
      Object.defineProperty(audio, "duration", {{ get: function () {{ return 244; }}, configurable: true }});
      audio.play = function () {{ isPlaying = true; audio.dispatchEvent(new Event("play")); return Promise.resolve(); }};
      audio.pause = function () {{ isPlaying = false; audio.dispatchEvent(new Event("pause")); }};
      document.querySelector('[data-testid="control-button-playpause"]').addEventListener("click", function () {{
        if (isPlaying) audio.pause(); else audio.play();
      }});
    }})();
  </script>
</body>
</html>"""


def _render_soundcloud_mock(playing: bool) -> str:
    state_str = "true" if playing else "false"
    playing_cls = " playing" if playing else ""
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>SoundCloud (Mock)</title>
</head>
<body>
  <div class="playControls">
    <button class="skipControl__previous" type="button">Previous</button>
    <button class="playControl{playing_cls}" type="button">Play</button>
    <button class="skipControl__next" type="button">Next</button>
    <a class="playbackSoundBadge__titleLink" href="#sc-track"><span>Sunset Synth</span></a>
    <a class="playbackSoundBadge__lightLink" href="#sc-artist">Neon Waves</a>
  </div>
  <audio id="mock-sc-audio"></audio>
  <script>
    (function () {{
      var audio = document.getElementById("mock-sc-audio");
      var isPlaying = {state_str};
      var playBtn = document.querySelector(".playControl");
      Object.defineProperty(audio, "paused", {{ get: function () {{ return !isPlaying; }}, configurable: true }});
      Object.defineProperty(audio, "duration", {{ get: function () {{ return 195; }}, configurable: true }});
      audio.play = function () {{ isPlaying = true; playBtn.classList.add("playing"); audio.dispatchEvent(new Event("play")); return Promise.resolve(); }};
      audio.pause = function () {{ isPlaying = false; playBtn.classList.remove("playing"); audio.dispatchEvent(new Event("pause")); }};
      playBtn.addEventListener("click", function () {{
        if (isPlaying) audio.pause(); else audio.play();
      }});
    }})();
  </script>
</body>
</html>"""


def _render_youtube_mock(playing: bool) -> str:
    state_str = "true" if playing else "false"
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>YouTube (Mock)</title>
</head>
<body>
  <ytmusic-player-bar>
    <div class="title">Lofi Beats</div>
    <div class="byline">ChilledCow</div>
  </ytmusic-player-bar>
  <div id="movie_player">
    <video id="mock-yt-video"></video>
    <button class="ytp-play-button" type="button">Play</button>
    <button class="ytp-next-button" type="button">Next</button>
  </div>
  <script>
    (function () {{
      var video = document.getElementById("mock-yt-video");
      var isPlaying = {state_str};
      Object.defineProperty(video, "paused", {{ get: function () {{ return !isPlaying; }}, configurable: true }});
      Object.defineProperty(video, "duration", {{ get: function () {{ return 360; }}, configurable: true }});
      video.play = function () {{ isPlaying = true; video.dispatchEvent(new Event("play")); return Promise.resolve(); }};
      video.pause = function () {{ isPlaying = false; video.dispatchEvent(new Event("pause")); }};
      document.querySelector(".ytp-play-button").addEventListener("click", function () {{
        if (isPlaying) video.pause(); else video.play();
      }});
    }})();
  </script>
</body>
</html>"""


def _render_gmail_mock() -> str:
    return """<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Gmail (Mock)</title>
</head>
<body>
  <div role="main">
    <button id="mock-gmail-compose" type="button">Compose</button>
    <div class="mock-thread-row" data-thread-id="t-1">Welcome to FoxHub</div>
    <div class="mock-thread-row" data-thread-id="t-2">Build Notification</div>
  </div>
</body>
</html>"""


def _render_normal_tab_mock(playing: bool) -> str:
    state_str = "true" if playing else "false"
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Normal Web Page (Mock)</title>
</head>
<body>
  <h1>Normal HTTP Tab</h1>
  <video id="tab-video"></video>
  <audio id="tab-audio"></audio>
  <button id="btn-toggle-media" type="button">Toggle Media</button>
  <script>
    (function () {{
      var video = document.getElementById("tab-video");
      var audio = document.getElementById("tab-audio");
      var isPlaying = {state_str};
      Object.defineProperty(video, "paused", {{ get: function () {{ return !isPlaying; }}, configurable: true }});
      Object.defineProperty(video, "duration", {{ get: function () {{ return 120; }}, configurable: true }});
      Object.defineProperty(video, "mozHasAudio", {{ get: function () {{ return true; }}, configurable: true }});
      if (audio) {{
        Object.defineProperty(audio, "mozHasAudio", {{ get: function () {{ return true; }}, configurable: true }});
      }}
      video.play = function () {{
        isPlaying = true;
        video.dispatchEvent(new Event("play"));
        video.dispatchEvent(new Event("playing"));
        return Promise.resolve();
      }};
      video.pause = function () {{ isPlaying = false; video.dispatchEvent(new Event("pause")); }};
      document.getElementById("btn-toggle-media").addEventListener("click", function () {{
        if (isPlaying) video.pause(); else video.play();
      }});
    }})();
  </script>
</body>
</html>"""


def _render_custom_echo_mock(name: str, user_agent: str, query_str: str) -> str:
    safe_name = html.escape(name or "echo")
    safe_ua = html.escape(user_agent or "")
    safe_q = html.escape(query_str or "")
    return f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Custom App: {safe_name}</title>
</head>
<body>
  <h1 id="custom-title">{safe_name}</h1>
  <div id="echo-ua">{safe_ua}</div>
  <div id="echo-query">{safe_q}</div>
  <a id="echo-link" href="/mock/custom/linked">Linked Page</a>
</body>
</html>"""


class FixtureServer:
    """Thread-safe local HTTP server for FoxHub extension files and mock targets."""

    def __init__(
        self,
        project_root: str | Path,
        webext_mock_path: str | Path | None = None,
    ) -> None:
        self.project_root = Path(project_root).resolve()
        if webext_mock_path is None:
            self.webext_mock_path = Path(__file__).resolve().parent / "webext_mock.js"
        else:
            self.webext_mock_path = Path(webext_mock_path).resolve()

        self._lock = threading.Lock()
        self._mock_seed: dict[str, Any] = {}
        self._dynamic_fixtures: dict[str, tuple[int, str, bytes]] = {}
        self._captured_requests: list[dict[str, Any]] = []
        self._telemetry_events: list[dict[str, Any]] = []

        self._httpd: ThreadingHTTPServer | None = None
        self._thread: threading.Thread | None = None

    @property
    def port(self) -> int:
        if self._httpd is None:
            raise RuntimeError("FixtureServer is not started")
        return int(self._httpd.server_address[1])

    @property
    def base_url(self) -> str:
        return f"http://127.0.0.1:{self.port}"

    def url_for(self, path: str) -> str:
        clean = path if path.startswith("/") else f"/{path}"
        return f"{self.base_url}{clean}"

    def __enter__(self) -> "FixtureServer":
        return self.start()

    def __exit__(self, exc_type: Any, exc: Any, tb: Any) -> None:
        self.stop()

    def start(self) -> "FixtureServer":
        if self._httpd is not None:
            return self
        server_owner = self

        class _Handler(BaseHTTPRequestHandler):
            def do_GET(self) -> None:  # noqa: N802
                server_owner._handle_request(self, "GET")

            def do_POST(self) -> None:  # noqa: N802
                server_owner._handle_request(self, "POST")

            def do_DELETE(self) -> None:  # noqa: N802
                server_owner._handle_request(self, "DELETE")

            def do_OPTIONS(self) -> None:  # noqa: N802
                self.send_response(204)
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
                self.send_header("Access-Control-Allow-Headers", "*")
                self.end_headers()

            def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
                pass

        self._httpd = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
        self._thread = threading.Thread(target=self._httpd.serve_forever, daemon=True)
        self._thread.start()
        return self

    def stop(self) -> None:
        if self._httpd is not None:
            self._httpd.shutdown()
            self._httpd.server_close()
            self._httpd = None
        if self._thread is not None:
            self._thread.join(timeout=3.0)
            self._thread = None

    def set_seed(self, seed: dict[str, Any]) -> None:
        with self._lock:
            self._mock_seed = dict(seed)

    def clear_seed(self) -> None:
        with self._lock:
            self._mock_seed = {}

    def register_fixture(
        self,
        name: str,
        body: str | bytes,
        content_type: str = "text/html; charset=utf-8",
        status: int = 200,
    ) -> str:
        clean_name = name.lstrip("/")
        raw = body.encode("utf-8") if isinstance(body, str) else bytes(body)
        with self._lock:
            self._dynamic_fixtures[clean_name] = (int(status), content_type, raw)
        return self.url_for(f"/__test__/fixture/{clean_name}")

    def get_requests(self, path_prefix: str | None = None) -> list[dict[str, Any]]:
        with self._lock:
            items = list(self._captured_requests)
        if path_prefix is not None:
            items = [r for r in items if r["path"].startswith(path_prefix)]
        return items

    def clear_requests(self) -> None:
        with self._lock:
            self._captured_requests.clear()

    def get_telemetry(self) -> list[dict[str, Any]]:
        with self._lock:
            return list(self._telemetry_events)

    def clear_telemetry(self) -> None:
        with self._lock:
            self._telemetry_events.clear()

    def _send_bytes(
        self,
        handler: BaseHTTPRequestHandler,
        status: int,
        content_type: str,
        body: bytes,
    ) -> None:
        handler.send_response(status)
        handler.send_header("Content-Type", content_type)
        handler.send_header("Content-Length", str(len(body)))
        handler.send_header("Cache-Control", "no-store")
        handler.send_header("Access-Control-Allow-Origin", "*")
        handler.end_headers()
        handler.wfile.write(body)

    def _send_json(self, handler: BaseHTTPRequestHandler, status: int, data: Any) -> None:
        payload = json.dumps(data).encode("utf-8")
        self._send_bytes(handler, status, "application/json; charset=utf-8", payload)

    def _handle_request(self, handler: BaseHTTPRequestHandler, method: str) -> None:
        parsed = urlsplit(handler.path)
        req_path = unquote(parsed.path)
        query = parse_qs(parsed.query, keep_blank_values=True)

        raw_len = handler.headers.get("Content-Length", "0") or "0"
        try:
            content_len = int(raw_len)
        except ValueError:
            self._send_json(handler, 400, {"error": "Invalid Content-Length header"})
            return
        if content_len < 0:
            self._send_json(handler, 400, {"error": "Negative Content-Length header"})
            return
        body_bytes = handler.rfile.read(content_len) if content_len > 0 else b""

        if not req_path.startswith("/__test__/requests") and not req_path.startswith("/__test__/telemetry") and req_path != "/__test__/health":
            with self._lock:
                self._captured_requests.append(
                    {
                        "method": method,
                        "path": req_path,
                        "query": parsed.query,
                        "headers": {k.lower(): v for k, v in handler.headers.items()},
                        "body": body_bytes.decode("utf-8", errors="replace"),
                        "timestamp": time.time(),
                    }
                )

        # 1. Test harness control endpoints
        if req_path == "/__test__/health":
            self._send_json(handler, 200, {"ok": True})
            return

        if req_path == "/__test__/webext_mock.js":
            if not self.webext_mock_path.is_file():
                self._send_json(handler, 404, {"error": "webext_mock.js not found"})
                return
            self._send_bytes(handler, 200, "text/javascript; charset=utf-8", self.webext_mock_path.read_bytes())
            return

        if req_path == "/__test__/mock_seed.js":
            with self._lock:
                seed_json = json.dumps(self._mock_seed)
            js_body = f"window.__FOXHUB_TEST_SEED__ = {seed_json};\n".encode("utf-8")
            self._send_bytes(handler, 200, "text/javascript; charset=utf-8", js_body)
            return

        if req_path == "/__test__/requests":
            if method == "GET":
                prefix = query.get("prefix", [None])[0]
                self._send_json(handler, 200, self.get_requests(path_prefix=prefix))
                return
            if method == "DELETE":
                self.clear_requests()
                self._send_json(handler, 200, {"ok": True})
                return
            if method == "POST":
                try:
                    payload = json.loads(body_bytes.decode("utf-8") or "{}")
                except ValueError:
                    payload = {}
                if payload.get("action") == "clear":
                    self.clear_requests()
                self._send_json(handler, 200, {"ok": True})
                return

        if req_path == "/__test__/telemetry":
            if method == "GET":
                self._send_json(handler, 200, self.get_telemetry())
                return
            if method == "DELETE":
                self.clear_telemetry()
                self._send_json(handler, 200, {"ok": True})
                return
            if method == "POST":
                try:
                    evt = json.loads(body_bytes.decode("utf-8") or "{}")
                except ValueError:
                    evt = {"raw": body_bytes.decode("utf-8", errors="replace")}
                with self._lock:
                    self._telemetry_events.append(evt)
                self._send_json(handler, 200, {"ok": True})
                return

        if req_path.startswith("/__test__/fixture/"):
            fixture_name = req_path[len("/__test__/fixture/"):]
            with self._lock:
                entry = self._dynamic_fixtures.get(fixture_name)
            if entry is None:
                self._send_json(handler, 404, {"error": f"Unknown fixture: {fixture_name}"})
                return
            status, ctype, raw = entry
            self._send_bytes(handler, status, ctype, raw)
            return

        # 2. Mock target web pages
        if req_path.startswith("/mock/"):
            self._serve_mock_page(handler, req_path, parsed.query, query)
            return

        # 3. Extension files (/src/**, /icons/**, /manifest.json)
        if req_path == "/manifest.json" or req_path.startswith("/src/") or req_path.startswith("/icons/"):
            candidate: Path | None = None
            allowed = False
            if req_path == "/manifest.json":
                expected = (self.project_root / "manifest.json").resolve()
                candidate = expected
                allowed = True
            elif req_path.startswith("/src/"):
                src_root = (self.project_root / "src").resolve()
                rel = req_path[len("/src/"):]
                if rel and not rel.startswith(("/", "\\")):
                    candidate = (src_root / rel).resolve()
                    allowed = candidate.is_relative_to(src_root)
            elif req_path.startswith("/icons/"):
                icons_root = (self.project_root / "icons").resolve()
                rel = req_path[len("/icons/"):]
                if rel and not rel.startswith(("/", "\\")):
                    candidate = (icons_root / rel).resolve()
                    allowed = candidate.is_relative_to(icons_root)

            if not allowed or candidate is None or not candidate.is_file():
                self._send_json(handler, 404, {"error": "Not found"})
                return
            ctype = MIME_TYPES.get(candidate.suffix.lower(), "application/octet-stream")
            raw = candidate.read_bytes()
            if (
                req_path.startswith("/src/")
                and candidate.suffix.lower() in (".html", ".htm")
                and query.get("nomock", ["0"])[0] != "1"
            ):
                text = raw.decode("utf-8", errors="replace")
                text = _inject_before_head_end(text, _MOCK_INJECT_SNIPPET)
                raw = text.encode("utf-8")
            self._send_bytes(handler, 200, ctype, raw)
            return

        self._send_json(handler, 404, {"error": f"Unknown route: {req_path}"})

    def _serve_mock_page(
        self,
        handler: BaseHTTPRequestHandler,
        req_path: str,
        raw_query: str,
        query: dict[str, list[str]],
    ) -> None:
        if req_path == "/mock/gmail/feed":
            feed = (
                '<?xml version="1.0" encoding="UTF-8"?>'
                "<feed version='0.3' xmlns='http://purl.org/atom/ns#'>"
                "<title>Gmail - Inbox</title>"
                "<fullcount>2</fullcount>"
                "<entry><title>Welcome to FoxHub</title><id>tag:gmail.google.com,2026:1</id></entry>"
                "<entry><title>Test Build</title><id>tag:gmail.google.com,2026:2</id></entry>"
                "</feed>"
            )
            self._send_bytes(handler, 200, "application/xml; charset=utf-8", feed.encode("utf-8"))
            return

        playing = (query.get("playing", ["0"])[0] == "1") or (query.get("autoplay", ["0"])[0] == "1")
        if req_path == "/mock/spotify":
            doc = _render_spotify_mock(playing)
        elif req_path == "/mock/spotify-carousel":
            doc = _render_spotify_carousel_mock(rtl=(query.get("rtl", ["0"])[0] == "1"))
        elif req_path == "/mock/soundcloud":
            doc = _render_soundcloud_mock(playing)
        elif req_path == "/mock/youtube":
            doc = _render_youtube_mock(playing)
        elif req_path == "/mock/gmail":
            doc = _render_gmail_mock()
        elif req_path == "/mock/normal-tab":
            doc = _render_normal_tab_mock(playing)
        elif req_path == "/mock/echo":
            doc = _render_custom_echo_mock("echo", handler.headers.get("User-Agent", ""), raw_query)
        elif req_path.startswith("/mock/custom/"):
            name = req_path[len("/mock/custom/"):] or "custom"
            doc = _render_custom_echo_mock(name, handler.headers.get("User-Agent", ""), raw_query)
        else:
            self._send_json(handler, 404, {"error": f"Unknown mock page: {req_path}"})
            return

        inject_snippet = _build_mock_content_scripts(query)
        if inject_snippet:
            doc = _inject_after_head_start(doc, inject_snippet)
        self._send_bytes(handler, 200, "text/html; charset=utf-8", doc.encode("utf-8"))
