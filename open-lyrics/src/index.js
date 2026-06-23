var settings = {};

function initialize(config) {
  settings = config || {};
  log.info("[open-lyrics] initialized");
  return true;
}

function cleanup() {
  log.info("[open-lyrics] cleanup");
}

var LRCLIB_BASE = "https://lrclib.net/api";

function buildCacheKey(trackName, artistName) {
  return "lrclib_" + trackName.toLowerCase() + "_" + artistName.toLowerCase();
}

function lrclibGet(trackName, artistName, albumName, durationSec) {
  var params = [
    "track_name=" + encodeURIComponent(trackName),
    "artist_name=" + encodeURIComponent(artistName)
  ];
  if (albumName) params.push("album_name=" + encodeURIComponent(albumName));
  if (durationSec) params.push("duration=" + Math.round(durationSec));
  try {
    var resp = fetch(LRCLIB_BASE + "/get?" + params.join("&"), { method: "GET" });
    if (!resp || resp.status === 404) return null;
    if (!resp.ok) return null;
    return resp.json();
  } catch (e) {
    log.error("[open-lyrics] error:", String(e));
    return null;
  }
}

function lrclibSearch(trackName, artistName) {
  try {
    var url = LRCLIB_BASE + "/search?track_name=" + encodeURIComponent(trackName) + "&artist_name=" + encodeURIComponent(artistName);
    var resp = fetch(url, { method: "GET" });
    if (!resp || !resp.ok) return null;
    var results = resp.json();
    if (!results || !Array.isArray(results) || results.length === 0) return null;
    return results[0];
  } catch (e) {
    return null;
  }
}

function parseLRC(lrc) {
  if (!lrc) return [];
  var lines = lrc.split("\n");
  var parsed = [];
  var timePattern = /^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/;
  for (var i = 0; i < lines.length; i++) {
    var match = lines[i].trim().match(timePattern);
    if (!match) continue;
    var ms = Math.round((parseInt(match[1]) * 60 + parseFloat(match[2])) * 1000);
    var text = match[3].trim();
    if (/^[a-z]{2}:/.test(text)) continue;
    parsed.push({ startTimeMs: ms, words: text, endTimeMs: 0 });
  }
  for (var j = 0; j < parsed.length - 1; j++) {
    parsed[j].endTimeMs = parsed[j + 1].startTimeMs;
  }
  if (parsed.length > 0) parsed[parsed.length - 1].endTimeMs = parsed[parsed.length - 1].startTimeMs + 5000;
  return parsed;
}

function fetchLyrics(trackName, artistName, albumName, durationSec) {
  if (!trackName || !artistName) return null;
  var key = buildCacheKey(trackName, artistName);
  if (settings.cacheResults !== false) {
    try {
      var cached = storage.get(key);
      if (cached) return JSON.parse(cached);
    } catch (e) {}
  }
  var data = lrclibGet(trackName, artistName, albumName, durationSec);
  if (!data) data = lrclibSearch(trackName, artistName);
  if (!data) return null;
  var result = null;
  if (data.instrumental) {
    result = { lines: [], syncType: "LINE_SYNCED", instrumental: true, plainLyrics: "", provider: "LRCLIB" };
  } else if (settings.preferSynced !== false && data.syncedLyrics) {
    var lines = parseLRC(data.syncedLyrics);
    if (lines.length > 0) {
      result = { lines: lines, syncType: "LINE_SYNCED", instrumental: false, plainLyrics: data.plainLyrics || "", provider: "LRCLIB" };
    }
  }
  if (!result && data.plainLyrics) {
    result = { lines: [], syncType: "UNSYNCED", instrumental: false, plainLyrics: data.plainLyrics, provider: "LRCLIB" };
  }
  if (settings.cacheResults !== false) {
    try { storage.set(key, JSON.stringify(result)); } catch (e) {}
  }
  return result;
}

registerExtension({
  initialize: initialize,
  cleanup: cleanup,
  fetchLyrics: fetchLyrics
});
