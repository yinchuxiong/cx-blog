/**
 * NavMusic — 网易云风格悬浮音乐播放器
 * APlayer 隐藏在 #nav-music-aplayer 中仅作音频引擎，自定义 UI 完全独立渲染
 *
 * 交互：
 * - 封面点击 → 展开/收起歌词面板
 * - 列表按钮 → 展开/收起歌单
 */
var NavMusic = (function () {
  var ap = null;
  var container = null;
  var songs = [];
  var lrcParsed = [];        // { time: seconds, text: string }[]
  var currentIndex = -1;
  var playing = false;
  var lyricVisible = false;
  var playlistVisible = false;

  // DOM 缓存
  var $coverImg, $title, $artist, $progressPlayed;
  var $liquidFill, $idleLyric, $idleSong;
  var $playBtn, $lyricPanel, $lyricInner, $playlistPanel, $playlistList, $playlistCount;
  var $floatBar;

  function escapeHtml(text) {
    var div = document.createElement("div");
    div.textContent = text || "";
    return div.innerHTML;
  }

  // 解析 LRC 歌词
  function parseLrc(lrcText) {
    var lines = [];
    if (!lrcText) return lines;
    var arr = lrcText.split("\n");
    var regex = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/g;
    for (var i = 0; i < arr.length; i++) {
      var line = arr[i].trim();
      if (!line) continue;
      var times = [];
      var match;
      while ((match = regex.exec(line)) !== null) {
        var min = parseInt(match[1], 10);
        var sec = parseInt(match[2], 10);
        var ms = match[3] ? parseInt(match[3], 10) : 0;
        if (match[3] && match[3].length === 2) ms *= 10;
        times.push(min * 60 + sec + ms / 1000);
      }
      if (times.length === 0) continue;
      var text = line.replace(/\[.*?\]/g, "").trim();
      for (var j = 0; j < times.length; j++) {
        lines.push({ time: times[j], text: text });
      }
    }
    lines.sort(function (a, b) { return a.time - b.time; });
    return lines;
  }

  // 从 meting API 拉取歌单（保留 song id 用于后续获取歌词）
  function fetchSongs(server, id) {
    var api = window.meting_api;
    if (!api) {
      console.warn("NavMusic: meting_api not configured");
      return Promise.resolve([]);
    }
    var url = api
      .replace(":server", server)
      .replace(":type", "playlist")
      .replace(":id", id)
      .replace(":r", Math.random());

    return fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!Array.isArray(data)) return [];
        return data.map(function (song) {
          return {
            id: song.id || "",
            name: song.name || "未知歌曲",
            artist: song.artist || "未知艺术家",
            url: song.url || "",
            cover: song.pic || song.cover || "",
            lrc: song.lrc || song.lyric || "",
          };
        });
      })
      .catch(function (err) {
        console.error("NavMusic: 获取歌单失败", err);
        return [];
      });
  }

  function waitForAPlayer() {
    if (typeof APlayer !== "undefined") return Promise.resolve(true);
    return new Promise(function (resolve) {
      var attempts = 0;
      var timer = setInterval(function () {
        attempts++;
        if (typeof APlayer !== "undefined") {
          clearInterval(timer);
          resolve(true);
        } else if (attempts >= 30) {
          clearInterval(timer);
          resolve(false);
        }
      }, 100);
    });
  }

  function createNativePlayer(audioList, volume) {
    var audio = document.createElement("audio");
    audio.preload = "auto";
    audio.volume = volume;
    audio.style.display = "none";

    var aplayerEl = document.getElementById("nav-music-aplayer");
    if (aplayerEl) aplayerEl.appendChild(audio);

    var handlers = {};
    function emit(name, payload) {
      (handlers[name] || []).forEach(function (fn) {
        try {
          fn(payload);
        } catch (e) {}
      });
    }

    audio.addEventListener("timeupdate", function () { emit("timeupdate"); });
    audio.addEventListener("play", function () { emit("play"); });
    audio.addEventListener("pause", function () { emit("pause"); });
    audio.addEventListener("ended", function () {
      if (!audioList.length) return;
      nativePlayer.list.index = (nativePlayer.list.index + 1) % audioList.length;
      emit("listswitch", { index: nativePlayer.list.index });
      var next = audioList[nativePlayer.list.index];
      if (next && next.url) {
        audio.src = next.url;
        audio.play().catch(function () {});
      }
    });

    var nativePlayer = {
      audio: audio,
      list: {
        index: 0,
        audios: audioList,
      },
      on: function (name, fn) {
        if (!handlers[name]) handlers[name] = [];
        handlers[name].push(fn);
      },
      play: function () {
        var song = audioList[this.list.index];
        if (song && song.url && audio.src !== song.url) audio.src = song.url;
        return audio.play();
      },
      pause: function () {
        audio.pause();
      },
    };

    return nativePlayer;
  }

  // 单独获取歌词（type=lyric 端点）
  function fetchLyric(songId) {
    var api = window.meting_api;
    if (!api || !songId) return Promise.resolve("");
    var url = api
      .replace(":server", "netease")
      .replace(":type", "lyric")
      .replace(":id", songId)
      .replace(":r", Math.random());
    return fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) { return (data && data.lyric) || ""; })
      .catch(function () { return ""; });
  }

  // ---- UI 渲染 ----

  function updatePlayBtn() {
    if (!$playBtn) return;
    $playBtn.innerHTML = playing
      ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>'
      : '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="8,5 19,12 8,19"/></svg>';
    $playBtn.title = playing ? "暂停" : "播放";
  }

  function cssUrl(value) {
    return 'url("' + String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '")';
  }

  function toRgb(sample) {
    return "rgb(" + sample[0] + ", " + sample[1] + ", " + sample[2] + ")";
  }

  function mixRgb(a, b, weight) {
    return [
      Math.round(a[0] * (1 - weight) + b[0] * weight),
      Math.round(a[1] * (1 - weight) + b[1] * weight),
      Math.round(a[2] * (1 - weight) + b[2] * weight),
    ];
  }

  function sampleCoverPalette(src) {
    if (!src) return;
    var img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = function () {
      try {
        var canvas = document.createElement("canvas");
        var size = 24;
        canvas.width = size;
        canvas.height = size;
        var ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, size, size);
        var data = ctx.getImageData(0, 0, size, size).data;
        var left = [0, 0, 0];
        var right = [0, 0, 0];
        var leftCount = 0;
        var rightCount = 0;
        for (var y = 0; y < size; y++) {
          for (var x = 0; x < size; x++) {
            var idx = (y * size + x) * 4;
            if (data[idx + 3] < 24) continue;
            var target = x < size / 2 ? left : right;
            target[0] += data[idx];
            target[1] += data[idx + 1];
            target[2] += data[idx + 2];
            if (x < size / 2) leftCount++;
            else rightCount++;
          }
        }
        if (!leftCount || !rightCount || !$floatBar) return;
        left = left.map(function (v) { return Math.round(v / leftCount); });
        right = right.map(function (v) { return Math.round(v / rightCount); });
        var dark = [18, 22, 32];
        $floatBar.style.setProperty("--nm-cover-color-a", toRgb(mixRgb(left, dark, 0.2)));
        $floatBar.style.setProperty("--nm-cover-color-b", toRgb(mixRgb(right, dark, 0.16)));
      } catch (e) {}
    };
    img.src = src;
  }

  function updateCoverAtmosphere(song) {
    if (!$floatBar || !song) return;
    var cover = song.cover || "";
    if (!cover) {
      $floatBar.style.removeProperty("--nm-cover-bg");
      $floatBar.style.removeProperty("--nm-cover-color-a");
      $floatBar.style.removeProperty("--nm-cover-color-b");
      return;
    }
    $floatBar.style.setProperty("--nm-cover-bg", cssUrl(cover));
    sampleCoverPalette(cover);
  }

  function ensureIdleView() {
    var floatBar = container && container.querySelector(".nm-float");
    if (!floatBar || floatBar.querySelector(".nm-idle-view")) return;

    var idleView = document.createElement("div");
    idleView.className = "nm-idle-view";
    idleView.setAttribute("aria-hidden", "true");
    idleView.innerHTML =
      '<div class="nm-liquid-fill"></div>' +
      '<div class="nm-idle-text">' +
        '<div class="nm-idle-lyric">未在播放</div>' +
        '<div class="nm-idle-song"></div>' +
      '</div>';
    floatBar.appendChild(idleView);
  }

  function updateLyricDOM(lrcText) {
    lrcParsed = parseLrc(lrcText);
    if (!$lyricInner) return;
    if (lrcParsed.length > 0) {
      $lyricInner.innerHTML = lrcParsed.map(function (l) {
        return '<p>' + escapeHtml(l.text) + '</p>';
      }).join("");
    } else {
      $lyricInner.innerHTML = '<p class="nm-no-lyric">纯音乐，请欣赏</p>';
    }
    updateIdleLyric();
  }

  function updateIdleSong(song) {
    if (!$idleSong) return;
    if (!song) {
      $idleSong.textContent = "";
      return;
    }
    $idleSong.textContent = song.name + (song.artist ? " - " + song.artist : "");
  }

  function updateIdleLyric(currentTime) {
    if (!$idleLyric) return;
    if (!lrcParsed.length) {
      $idleLyric.textContent = playing ? "听见此刻" : "未在播放";
      return;
    }

    var time = typeof currentTime === "number"
      ? currentTime
      : (ap && ap.audio ? ap.audio.currentTime || 0 : 0);
    var idx = -1;
    for (var i = 0; i < lrcParsed.length; i++) {
      if (lrcParsed[i].time <= time) idx = i;
      else break;
    }
    var line = idx >= 0 ? lrcParsed[idx].text : lrcParsed[0].text;
    $idleLyric.textContent = line || (playing ? "听见此刻" : "未在播放");
  }

  function updateSongInfo(index) {
    var song = songs[index];
    if (!song) return;
    if ($coverImg) {
      $coverImg.src = song.cover || "";
      $coverImg.style.display = song.cover ? "" : "none";
    }
    if ($title) {
      $title.textContent = song.name;
      $title.title = song.name;
    }
    if ($artist) $artist.textContent = song.artist;
    updateIdleSong(song);
    updateCoverAtmosphere(song);

    // 歌词：先尝试已有数据，否则通过 API 获取
    if (song.lrc) {
      updateLyricDOM(song.lrc);
    } else {
      $lyricInner && ($lyricInner.innerHTML = '<p class="nm-no-lyric">加载歌词中…</p>');
      if ($idleLyric) $idleLyric.textContent = "Loading lyrics...";
      lrcParsed = [];
      if (song.id) {
        fetchLyric(song.id).then(function (lyricText) {
          if (songs[currentIndex] && songs[currentIndex].id === song.id) {
            song.lrc = lyricText;
            updateLyricDOM(lyricText);
          }
        });
      } else {
        updateLyricDOM("");
      }
    }
  }

  function updateProgress() {
    if (!ap || !ap.audio) return;
    var cur = ap.audio.currentTime || 0;
    var dur = ap.audio.duration || 0;
    var pct = dur > 0 ? (cur / dur) * 100 : 0;
    if ($progressPlayed) $progressPlayed.style.width = pct + "%";
    if ($liquidFill) $liquidFill.style.width = pct + "%";
    if ($floatBar) $floatBar.style.setProperty("--nm-progress", pct + "%");
  }

  function updateLyricHighlight(currentTime) {
    if (!$lyricInner || !lrcParsed.length) return;
    var lines = $lyricInner.querySelectorAll("p");
    if (!lines.length) return;
    var idx = -1;
    for (var i = 0; i < lrcParsed.length; i++) {
      if (lrcParsed[i].time <= currentTime) idx = i;
      else break;
    }
    for (var i = 0; i < lines.length; i++) {
      lines[i].classList.toggle("nm-lrc-active", i === idx);
    }
    updateIdleLyric(currentTime);
    if (idx >= 0 && lines[idx] && lyricVisible) {
      var panel = $lyricPanel;
      if (panel) {
        var lineH = lines[idx].offsetHeight || 32;
        var scrollTo = lines[idx].offsetTop - panel.clientHeight / 2 + lineH / 2;
        $lyricInner.style.transform = "translateY(" + (-scrollTo) + "px)";
      }
    }
  }

  function updatePlaylistHighlight(index) {
    if (!$playlistList) return;
    var items = $playlistList.querySelectorAll("li");
    for (var i = 0; i < items.length; i++) {
      items[i].classList.toggle("nm-pl-active", i === index);
    }
  }

  function refreshUI(index) {
    updateSongInfo(index);
    updatePlaylistHighlight(index);
    updatePlayBtn();
    updateProgress();
    if ($lyricInner) $lyricInner.style.transform = "translateY(0)";
  }

  // ---- 控制器同步 ----

  function syncPlayState(isPlaying) {
    playing = isPlaying;
    var menuToggle = document.getElementById("menu-music-toggle");
    var consoleMusic = document.getElementById("consoleMusic");
    var msgPlay = '<i class="anzhiyufont anzhiyu-icon-play"></i><span>播放音乐</span>';
    var msgPause = '<i class="anzhiyufont anzhiyu-icon-pause"></i><span>暂停音乐</span>';

    if (isPlaying) {
      container.classList.add("playing");
      if (menuToggle) menuToggle.innerHTML = msgPause;
      if (consoleMusic) consoleMusic.classList.add("on");
    } else {
      container.classList.remove("playing");
      if (menuToggle) menuToggle.innerHTML = msgPlay;
      if (consoleMusic) consoleMusic.classList.remove("on");
    }
    updatePlayBtn();
    updateIdleLyric();
  }

  // ---- 播放控制 ----

  function playIndex(index) {
    if (!ap || index < 0 || index >= songs.length) return;
    currentIndex = index;
    var song = songs[index];

    if (ap.audio.src !== song.url) {
      ap.audio.src = song.url;
    }
    ap.audio.play().catch(function () {});

    ap.list.index = index;
    refreshUI(index);
    syncPlayState(true);
  }

  // ---- 面板切换 ----

  function toggleLyric() {
    lyricVisible = !lyricVisible;
    if (playlistVisible && lyricVisible) hidePlaylist();
    if ($lyricPanel) $lyricPanel.classList.toggle("nm-show", lyricVisible);
  }

  function togglePlaylist() {
    playlistVisible = !playlistVisible;
    if (lyricVisible && playlistVisible) hideLyric();
    if ($playlistPanel) $playlistPanel.classList.toggle("nm-show", playlistVisible);
  }

  function hidePlaylist() {
    playlistVisible = false;
    if ($playlistPanel) $playlistPanel.classList.remove("nm-show");
  }

  function hideLyric() {
    lyricVisible = false;
    if ($lyricPanel) $lyricPanel.classList.remove("nm-show");
  }

  // ---- 播放列表构建 ----

  function rebuildPlaylist() {
    if (!$playlistList) return;
    $playlistList.innerHTML = "";
    songs.forEach(function (song, idx) {
      var li = document.createElement("li");
      li.innerHTML =
        '<span class="nm-pl-index">' + (idx + 1) + '</span>' +
        '<span class="nm-pl-title">' + escapeHtml(song.name) + '</span>' +
        '<span class="nm-pl-artist">' + escapeHtml(song.artist) + '</span>';
      li.addEventListener("click", function (e) {
        e.stopPropagation();
        playIndex(idx);
      });
      $playlistList.appendChild(li);
    });
    if ($playlistCount) {
      $playlistCount.textContent = "(" + songs.length + ")";
    }
  }

  // ---- 全局点击 / ESC 关闭面板 ----
  function onDocumentClick(e) {
    if (!container.contains(e.target)) {
      if (playlistVisible) hidePlaylist();
      if (lyricVisible) hideLyric();
      return;
    }
    var target = e.target;
    if (!target.closest(".nm-playlist-panel") && !target.closest(".nm-lyric-panel") &&
        !target.closest(".nm-btn-list") && !target.closest(".nm-cover")) {
      if (playlistVisible) hidePlaylist();
      if (lyricVisible) hideLyric();
    }
  }

  function onDocumentKeydown(e) {
    if (e.keyCode === 27) {
      if (playlistVisible) hidePlaylist();
      if (lyricVisible) hideLyric();
    }
  }

  // ---- 事件绑定 ----

  function bindEvents() {
    // 封面 → 展开/收起歌词
    var coverEl = container.querySelector(".nm-cover");
    if (coverEl) {
      coverEl.addEventListener("click", function (e) {
        e.stopPropagation();
        toggleLyric();
      });
    }

    // 播放/暂停
    $playBtn = container.querySelector(".nm-btn-play");
    if ($playBtn) {
      $playBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        toggle();
      });
    }

    // 上一曲
    var prevBtn = container.querySelector(".nm-btn-prev");
    if (prevBtn) {
      prevBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        skipPrev();
      });
    }

    // 下一曲
    var nextBtn = container.querySelector(".nm-btn-next");
    if (nextBtn) {
      nextBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        skipNext();
      });
    }

    // 播放列表
    var listBtn = container.querySelector(".nm-btn-list");
    if (listBtn) {
      listBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        togglePlaylist();
      });
    }

    // 播放列表关闭
    var closeBtn = container.querySelector(".nm-playlist-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        hidePlaylist();
      });
    }

    // 进度条点击跳转
    var progressBar = container.querySelector(".nm-progress-bar");
    if (progressBar) {
      progressBar.addEventListener("click", function (e) {
        e.stopPropagation();
        if (!ap || !ap.audio || !ap.audio.duration) return;
        var rect = progressBar.getBoundingClientRect();
        var pct = (e.clientX - rect.left) / rect.width;
        pct = Math.max(0, Math.min(1, pct));
        ap.audio.currentTime = pct * ap.audio.duration;
        updateProgress();
      });
    }

    $floatBar = container.querySelector(".nm-float");

    document.addEventListener("click", onDocumentClick);
    document.addEventListener("keydown", onDocumentKeydown);
  }

  // ---- 公开 API ----

  function init() {
    container = document.getElementById("nav-music");
    if (!container) return;

    var server = container.getAttribute("data-server") || "netease";
    var id = container.getAttribute("data-id") || "8152976493";
    var vol = parseFloat(container.getAttribute("data-volume"));
    var volume = !isNaN(vol) ? vol : 0.7;

    var aplayerEl = document.getElementById("nav-music-aplayer");
    if (!aplayerEl) return;
    ensureIdleView();

    // 缓存 DOM
    $coverImg = container.querySelector(".nm-cover-img");
    $title = container.querySelector(".nm-title");
    $artist = container.querySelector(".nm-artist");
    $progressPlayed = container.querySelector(".nm-progress-played");
    $lyricPanel = container.querySelector(".nm-lyric-panel");
    $lyricInner = container.querySelector(".nm-lyric-inner");
    $liquidFill = container.querySelector(".nm-liquid-fill");
    $idleLyric = container.querySelector(".nm-idle-lyric");
    $idleSong = container.querySelector(".nm-idle-song");
    $playlistPanel = container.querySelector(".nm-playlist-panel");
    $playlistList = container.querySelector(".nm-playlist-list");
    $playlistCount = container.querySelector(".nm-playlist-count");

    bindEvents();

    Promise.all([fetchSongs(server, id), waitForAPlayer()]).then(function (result) {
      var songList = result[0];
      var hasAPlayer = result[1];
      if (!songList.length) return;
      songs = songList;
      rebuildPlaylist();

      if (hasAPlayer) {
        ap = new APlayer({
          container: aplayerEl,
          fixed: false,
          mini: false,
          autoplay: false,
          theme: "var(--anzhiyu-main)",
          loop: "all",
          order: "list",
          preload: "auto",
          volume: volume,
          mutex: true,
          lrcType: 1,
          listFolded: true,
          audio: songs,
        });
      } else {
        console.warn("NavMusic: APlayer 未加载，已切换到浏览器原生音频播放");
        ap = createNativePlayer(songs, volume);
      }

      var lastLyricUpdate = 0;
      ap.on("timeupdate", function () {
        updateProgress();
        var now = Date.now();
        if (now - lastLyricUpdate > 200) {
          lastLyricUpdate = now;
          updateLyricHighlight(ap.audio.currentTime);
        }
      });

      ap.on("play", function () { syncPlayState(true); });
      ap.on("pause", function () { syncPlayState(false); });

      ap.on("listswitch", function (e) {
        if (e && typeof e.index === "number") {
          currentIndex = e.index;
          refreshUI(currentIndex);
        }
      });
    });
  }

  function toggle() {
    if (!ap) return;
    if (playing) {
      ap.pause();
    } else {
      if (currentIndex < 0) {
        playIndex(0);
      } else {
        ap.play();
      }
    }
    if (typeof rm !== "undefined" && rm) rm.hideRightMenu();
  }

  function skipNext() {
    if (!ap || !songs.length) return;
    var next = (currentIndex + 1) % songs.length;
    playIndex(next);
    if (typeof rm !== "undefined" && rm) rm.hideRightMenu();
  }

  function skipPrev() {
    if (!ap || !songs.length) return;
    var prev = (currentIndex - 1 + songs.length) % songs.length;
    playIndex(prev);
    if (typeof rm !== "undefined" && rm) rm.hideRightMenu();
  }

  function isPlayingFn() { return playing; }
  function isPlaylistOpenFn() { return playlistVisible; }
  function closePlaylistFn() { hidePlaylist(); }
  function isLyricOpenFn() { return lyricVisible; }
  function closeLyricFn() { hideLyric(); }

  return {
    init: init,
    toggle: toggle,
    skipNext: skipNext,
    skipPrev: skipPrev,
    isPlaying: isPlayingFn,
    isPlaylistOpen: isPlaylistOpenFn,
    closePlaylist: closePlaylistFn,
    isLyricOpen: isLyricOpenFn,
    closeLyric: closeLyricFn,
  };
})();

const anzhiyu = {
  debounce: (func, wait = 0, immediate = false) => {
    let timeout;
    return (...args) => {
      const later = () => {
        timeout = null;
        if (!immediate) func(...args);
      };
      const callNow = immediate && !timeout;
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
      if (callNow) func(...args);
    };
  },

  throttle: function (func, wait, options = {}) {
    let timeout, context, args;
    let previous = 0;

    const later = () => {
      previous = options.leading === false ? 0 : new Date().getTime();
      timeout = null;
      func.apply(context, args);
      if (!timeout) context = args = null;
    };

    const throttled = (...params) => {
      const now = new Date().getTime();
      if (!previous && options.leading === false) previous = now;
      const remaining = wait - (now - previous);
      context = this;
      args = params;
      if (remaining <= 0 || remaining > wait) {
        if (timeout) {
          clearTimeout(timeout);
          timeout = null;
        }
        previous = now;
        func.apply(context, args);
        if (!timeout) context = args = null;
      } else if (!timeout && options.trailing !== false) {
        timeout = setTimeout(later, remaining);
      }
    };

    return throttled;
  },

  sidebarPaddingR: () => {
    const innerWidth = window.innerWidth;
    const clientWidth = document.body.clientWidth;
    const paddingRight = innerWidth - clientWidth;
    if (innerWidth !== clientWidth) {
      document.body.style.paddingRight = paddingRight + "px";
    }
  },

  snackbarShow: (text, showActionFunction = false, duration = 2000, actionText = false) => {
    const { position, bgLight, bgDark } = GLOBAL_CONFIG.Snackbar;
    const bg = document.documentElement.getAttribute("data-theme") === "light" ? bgLight : bgDark;
    const root = document.querySelector(":root");
    root.style.setProperty("--anzhiyu-snackbar-time", duration + "ms");

    Snackbar.show({
      text: text,
      backgroundColor: bg,
      onActionClick: showActionFunction,
      actionText: actionText,
      showAction: actionText,
      duration: duration,
      pos: position,
      customClass: "snackbar-css",
    });
  },

  loadComment: (dom, callback) => {
    if ("IntersectionObserver" in window) {
      const observerItem = new IntersectionObserver(
        entries => {
          if (entries[0].isIntersecting) {
            callback();
            observerItem.disconnect();
          }
        },
        { threshold: [0] }
      );
      observerItem.observe(dom);
    } else {
      callback();
    }
  },

  scrollToDest: (pos, time = 500) => {
    const currentPos = window.pageYOffset;
    if ("scrollBehavior" in document.documentElement.style) {
      window.scrollTo({
        top: pos,
        behavior: "smooth",
      });
      return;
    }

    let start = null;
    pos = +pos;
    window.requestAnimationFrame(function step(currentTime) {
      start = !start ? currentTime : start;
      const progress = currentTime - start;
      if (currentPos < pos) {
        window.scrollTo(0, ((pos - currentPos) * progress) / time + currentPos);
      } else {
        window.scrollTo(0, currentPos - ((currentPos - pos) * progress) / time);
      }
      if (progress < time) {
        window.requestAnimationFrame(step);
      } else {
        window.scrollTo(0, pos);
      }
    });
  },

  initJustifiedGallery: function (selector) {
    const runJustifiedGallery = i => {
      if (!anzhiyu.isHidden(i)) {
        fjGallery(i, {
          itemSelector: ".fj-gallery-item",
          rowHeight: i.getAttribute("data-rowHeight"),
          gutter: 4,
          onJustify: function () {
            this.$container.style.opacity = "1";
          },
        });
      }
    };

    if (Array.from(selector).length === 0) runJustifiedGallery(selector);
    else
      selector.forEach(i => {
        runJustifiedGallery(i);
      });
  },

  animateIn: (ele, text) => {
    ele.style.display = "block";
    ele.style.animation = text;
  },

  animateOut: (ele, text) => {
    ele.addEventListener("animationend", function f() {
      ele.style.display = "";
      ele.style.animation = "";
      ele.removeEventListener("animationend", f);
    });
    ele.style.animation = text;
  },

  /**
   * @param {*} selector
   * @param {*} eleType the type of create element
   * @param {*} options object key: value
   */
  wrap: (selector, eleType, options) => {
    const creatEle = document.createElement(eleType);
    for (const [key, value] of Object.entries(options)) {
      creatEle.setAttribute(key, value);
    }
    selector.parentNode.insertBefore(creatEle, selector);
    creatEle.appendChild(selector);
  },

  isHidden: ele => ele.offsetHeight === 0 && ele.offsetWidth === 0,

  getEleTop: ele => {
    let actualTop = ele.offsetTop;
    let current = ele.offsetParent;

    while (current !== null) {
      actualTop += current.offsetTop;
      current = current.offsetParent;
    }

    return actualTop;
  },

  loadLightbox: ele => {
    const service = GLOBAL_CONFIG.lightbox;

    if (service === "mediumZoom") {
      const zoom = mediumZoom(ele);
      zoom.on("open", e => {
        const photoBg = document.documentElement.getAttribute("data-theme") === "dark" ? "#121212" : "#fff";
        zoom.update({
          background: photoBg,
        });
      });
    }

    if (service === "fancybox") {
      Array.from(ele).forEach(i => {
        if (i.parentNode.tagName !== "A") {
          const dataSrc = i.dataset.lazySrc || i.src;
          const dataCaption = i.title || i.alt || "";
          anzhiyu.wrap(i, "a", {
            href: dataSrc,
            "data-fancybox": "gallery",
            "data-caption": dataCaption,
            "data-thumb": dataSrc,
          });
        }
      });

      if (!window.fancyboxRun) {
        Fancybox.bind("[data-fancybox]", {
          Hash: false,
          Thumbs: {
            autoStart: false,
          },
        });
        window.fancyboxRun = true;
      }
    }
  },

  setLoading: {
    add: ele => {
      const html = `
        <div class="loading-container">
          <div class="loading-item">
            <div></div><div></div><div></div><div></div><div></div>
          </div>
        </div>
      `;
      ele.insertAdjacentHTML("afterend", html);
    },
    remove: ele => {
      ele.nextElementSibling.remove();
    },
  },

  updateAnchor: anchor => {
    if (anchor !== window.location.hash) {
      if (!anchor) anchor = location.pathname;
      const title = GLOBAL_CONFIG_SITE.title;
      window.history.replaceState(
        {
          url: location.href,
          title,
        },
        title,
        anchor
      );
    }
  },

  getScrollPercent: (currentTop, ele) => {
    const docHeight = ele.clientHeight;
    const winHeight = document.documentElement.clientHeight;
    const headerHeight = ele.offsetTop;
    const contentMath =
      docHeight > winHeight ? docHeight - winHeight : document.documentElement.scrollHeight - winHeight;
    const scrollPercent = (currentTop - headerHeight) / contentMath;
    const scrollPercentRounded = Math.round(scrollPercent * 100);
    const percentage = scrollPercentRounded > 100 ? 100 : scrollPercentRounded <= 0 ? 0 : scrollPercentRounded;
    return percentage;
  },

  addGlobalFn: (key, fn, name = false, parent = window) => {
    const globalFn = parent.globalFn || {};
    const keyObj = globalFn[key] || {};

    if (name && keyObj[name]) return;

    name = name || Object.keys(keyObj).length;
    keyObj[name] = fn;
    globalFn[key] = keyObj;
    parent.globalFn = globalFn;
  },

  addEventListenerPjax: (ele, event, fn, option = false) => {
    ele.addEventListener(event, fn, option);
    anzhiyu.addGlobalFn("pjax", () => {
      ele.removeEventListener(event, fn, option);
    });
  },

  removeGlobalFnEvent: (key, parent = window) => {
    const { globalFn = {} } = parent;
    const keyObj = globalFn[key] || {};
    const keyArr = Object.keys(keyObj);
    if (!keyArr.length) return;
    keyArr.forEach(i => {
      keyObj[i]();
    });
    delete parent.globalFn[key];
  },

  //更改主题色
  changeThemeMetaColor: function (color) {
    // console.info(`%c ${color}`, `font-size:36px;color:${color};`);
    if (themeColorMeta !== null) {
      themeColorMeta.setAttribute("content", color);
    }
  },

  //顶栏自适应主题色
  initThemeColor: function () {
    let themeColor = getComputedStyle(document.documentElement)
      .getPropertyValue("--anzhiyu-bar-background")
      .trim()
      .replace('"', "")
      .replace('"', "");
    const currentTop = window.scrollY || document.documentElement.scrollTop;
    if (currentTop > 26) {
      if (anzhiyu.is_Post()) {
        themeColor = getComputedStyle(document.documentElement)
          .getPropertyValue("--anzhiyu-meta-theme-post-color")
          .trim()
          .replace('"', "")
          .replace('"', "");
      }
      if (themeColorMeta.getAttribute("content") === themeColor) return;
      this.changeThemeMetaColor(themeColor);
    } else {
      if (themeColorMeta.getAttribute("content") === themeColor) return;
      this.changeThemeMetaColor(themeColor);
    }
  },
  //是否是文章页
  is_Post: function () {
    var url = window.location.href; //获取url
    if (url.indexOf("/posts/") >= 0) {
      //判断url地址中是否包含code字符串
      return true;
    } else {
      return false;
    }
  },
  //监测是否在页面开头
  addNavBackgroundInit: function () {
    var scrollTop = 0,
      bodyScrollTop = 0,
      documentScrollTop = 0;
    if ($bodyWrap) {
      bodyScrollTop = $bodyWrap.scrollTop;
    }
    if (document.documentElement) {
      documentScrollTop = document.documentElement.scrollTop;
    }
    scrollTop = bodyScrollTop - documentScrollTop > 0 ? bodyScrollTop : documentScrollTop;

    if (scrollTop != 0) {
      pageHeaderEl.classList.add("nav-fixed");
      pageHeaderEl.classList.add("nav-visible");
    }
  },
  // 下载图片
  downloadImage: function (imgsrc, name) {
    //下载图片地址和图片名
    rm.hideRightMenu();
    if (rm.downloadimging == false) {
      rm.downloadimging = true;
      anzhiyu.snackbarShow("正在下载中，请稍后", false, 10000);
      setTimeout(function () {
        let image = new Image();
        // 解决跨域 Canvas 污染问题
        image.setAttribute("crossOrigin", "anonymous");
        image.onload = function () {
          let canvas = document.createElement("canvas");
          canvas.width = image.width;
          canvas.height = image.height;
          let context = canvas.getContext("2d");
          context.drawImage(image, 0, 0, image.width, image.height);
          let url = canvas.toDataURL("image/png"); //得到图片的base64编码数据
          let a = document.createElement("a"); // 生成一个a元素
          let event = new MouseEvent("click"); // 创建一个单击事件
          a.download = name || "photo"; // 设置图片名称
          a.href = url; // 将生成的URL设置为a.href属性
          a.dispatchEvent(event); // 触发a的单击事件
        };
        image.src = imgsrc;
        anzhiyu.snackbarShow("图片已添加盲水印，请遵守版权协议");
        rm.downloadimging = false;
      }, "10000");
    } else {
      anzhiyu.snackbarShow("有正在进行中的下载，请稍后再试");
    }
  },
  //禁止图片右键单击
  stopImgRightDrag: function () {
    var img = document.getElementsByTagName("img");
    for (var i = 0; i < img.length; i++) {
      img[i].addEventListener("dragstart", function () {
        return false;
      });
    }
  },
  //滚动到指定id
  scrollTo: function (id) {
    var domTop = document.querySelector(id).offsetTop;
    window.scrollTo(0, domTop - 80);
  },
  //隐藏侧边栏
  hideAsideBtn: () => {
    // Hide aside
    const $htmlDom = document.documentElement.classList;
    $htmlDom.contains("hide-aside")
      ? saveToLocal.set("aside-status", "show", 2)
      : saveToLocal.set("aside-status", "hide", 2);
    $htmlDom.toggle("hide-aside");
    $htmlDom.contains("hide-aside")
      ? document.querySelector("#consoleHideAside").classList.add("on")
      : document.querySelector("#consoleHideAside").classList.remove("on");
  },
  // 热评切换
  switchCommentBarrage: function () {
    let commentBarrage = document.querySelector(".comment-barrage");
    if (commentBarrage) {
      if (window.getComputedStyle(commentBarrage).display === "flex") {
        commentBarrage.style.display = "none";
        anzhiyu.snackbarShow("✨ 已关闭评论弹幕");
        document.querySelector(".menu-commentBarrage-text").textContent = "显示热评";
        document.querySelector("#consoleCommentBarrage").classList.remove("on");
        localStorage.setItem("commentBarrageSwitch", "false");
      } else {
        commentBarrage.style.display = "flex";
        document.querySelector(".menu-commentBarrage-text").textContent = "关闭热评";
        document.querySelector("#consoleCommentBarrage").classList.add("on");
        anzhiyu.snackbarShow("✨ 已开启评论弹幕");
        localStorage.removeItem("commentBarrageSwitch");
      }
    }
    rm && rm.hideRightMenu();
  },
  initPaginationObserver: () => {
    const commentElement = document.getElementById("post-comment");
    const paginationElement = document.getElementById("pagination");

    if (commentElement && paginationElement) {
      new IntersectionObserver(entries => {
        const commentBarrage = document.querySelector(".comment-barrage");

        entries.forEach(entry => {
          if (entry.isIntersecting) {
            paginationElement.classList.add("show-window");
            if (commentBarrage) {
              commentBarrage.style.bottom = "-200px";
            }
          } else {
            paginationElement.classList.remove("show-window");
            if (commentBarrage) {
              commentBarrage.style.bottom = "0px";
            }
          }
        });
      }).observe(commentElement);
    }
  },
  // 初始化即刻
  initIndexEssay: function () {
    if (!document.getElementById("bbTimeList")) return;
    setTimeout(() => {
      let essay_bar_swiper = new Swiper(".essay_bar_swiper_container", {
        passiveListeners: true,
        direction: "vertical",
        loop: true,
        autoplay: {
          disableOnInteraction: true,
          delay: 3000,
        },
        mousewheel: true,
      });

      let essay_bar_comtainer = document.getElementById("bbtalk");
      if (essay_bar_comtainer !== null) {
        essay_bar_comtainer.onmouseenter = function () {
          essay_bar_swiper.autoplay.stop();
        };
        essay_bar_comtainer.onmouseleave = function () {
          essay_bar_swiper.autoplay.start();
        };
      }
    }, 100);
  },
  scrollByMouseWheel: function ($list, $target) {
    const scrollHandler = function (e) {
      $list.scrollLeft -= e.wheelDelta / 2;
      e.preventDefault();
    };
    $list.addEventListener("mousewheel", scrollHandler, { passive: false });
    if ($target) {
      $target.classList.add("selected");
      $list.scrollLeft = $target.offsetLeft - $list.offsetLeft - ($list.offsetWidth - $target.offsetWidth) / 2;
    }
  },
  // catalog激活
  catalogActive: function () {
    const $list = document.getElementById("catalog-list");
    if ($list) {
      const pathname = decodeURIComponent(window.location.pathname);
      const catalogListItems = $list.querySelectorAll(".catalog-list-item");

      let $catalog = null;
      catalogListItems.forEach(item => {
        if (pathname.startsWith(item.id)) {
          $catalog = item;
          return;
        }
      });

      anzhiyu.scrollByMouseWheel($list, $catalog);
    }
  },
  // Page Tag 激活
  tagsPageActive: function () {
    const $list = document.getElementById("tag-page-tags");
    if ($list) {
      const $tagPageTags = document.getElementById(decodeURIComponent(window.location.pathname));
      anzhiyu.scrollByMouseWheel($list, $tagPageTags);
    }
  },
  // 修改时间显示"最近"
  diffDate: function (d, more = false, simple = false) {
    const dateNow = new Date();
    const datePost = new Date(d);
    const dateDiff = dateNow.getTime() - datePost.getTime();
    const minute = 1000 * 60;
    const hour = minute * 60;
    const day = hour * 24;
    const month = day * 30;

    let result;
    if (more) {
      const monthCount = dateDiff / month;
      const dayCount = dateDiff / day;
      const hourCount = dateDiff / hour;
      const minuteCount = dateDiff / minute;

      if (monthCount >= 1) {
        result = datePost.toLocaleDateString().replace(/\//g, "-");
      } else if (dayCount >= 1) {
        result = parseInt(dayCount) + " " + GLOBAL_CONFIG.date_suffix.day;
      } else if (hourCount >= 1) {
        result = parseInt(hourCount) + " " + GLOBAL_CONFIG.date_suffix.hour;
      } else if (minuteCount >= 1) {
        result = parseInt(minuteCount) + " " + GLOBAL_CONFIG.date_suffix.min;
      } else {
        result = GLOBAL_CONFIG.date_suffix.just;
      }
    } else if (simple) {
      const monthCount = dateDiff / month;
      const dayCount = dateDiff / day;
      const hourCount = dateDiff / hour;
      const minuteCount = dateDiff / minute;
      if (monthCount >= 1) {
        result = datePost.toLocaleDateString().replace(/\//g, "-");
      } else if (dayCount >= 1 && dayCount <= 3) {
        result = parseInt(dayCount) + " " + GLOBAL_CONFIG.date_suffix.day;
      } else if (dayCount > 3) {
        result = datePost.getMonth() + 1 + "/" + datePost.getDate();
      } else if (hourCount >= 1) {
        result = parseInt(hourCount) + " " + GLOBAL_CONFIG.date_suffix.hour;
      } else if (minuteCount >= 1) {
        result = parseInt(minuteCount) + " " + GLOBAL_CONFIG.date_suffix.min;
      } else {
        result = GLOBAL_CONFIG.date_suffix.just;
      }
    } else {
      result = parseInt(dateDiff / day);
    }
    return result;
  },

  // 修改即刻中的时间显示
  changeTimeInEssay: function () {
    document.querySelector("#bber") &&
      document.querySelectorAll("#bber time").forEach(function (e) {
        var t = e,
          datetime = t.getAttribute("datetime");
        (t.innerText = anzhiyu.diffDate(datetime, true)), (t.style.display = "inline");
      });
  },
  // 修改相册集中的时间
  changeTimeInAlbumDetail: function () {
    document.querySelector("#album_detail") &&
      document.querySelectorAll("#album_detail time").forEach(function (e) {
        var t = e,
          datetime = t.getAttribute("datetime");
        (t.innerText = anzhiyu.diffDate(datetime, true)), (t.style.display = "inline");
      });
  },
  // 刷新瀑布流
  reflashEssayWaterFall: function () {
    const waterfallEl = document.getElementById("waterfall");
    if (waterfallEl) {
      setTimeout(function () {
        waterfall(waterfallEl);
        waterfallEl.classList.add("show");
      }, 800);
    }
  },
  sayhi: function () {
    const $sayhiEl = document.getElementById("author-info__sayhi");

    const getTimeState = () => {
      const hour = new Date().getHours();
      let message = "";

      if (hour >= 0 && hour <= 5) {
        message = "睡个好觉，保证精力充沛";
      } else if (hour > 5 && hour <= 10) {
        message = "一日之计在于晨";
      } else if (hour > 10 && hour <= 14) {
        message = "吃饱了才有力气干活";
      } else if (hour > 14 && hour <= 18) {
        message = "集中精力，攻克难关";
      } else if (hour > 18 && hour <= 24) {
        message = "不要太劳累了，早睡更健康";
      }

      return message;
    };

    if ($sayhiEl) {
      $sayhiEl.innerHTML = getTimeState();
    }
  },

  // 友链注入预设评论
  addFriendLink() {
    var input = document.getElementsByClassName("el-textarea__inner")[0];
    if (!input) return;
    const evt = new Event("input", { cancelable: true, bubbles: true });
    const defaultPlaceholder =
      "昵称（请勿包含博客等字样）：\n网站地址（要求博客地址，请勿提交个人主页）：\n头像图片url（请提供尽可能清晰的图片，我会上传到我自己的图床）：\n描述：\n站点截图（可选）：\n";
    input.value = this.getConfigIfPresent(GLOBAL_CONFIG.linkPageTop, "addFriendPlaceholder", defaultPlaceholder);
    input.dispatchEvent(evt);
    input.focus();
    input.setSelectionRange(-1, -1);
  },
  // 获取配置，如果为空则返回默认值
  getConfigIfPresent: function (config, configKey, defaultValue) {
    if (!config) return defaultValue;
    if (!config.hasOwnProperty(configKey)) return defaultValue;
    if (!config[configKey]) return defaultValue;
    return config[configKey];
  },
  musicToggle: function (changePaly) {
    NavMusic.toggle();
  },
  // 音乐伸缩（切换歌词面板）
  musicTelescopic: function () {
    if (NavMusic.isLyricOpen && NavMusic.isLyricOpen()) {
      NavMusic.closeLyric();
    } else {
      var coverEl = document.querySelector("#nav-music .nm-cover");
      if (coverEl) coverEl.click();
    }
  },

  //音乐上一曲
  musicSkipBack: function () {
    NavMusic.skipPrev();
  },

  //音乐下一曲
  musicSkipForward: function () {
    NavMusic.skipNext();
  },


  //获取音乐中的名称
  musicGetName: function () {
    var x = document.querySelectorAll("#nav-music .nm-title");
    if (!x.length) return "";
    return x[0].innerText;
  },

  //初始化console图标
  initConsoleState: function () {
    //初始化隐藏边栏
    const $htmlDomClassList = document.documentElement.classList;
    $htmlDomClassList.contains("hide-aside")
      ? document.querySelector("#consoleHideAside").classList.add("on")
      : document.querySelector("#consoleHideAside").classList.remove("on");
  },

  // 显示打赏中控台
  rewardShowConsole: function () {
    // 判断是否为赞赏打开控制台
    consoleEl.classList.add("reward-show");
    anzhiyu.initConsoleState();
  },
  // 显示中控台
  showConsole: function () {
    consoleEl.classList.add("show");
    anzhiyu.initConsoleState();
  },

  //隐藏中控台
  hideConsole: function () {
    if (consoleEl.classList.contains("show")) {
      // 如果是一般控制台，就关闭一般控制台
      consoleEl.classList.remove("show");
    } else if (consoleEl.classList.contains("reward-show")) {
      // 如果是打赏控制台，就关闭打赏控制台
      consoleEl.classList.remove("reward-show");
    }
    // 获取center-console元素
    const centerConsole = document.getElementById("center-console");

    // 检查center-console是否被选中
    if (centerConsole.checked) {
      // 取消选中状态
      centerConsole.checked = false;
    }
  },
  // 取消加载动画
  hideLoading: function () {
    document.getElementById("loading-box").classList.add("loaded");
  },
  // 将音乐缓存播放
  cacheAndPlayMusic() {
    let data = localStorage.getItem("musicData");
    if (data) {
      data = JSON.parse(data);
      const currentTime = new Date().getTime();
      if (currentTime - data.timestamp < 24 * 60 * 60 * 1000) {
        // 如果缓存的数据没有过期，直接使用
        anzhiyu.playMusic(data.songs);
        return;
      }
    }

    // 否则重新从服务器获取数据
    fetch("/json/music.json")
      .then(response => response.json())
      .then(songs => {
        const cacheData = {
          timestamp: new Date().getTime(),
          songs: songs,
        };
        localStorage.setItem("musicData", JSON.stringify(cacheData));
        anzhiyu.playMusic(songs);
      });
  },
  // 播放音乐
  playMusic(songs) {
    const anMusicPage = document.getElementById("anMusic-page");
    const metingAplayer = anMusicPage.querySelector("meting-js").aplayer;
    const randomIndex = Math.floor(Math.random() * songs.length);
    const randomSong = songs[randomIndex];
    const allAudios = metingAplayer.list.audios;
    if (!selectRandomSong.includes(randomSong.name)) {
      // 如果随机到的歌曲已经未被随机到过，就添加进metingAplayer.list
      metingAplayer.list.add([randomSong]);
      // 播放最后一首(因为是添加到了最后)
      metingAplayer.list.switch(allAudios.length);
      // 添加到已被随机的歌曲列表
      selectRandomSong.push(randomSong.name);
    } else {
      // 随机到的歌曲已经在播放列表中了
      // 直接继续随机直到随机到没有随机过的歌曲，如果全部随机过了就切换到对应的歌曲播放即可
      let songFound = false;
      while (!songFound) {
        const newRandomIndex = Math.floor(Math.random() * songs.length);
        const newRandomSong = songs[newRandomIndex];
        if (!selectRandomSong.includes(newRandomSong.name)) {
          metingAplayer.list.add([newRandomSong]);
          metingAplayer.list.switch(allAudios.length);
          selectRandomSong.push(newRandomSong.name);
          songFound = true;
        }
        // 如果全部歌曲都已被随机过，跳出循环
        if (selectRandomSong.length === songs.length) {
          break;
        }
      }
      if (!songFound) {
        // 如果全部歌曲都已被随机过，切换到对应的歌曲播放
        const palyMusicIndex = allAudios.findIndex(song => song.name === randomSong.name);
        if (palyMusicIndex != -1) metingAplayer.list.switch(palyMusicIndex);
      }
    }

    console.info("已随机歌曲：", selectRandomSong, "本次随机歌曲：", randomSong.name);
  },
  // 音乐节目切换背景
  changeMusicBg: function (isChangeBg = true) {
    const anMusicBg = document.getElementById("an_music_bg");

    if (isChangeBg) {
      // player listswitch 会进入此处
      const musiccover = document.querySelector("#anMusic-page .aplayer-pic");
      anMusicBg.style.backgroundImage = musiccover.style.backgroundImage;
    } else {
      // 第一次进入，绑定事件，改背景
      let timer = setInterval(() => {
        const musiccover = document.querySelector("#anMusic-page .aplayer-pic");
        // 确保player加载完成
        if (musiccover) {
          clearInterval(timer);
          // 绑定事件
          anzhiyu.addEventListenerMusic();
          // 确保第一次能够正确替换背景
          anzhiyu.changeMusicBg();

          // 暂停nav的音乐
          if (typeof NavMusic !== "undefined" && NavMusic.isPlaying && NavMusic.isPlaying()) {
            anzhiyu.musicToggle();
          }
        }
      }, 100);
    }
  },
  // 获取自定义播放列表
  getCustomPlayList: function () {
    if (!window.location.pathname.startsWith("/blog/music/")) {
      return;
    }
    const urlParams = new URLSearchParams(window.location.search);
    const navMusic = document.getElementById("nav-music");
    const userId = (navMusic && navMusic.dataset.id) || "2306984285";
    const userServer = (navMusic && navMusic.dataset.server) || "netease";
    const anMusicPageMeting = document.getElementById("anMusic-page-meting");
    if (!anMusicPageMeting) return;
    if (urlParams.get("id") && urlParams.get("server")) {
      const id = urlParams.get("id");
      const server = urlParams.get("server");
      anMusicPageMeting.innerHTML = `<meting-js id="${id}" server="${server}" type="playlist" mutex="true" preload="auto" theme="var(--anzhiyu-main)" order="list" list-max-height="calc(100vh - 169px)!important"></meting-js>`;
    } else {
      anMusicPageMeting.innerHTML = `<meting-js id="${userId}" server="${userServer}" type="playlist" mutex="true" preload="auto" theme="var(--anzhiyu-main)" order="list" list-max-height="calc(100vh - 169px)!important"></meting-js>`;
    }
    anzhiyu.changeMusicBg(false);
  },
  //隐藏今日推荐
  hideTodayCard: function () {
    if (document.getElementById("todayCard")) {
      document.getElementById("todayCard").classList.add("hide");
      const topGroup = document.querySelector(".topGroup");
      const recentPostItems = topGroup.querySelectorAll(".recent-post-item");
      recentPostItems.forEach(item => {
        item.style.display = "flex";
      });
    }
  },

  // 监听音乐背景改变
  addEventListenerMusic: function () {
    const anMusicPage = document.getElementById("anMusic-page");
    const aplayerIconMenu = anMusicPage.querySelector(".aplayer-info .aplayer-time .aplayer-icon-menu");
    const anMusicBtnGetSong = anMusicPage.querySelector("#anMusicBtnGetSong");
    const anMusicRefreshBtn = anMusicPage.querySelector("#anMusicRefreshBtn");
    const anMusicSwitchingBtn = anMusicPage.querySelector("#anMusicSwitching");
    const metingAplayer = anMusicPage.querySelector("meting-js").aplayer;
    //初始化音量
    metingAplayer.volume(0.8, true);

    const musicPageState = {
      lyricLines: [],
      lyricKey: "",
      activeLyricIndex: -1,
    };

    function escapeMusicHtml(text) {
      return String(text || "").replace(/[&<>"']/g, function (char) {
        return {
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[char];
      });
    }

    function parseMusicLrc(lrcText) {
      const lines = [];
      if (!lrcText) return lines;
      String(lrcText).split("\n").forEach(line => {
        const timeMatches = [...line.matchAll(/\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g)];
        if (!timeMatches.length) return;
        const text = line.replace(/\[.*?\]/g, "").trim();
        timeMatches.forEach(match => {
          const minute = parseInt(match[1], 10);
          const second = parseInt(match[2], 10);
          let millisecond = match[3] ? parseInt(match[3], 10) : 0;
          if (match[3] && match[3].length === 2) millisecond *= 10;
          lines.push({
            time: minute * 60 + second + millisecond / 1000,
            text,
          });
        });
      });
      return lines
        .filter(item => item.text)
        .sort((a, b) => a.time - b.time);
    }

    function renderMusicLrc(lrcText) {
      const lrcBox = anMusicPage.querySelector(".aplayer-lrc");
      const lrcContents = anMusicPage.querySelector(".aplayer-lrc-contents");
      if (!lrcBox || !lrcContents) return;

      musicPageState.lyricLines = parseMusicLrc(lrcText);
      musicPageState.activeLyricIndex = -1;
      if (!musicPageState.lyricLines.length) {
        lrcContents.innerHTML = '<p class="aplayer-lrc-current">暂无歌词</p>';
        lrcContents.style.transform = "translateY(0)";
        return;
      }

      lrcContents.innerHTML = musicPageState.lyricLines
        .map(item => `<p data-time="${item.time}">${escapeMusicHtml(item.text)}</p>`)
        .join("");
      syncMusicLrc();
    }

    function getCurrentMusicAudio() {
      const audios = metingAplayer.list && metingAplayer.list.audios;
      const index = metingAplayer.list ? metingAplayer.list.index || 0 : 0;
      return (audios && audios[index]) || null;
    }

    function buildMusicApiUrl(type, id, server) {
      const api = window.meting_api || "http://42.193.149.44/music-api/api?server=:server&type=:type&id=:id&r=:r&cookie=:auth";
      return api
        .replace(":server", server || "netease")
        .replace(":type", type)
        .replace(":id", id)
        .replace(":r", Math.random())
        .replace("&cookie=:auth", "")
        .replace("?cookie=:auth&", "?")
        .replace("?cookie=:auth", "");
    }

    function loadMusicLrc() {
      const currentAudio = getCurrentMusicAudio();
      if (!currentAudio) return;
      const lyricKey = `${currentAudio.id || ""}-${currentAudio.name || ""}-${currentAudio.artist || ""}`;
      if (musicPageState.lyricKey === lyricKey) return;
      musicPageState.lyricKey = lyricKey;

      if (currentAudio.lrc) {
        renderMusicLrc(currentAudio.lrc);
        return;
      }

      if (!currentAudio.id) {
        renderMusicLrc("");
        return;
      }

      fetch(buildMusicApiUrl("lyric", currentAudio.id, currentAudio.server || "netease"))
        .then(response => response.json())
        .then(data => {
          const lyricText = data && (data.lyric || data.lrc || data.tlyric || "");
          currentAudio.lrc = lyricText;
          renderMusicLrc(lyricText);
        })
        .catch(() => {
          renderMusicLrc("");
        });
    }

    function syncMusicLrc() {
      if (!musicPageState.lyricLines.length) return;
      const lrcBox = anMusicPage.querySelector(".aplayer-lrc");
      const lrcContents = anMusicPage.querySelector(".aplayer-lrc-contents");
      if (!lrcBox || !lrcContents || !metingAplayer.audio) return;

      const currentTime = metingAplayer.audio.currentTime || 0;
      let activeIndex = 0;
      for (let i = 0; i < musicPageState.lyricLines.length; i++) {
        if (musicPageState.lyricLines[i].time <= currentTime) activeIndex = i;
        else break;
      }
      if (activeIndex === musicPageState.activeLyricIndex) return;
      musicPageState.activeLyricIndex = activeIndex;

      const lyricRows = lrcContents.querySelectorAll("p");
      lyricRows.forEach((row, index) => {
        row.classList.toggle("aplayer-lrc-current", index === activeIndex);
      });

      const activeRow = lyricRows[activeIndex];
      if (activeRow) {
        const offset = lrcBox.clientHeight / 2 - activeRow.offsetTop - activeRow.offsetHeight / 2;
        lrcContents.style.transform = `translateY(${offset}px)`;
      }
    }

    function bindMusicListDoubleClick() {
      const list = anMusicPage.querySelector(".aplayer-list ol");
      if (!list || list.dataset.doubleClickPlay === "true") return;
      list.dataset.doubleClickPlay = "true";

      list.addEventListener(
        "click",
        event => {
          if (!event.target.closest("li")) return;
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
        },
        true
      );

      list.addEventListener("dblclick", event => {
        const item = event.target.closest("li");
        if (!item) return;
        const items = Array.from(list.children).filter(child => child.tagName && child.tagName.toLowerCase() === "li");
        const index = items.indexOf(item);
        if (index < 0) return;
        metingAplayer.list.switch(index);
        metingAplayer.play();
        setTimeout(loadMusicLrc, 100);
      });
    }

    bindMusicListDoubleClick();
    loadMusicLrc();
    if (metingAplayer.audio) metingAplayer.audio.addEventListener("timeupdate", syncMusicLrc);
    metingAplayer.on("listswitch", function () {
      anzhiyu.changeMusicBg();
      setTimeout(loadMusicLrc, 100);
    });
    metingAplayer.on("loadeddata", function () {
      anzhiyu.changeMusicBg();
      loadMusicLrc();
    });

    if (aplayerIconMenu) aplayerIconMenu.addEventListener("click", function () {
      document.getElementById("menu-mask").style.display = "block";
      document.getElementById("menu-mask").style.animation = "0.5s ease 0s 1 normal none running to_show";
      anMusicPage.querySelector(".aplayer.aplayer-withlist .aplayer-list").style.opacity = "1";
    });

    function anMusicPageMenuAask() {
      if (window.location.pathname != "/blog/music/") {
        document.getElementById("menu-mask").removeEventListener("click", anMusicPageMenuAask);
        return;
      }

      anMusicPage.querySelector(".aplayer-list").classList.remove("aplayer-list-hide");
    }

    document.getElementById("menu-mask").addEventListener("click", anMusicPageMenuAask);

    // 监听增加单曲按钮
    if (anMusicBtnGetSong) {
      anMusicBtnGetSong.addEventListener("click", () => {
        if (changeMusicListFlag) {
          const anMusicPage = document.getElementById("anMusic-page");
          const metingAplayer = anMusicPage.querySelector("meting-js").aplayer;
          const allAudios = metingAplayer.list.audios;
          const randomIndex = Math.floor(Math.random() * allAudios.length);
          // 随机播放一首
          metingAplayer.list.switch(randomIndex);
        } else {
          anzhiyu.cacheAndPlayMusic();
        }
      });
    }
    if (anMusicRefreshBtn) anMusicRefreshBtn.addEventListener("click", () => {
      localStorage.removeItem("musicData");
      anzhiyu.snackbarShow("已移除相关缓存歌曲");
    });
    if (anMusicSwitchingBtn) anMusicSwitchingBtn.addEventListener("click", () => {
      anzhiyu.changeMusicList();
    });

    // 监听键盘事件
    //空格控制音乐
    document.addEventListener("keydown", function (event) {
      //暂停开启音乐
      if (event.code === "Space") {
        event.preventDefault();
        metingAplayer.toggle();
      }
      //切换下一曲
      if (event.keyCode === 39) {
        event.preventDefault();
        metingAplayer.skipForward();
      }
      //切换上一曲
      if (event.keyCode === 37) {
        event.preventDefault();
        metingAplayer.skipBack();
      }
      //增加音量
      if (event.keyCode === 38) {
        if (musicVolume <= 1) {
          musicVolume += 0.1;
          metingAplayer.volume(musicVolume, true);
        }
      }
      //减小音量
      if (event.keyCode === 40) {
        if (musicVolume >= 0) {
          musicVolume += -0.1;
          metingAplayer.volume(musicVolume, true);
        }
      }
    });
  },
  // 切换歌单
  changeMusicList: async function () {
    const anMusicPage = document.getElementById("anMusic-page");
    const metingAplayer = anMusicPage.querySelector("meting-js").aplayer;
    const currentTime = new Date().getTime();
    const cacheData = JSON.parse(localStorage.getItem("musicData")) || { timestamp: 0 };
    let songs = [];

    if (changeMusicListFlag) {
      songs = defaultPlayMusicList;
    } else {
      // 保存当前默认播放列表，以使下次可以切换回来
      defaultPlayMusicList = metingAplayer.list.audios;
      // 如果缓存的数据没有过期，直接使用
      if (currentTime - cacheData.timestamp < 24 * 60 * 60 * 1000) {
        songs = cacheData.songs;
      } else {
        // 否则重新从服务器获取数据
        const response = await fetch("/json/music.json");
        songs = await response.json();
        cacheData.timestamp = currentTime;
        cacheData.songs = songs;
        localStorage.setItem("musicData", JSON.stringify(cacheData));
      }
    }

    // 清除当前播放列表并添加新的歌曲
    metingAplayer.list.clear();
    metingAplayer.list.add(songs);

    // 切换标志位
    changeMusicListFlag = !changeMusicListFlag;
  },
  // 控制台音乐列表监听
  addEventListenerConsoleMusicList: function () {
    const navMusic = document.getElementById("nav-music");
    if (!navMusic) return;
    navMusic.addEventListener("click", e => {
      const aplayerList = navMusic.querySelector(".aplayer-list");
      const listBtn = navMusic.querySelector(
        "div.aplayer-info > div.aplayer-controller > div.aplayer-time.aplayer-time-narrow > button.aplayer-icon.aplayer-icon-menu svg"
      );
      if (e.target != listBtn && aplayerList.classList.contains("aplayer-list-hide")) {
        aplayerList.classList.remove("aplayer-list-hide");
      }
    });
  },
  // 监听按键
  toPage: function () {
    var toPageText = document.getElementById("toPageText"),
      toPageButton = document.getElementById("toPageButton"),
      pageNumbers = document.querySelectorAll(".page-number"),
      lastPageNumber = Number(pageNumbers[pageNumbers.length - 1].innerHTML),
      pageNumber = Number(toPageText.value);

    if (!isNaN(pageNumber) && pageNumber >= 1 && Number.isInteger(pageNumber)) {
      var url = "/page/" + (pageNumber > lastPageNumber ? lastPageNumber : pageNumber) + "/";
      toPageButton.href = pageNumber === 1 ? "/" : url;
    } else {
      toPageButton.href = "javascript:void(0);";
    }
  },

  //删除多余的class
  removeBodyPaceClass: function () {
    document.body.className = "pace-done";
  },
  // 修改body的type类型以适配css
  setValueToBodyType: function () {
    const input = document.getElementById("page-type"); // 获取input元素
    const value = input.value; // 获取input的value值
    document.body.dataset.type = value; // 将value值赋值到body的type属性上
  },
  //匿名评论
  addRandomCommentInfo: function () {
    // 从形容词数组中随机取一个值
    const randomAdjective = adjectives[Math.floor(Math.random() * adjectives.length)];

    // 从蔬菜水果动物名字数组中随机取一个值
    const randomName = vegetablesAndFruits[Math.floor(Math.random() * vegetablesAndFruits.length)];

    // 将两个值组合成一个字符串
    const name = `${randomAdjective}${randomName}`;

    function dr_js_autofill_commentinfos() {
      var lauthor = [
          "#author",
          "input[name='comname']",
          "#inpName",
          "input[name='author']",
          "#ds-dialog-name",
          "#name",
          "input[name='nick']",
          "#comment_author",
        ],
        lmail = [
          "#mail",
          "#email",
          "input[name='commail']",
          "#inpEmail",
          "input[name='email']",
          "#ds-dialog-email",
          "input[name='mail']",
          "#comment_email",
        ],
        lurl = [
          "#url",
          "input[name='comurl']",
          "#inpHomePage",
          "#ds-dialog-url",
          "input[name='url']",
          "input[name='website']",
          "#website",
          "input[name='link']",
          "#comment_url",
        ];
      for (var i = 0; i < lauthor.length; i++) {
        var author = document.querySelector(lauthor[i]);
        if (author != null) {
          author.value = name;
          author.dispatchEvent(new Event("input"));
          author.dispatchEvent(new Event("change"));
          break;
        }
      }
      for (var j = 0; j < lmail.length; j++) {
        var mail = document.querySelector(lmail[j]);
        if (mail != null) {
          mail.value = visitorMail;
          mail.dispatchEvent(new Event("input"));
          mail.dispatchEvent(new Event("change"));
          break;
        }
      }
      return !1;
    }

    dr_js_autofill_commentinfos();
    var input = document.getElementsByClassName("el-textarea__inner")[0];
    input.focus();
    input.setSelectionRange(-1, -1);
  },

  // 跳转开往
  totraveling: function () {
    anzhiyu.snackbarShow(
      "即将跳转到「开往」项目的成员博客，不保证跳转网站的安全性和可用性",
      element => {
        element.style.opacity = 0;
        travellingsTimer && clearTimeout(travellingsTimer);
      },
      5000,
      "取消"
    );
    travellingsTimer = setTimeout(function () {
      window.open("https://www.travellings.cn/go.html", "_blank");
    }, "5000");
  },

  // 工具函数替换字符串
  replaceAll: function (e, n, t) {
    return e.split(n).join(t);
  },

  // 音乐绑定事件
  musicBindEvent: function () {
    // NavMusic handles all event binding in init()
  },

  // 判断是否是移动端
  hasMobile: function () {
    let isMobile = false;
    if (
      navigator.userAgent.match(
        /(phone|pad|pod|iPhone|iPod|ios|iPad|Android|Mobile|BlackBerry|IEMobile|MQQBrowser|JUC|Fennec|wOSBrowser|BrowserNG|WebOS|Symbian|Windows Phone)/i
      ) ||
      document.body.clientWidth < 800
    ) {
      // 移动端
      isMobile = true;
    }
    return isMobile;
  },

  // 创建二维码
  qrcodeCreate: function () {
    if (document.getElementById("qrcode")) {
      document.getElementById("qrcode").innerHTML = "";
      var qrcode = new QRCode(document.getElementById("qrcode"), {
        text: window.location.href,
        width: 250,
        height: 250,
        colorDark: "#000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H,
      });
    }
  },

  // 判断是否在el内
  isInViewPortOfOne: function (el) {
    if (!el) return;
    const viewPortHeight = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight;
    const offsetTop = el.offsetTop;
    const scrollTop = document.documentElement.scrollTop;
    const top = offsetTop - scrollTop;
    return top <= viewPortHeight;
  },
  //添加赞赏蒙版
  addRewardMask: function () {
    if (!document.querySelector(".reward-main")) return;
    document.querySelector(".reward-main").style.display = "flex";
    document.querySelector(".reward-main").style.zIndex = "102";
    document.getElementById("quit-box").style.display = "flex";
  },
  // 移除赞赏蒙版
  removeRewardMask: function () {
    if (!document.querySelector(".reward-main")) return;
    document.querySelector(".reward-main").style.display = "none";
    document.getElementById("quit-box").style.display = "none";
  },

  keyboardToggle: function () {
    const isKeyboardOn = anzhiyu_keyboard;

    if (isKeyboardOn) {
      const consoleKeyboard = document.querySelector("#consoleKeyboard");
      consoleKeyboard.classList.remove("on");
      anzhiyu_keyboard = false;
    } else {
      const consoleKeyboard = document.querySelector("#consoleKeyboard");
      consoleKeyboard.classList.add("on");
      anzhiyu_keyboard = true;
    }

    localStorage.setItem("keyboardToggle", isKeyboardOn ? "false" : "true");
  },
  rightMenuToggle: function () {
    if (window.oncontextmenu) {
      window.oncontextmenu = null;
    } else if (!window.oncontextmenu && oncontextmenuFunction) {
      window.oncontextmenu = oncontextmenuFunction;
    }
  },
  switchConsole: () => {
    // switch console
    const consoleEl = document.getElementById("console");
    //初始化隐藏边栏
    const $htmlDom = document.documentElement.classList;
    $htmlDom.contains("hide-aside")
      ? document.querySelector("#consoleHideAside").classList.add("on")
      : document.querySelector("#consoleHideAside").classList.remove("on");
    if (consoleEl.classList.contains("show")) {
      consoleEl.classList.remove("show");
    } else {
      consoleEl.classList.add("show");
    }
    const consoleKeyboard = document.querySelector("#consoleKeyboard");

    if (consoleKeyboard) {
      if (localStorage.getItem("keyboardToggle") === "true") {
        consoleKeyboard.classList.add("on");
        anzhiyu_keyboard = true;
      } else {
        consoleKeyboard.classList.remove("on");
        anzhiyu_keyboard = false;
      }
    }
  },
  // 定义 intersectionObserver 函数，并接收两个可选参数
  intersectionObserver: function (enterCallback, leaveCallback) {
    let observer;
    return () => {
      if (!observer) {
        observer = new IntersectionObserver(entries => {
          entries.forEach(entry => {
            if (entry.intersectionRatio > 0) {
              enterCallback?.();
            } else {
              leaveCallback?.();
            }
          });
        });
      } else {
        // 如果 observer 对象已经存在，则先取消对之前元素的观察
        observer.disconnect();
      }
      return observer;
    };
  },
  // CategoryBar滚动
  scrollCategoryBarToRight: function () {
    // 获取需要操作的元素
    const items = document.getElementById("catalog-list");
    const nextButton = document.getElementById("category-bar-next");

    // 检查元素是否存在
    if (items && nextButton) {
      const itemsWidth = items.clientWidth;

      // 判断是否已经滚动到最右侧
      if (items.scrollLeft + items.clientWidth + 1 >= items.scrollWidth) {
        // 滚动到初始位置并更新按钮内容
        items.scroll({
          left: 0,
          behavior: "smooth",
        });
        nextButton.innerHTML = '<i class="anzhiyufont anzhiyu-icon-angle-double-right"></i>';
      } else {
        // 滚动到下一个视图
        items.scrollBy({
          left: itemsWidth,
          behavior: "smooth",
        });
      }
    } else {
      console.error("Element(s) not found: 'catalog-list' and/or 'category-bar-next'.");
    }
  },
  // 分类条
  categoriesBarActive: function () {
    const urlinfo = decodeURIComponent(window.location.pathname);
    const $categoryBar = document.getElementById("category-bar");
    if (!$categoryBar) return;

    if (urlinfo === "/") {
      $categoryBar.querySelector("#首页").classList.add("select");
    } else {
      const pattern = /\/categories\/.*?\//;
      const patbool = pattern.test(urlinfo);
      if (!patbool) return;

      const nowCategorie = urlinfo.split("/")[2];
      $categoryBar.querySelector(`#${nowCategorie}`).classList.add("select");
    }
  },
  topCategoriesBarScroll: function () {
    const $categoryBarItems = document.getElementById("category-bar-items");
    if (!$categoryBarItems) return;

    $categoryBarItems.addEventListener("mousewheel", function (e) {
      const v = -e.wheelDelta / 2;
      this.scrollLeft += v;
      e.preventDefault();
    });
  },
  // 切换菜单显示热评
  switchRightClickMenuHotReview: function () {
    const postComment = document.getElementById("post-comment");
    const menuCommentBarrageDom = document.getElementById("menu-commentBarrage");
    if (postComment) {
      menuCommentBarrageDom.style.display = "flex";
    } else {
      menuCommentBarrageDom.style.display = "none";
    }
  },
  // 切换作者卡片状态文字
  changeSayHelloText: function () {
    const greetings = GLOBAL_CONFIG.authorStatus.skills;

    const authorInfoSayHiElement = document.getElementById("author-info__sayhi");

    // 如果只有一个问候语，设置为默认值
    if (greetings.length === 1) {
      authorInfoSayHiElement.textContent = greetings[0];
      return;
    }

    let lastSayHello = authorInfoSayHiElement.textContent;

    let randomGreeting = lastSayHello;
    while (randomGreeting === lastSayHello) {
      randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];
    }
    authorInfoSayHiElement.textContent = randomGreeting;
  },
};

const anzhiyuPopupManager = {
  queue: [],
  processing: false,
  Jump: false,

  enqueuePopup(title, tip, url, duration = 3000) {
    this.queue.push({ title, tip, url, duration });
    if (!this.processing) {
      this.processQueue();
    }
  },

  processQueue() {
    if (this.queue.length > 0 && !this.processing) {
      this.processing = true;
      const { title, tip, url, duration } = this.queue.shift();
      this.popupShow(title, tip, url, duration);
    }
  },

  popupShow(title, tip, url, duration) {
    const popupWindow = document.getElementById("popup-window");
    if (!popupWindow) return;
    const windowTitle = popupWindow.querySelector(".popup-window-title");
    const windowContent = popupWindow.querySelector(".popup-window-content");
    const cookiesTip = windowContent.querySelector(".popup-tip");
    if (popupWindow.classList.contains("show-popup-window")) {
      popupWindow.classList.add("popup-hide");
    }

    // 等待上一个弹窗完全消失
    setTimeout(() => {
      // 移除之前的点击事件处理程序
      popupWindow.removeEventListener("click", this.clickEventHandler);
      if (url) {
        if (window.pjax) {
          this.clickEventHandler = event => {
            event.preventDefault();
            pjax.loadUrl(url);
            popupWindow.classList.remove("show-popup-window");
            popupWindow.classList.remove("popup-hide");
            this.Jump = true;

            // 处理队列中的下一个弹出窗口
            this.processing = false;
            this.processQueue();
          };

          popupWindow.addEventListener("click", this.clickEventHandler);
        } else {
          this.clickEventHandler = () => {
            window.location.href = url;
          };
          popupWindow.addEventListener("click", this.clickEventHandler);
        }
        if (popupWindow.classList.contains("no-url")) {
          popupWindow.classList.remove("no-url");
        }
      } else {
        if (!popupWindow.classList.contains("no-url")) {
          popupWindow.classList.add("no-url");
        }

        this.clickEventHandler = () => {
          popupWindow.classList.add("popup-hide");
          setTimeout(() => {
            popupWindow.classList.remove("popup-hide");
            popupWindow.classList.remove("show-popup-window");
          }, 1000);
        };
        popupWindow.addEventListener("click", this.clickEventHandler);
      }

      if (popupWindow.classList.contains("popup-hide")) {
        popupWindow.classList.remove("popup-hide");
      }
      popupWindow.classList.add("show-popup-window");
      windowTitle.textContent = title;
      cookiesTip.textContent = tip;
    }, 800);

    setTimeout(() => {
      if (url && !this.Jump) {
        this.Jump = false;
      }
      if (!popupWindow.classList.contains("popup-hide") && popupWindow.className != "") {
        popupWindow.classList.add("popup-hide");
      }

      // 处理队列中的下一个弹出窗口
      this.processing = false;
      this.processQueue();
    }, duration);
  },
};
