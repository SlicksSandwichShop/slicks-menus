/*
 * Slick's digital menus - the page logic.
 *
 * What it does, in order:
 *   1. Loads the menu data (Google Sheet CSV -> last good copy -> bundled copy).
 *   2. Works out what to show from the shop clock: breakfast, lunch, or closed.
 *   3. Rotates: one long menu slot, then the extra slide(s) for this screen.
 *   4. Keeps the three screens in step by deriving the rotation from the clock.
 *
 * URL options (the Pis only need ?screen=N):
 *   ?screen=1|2|3          which TV this is
 *   ?now=2026-11-11T11:00  pretend it is this shop time (testing)
 *   ?show=L1|B2|closed|special:Wed|extra:0   freeze on one slide (testing)
 *   ?grill=1               force the grill-closed bar (testing)
 *   ?closed=picture        show the fixed Closed picture instead of the live Closed screen (testing)
 *   ?freeze=1              with ?now=, stop the fake clock from advancing (testing)
 *   ?data=local|live|draft use exactly one data source, for previewing. local = the files in
 *                          data/, live = the published Sheet (what the TVs read), draft = the
 *                          Sheet as it is right now, unpublished edits included. If that source
 *                          cannot be read the page says so instead of quietly using another one.
 *   ?season=Christmas      force a season from the seasons tab (previewing)
 *   ?still=1               video slides show one mid-video frame instead of playing (preview thumbnails)
 */
(function () {
  "use strict";
  var CFG = window.SLICKS_CONFIG;
  var Q = new URLSearchParams(location.search);
  var SCREEN = parseInt(Q.get("screen") || "1", 10);
  var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var TABS = ["items", "sections", "specials", "settings"];
  var DATA = Q.get("data") || "";     // "" = normal (Sheet, then saved copy, then bundled copy)

  var stage = document.getElementById("stage");
  var data = null;          // parsed tabs
  var slides = {};          // id -> { el, onShow, onHide }
  var current = null;       // id of slide on screen
  var season = null, seasonName = null, prefetched = false;

  /* ---------------- small helpers ---------------- */
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function fit() {
    var s = Math.min(window.innerWidth / 3840, window.innerHeight / 2160);
    stage.style.transform = "scale(" + s + ")";
    stage.style.left = ((window.innerWidth - 3840 * s) / 2) + "px";
    stage.style.top = ((window.innerHeight - 2160 * s) / 2) + "px";
  }
  window.addEventListener("resize", fit); fit();

  /* ---------------- CSV ---------------- */
  function parseCsv(text) {
    var rows = [], row = [], cell = "", q = false, i, c;
    text = text.replace(/^﻿/, "");
    for (i = 0; i < text.length; i++) {
      c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(cell); cell = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cell); rows.push(row); row = []; cell = "";
      } else cell += c;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    var head = rows.shift().map(function (h) { return h.trim().toLowerCase(); });
    return rows.filter(function (r) { return r.some(function (x) { return x.trim() !== ""; }); })
      .map(function (r) {
        var o = {};
        head.forEach(function (h, k) { o[h] = (r[k] || "").trim(); });
        return o;
      });
  }

  /* ---------------- data loading ---------------- */
  function fetchText(url, ms) {
    var ctl = new AbortController();
    var t = setTimeout(function () { ctl.abort(); }, ms || 8000);
    return fetch(url, { signal: ctl.signal, cache: "no-store" }).then(function (r) {
      clearTimeout(t);
      if (!r.ok) throw new Error(url + " " + r.status);
      return r.text();
    });
  }
  function sourceUrl(tab) {
    if (DATA === "local") return "";
    if (DATA === "draft") return CFG.sheetId ? "https://docs.google.com/spreadsheets/d/" + CFG.sheetId + "/gviz/tq?tqx=out:csv&headers=1&sheet=" + tab : "";
    return (CFG.sheetCsv && CFG.sheetCsv[tab]) || "";
  }
  function bust(url) { return url + (url.indexOf("?") < 0 ? "?" : "&") + "t=" + Date.now(); }
  function loadTab(tab) {
    var url = sourceUrl(tab), key = "slicks.csv." + tab;
    if (DATA) {   // previewing: exactly the source asked for, never a quiet fallback
      var p0 = DATA === "local" ? fetchText("data/" + tab + ".csv")
        : (url ? fetchText(bust(url)) : Promise.reject(new Error("no " + DATA + " link for '" + tab + "' in config.js")));
      return p0.then(parseCsv);
    }
    var p = url ? fetchText(bust(url)) : Promise.reject();
    return p.then(function (txt) {
      var rows = parseCsv(txt);
      if (!rows.length) throw new Error("empty " + tab);
      try { localStorage.setItem(key, txt); } catch (e) {}
      return rows;
    }).catch(function () {
      var saved = null;
      try { saved = localStorage.getItem(key); } catch (e) {}
      if (saved) return parseCsv(saved);
      return fetchText("data/" + tab + ".csv").then(parseCsv);
    });
  }
  function loadAll() {
    var jobs = TABS.map(loadTab);
    jobs.push(loadTab("seasons").catch(function () { return []; }));   // optional tab
    return Promise.all(jobs).then(function (r) {
      var d = {};
      TABS.forEach(function (t, i) { d[t] = r[i]; });
      d.seasons = r[TABS.length];
      d.cfg = {};
      d.settings.forEach(function (x) { d.cfg[x.key] = x.value; });
      return d;
    });
  }

  /* ---------------- formatting ---------------- */
  // "7.49", "$7.49", "0.69/1.39" -> "$7.49", "$0.69/$1.39". Anything else is shown as typed.
  function money(v) {
    if (v == null || v === "") return "";
    return String(v).replace(/\$?\s*(\d+(?:\.\d{1,2})?)/g, function (_, n) { return "$" + parseFloat(n).toFixed(2); });
  }
  function num(v) { var n = parseFloat(String(v).replace(/[^0-9.]/g, "")); return isNaN(n) ? null : n; }

  /* ---------------- menu pages ---------------- */
  function buildMenu(pageId) {
    var d = data, cfg = d.cfg;
    var secs = d.sections.filter(function (s) { return s.page === pageId; });
    var its = d.items.filter(function (i) { return i.page === pageId; });
    var colNums = {};
    secs.forEach(function (s) { colNums[s.column] = 1; });
    its.forEach(function (i) { colNums[i.column] = 1; });
    var maxCol = Math.max.apply(null, Object.keys(colNums).map(Number).concat([2]));
    var root = el("div", "slide menu p-" + pageId + " " + (maxCol >= 3 ? "cols3" : "cols2"));

    Object.keys(colNums).sort().forEach(function (cn) {
      var col = el("div", "col col" + cn);
      secs.filter(function (s) { return s.column === cn; }).forEach(function (s) {
        try { col.appendChild(buildSection(s, its, cfg)); } catch (e) { console.warn("section failed", s, e); }
      });
      its.filter(function (i) { return i.column === cn && i.type === "social"; }).forEach(function (i) {
        var b = el("div", "social");
        b.appendChild(el("div", "follow", i.description));
        var img = el("img"); img.src = CFG.facebookImage; b.appendChild(img);
        b.appendChild(el("div", "handle", i.name));
        col.appendChild(b);
      });
      var foots = its.filter(function (i) { return i.column === cn && i.type === "foot"; });
      var withFooter = cn === "1" && cfg.footer;
      if (foots.length || withFooter) {
        var f = el("div", "foot");
        foots.forEach(function (n) { f.appendChild(el("div", "note", n.description)); });
        if (withFooter) f.appendChild(el("div", "note last", cfg.footer));
        col.appendChild(f);
      }
      root.appendChild(col);
    });

    var bar = el("div", "grillbar", cfg.grill_closed_text || "");
    root.appendChild(bar);
    return { el: root, bar: bar };
  }

  function buildSection(s, its, cfg) {
    var sec = el("div", "sec");
    var heads = s.headers ? s.headers.split("|") : null;
    var t = el("div", "title" + (heads ? " hasheads" : ""));
    t.appendChild(el("span", "t", s.title));
    if (s.subtitle) t.appendChild(el("span", "sub", s.subtitle));
    sec.appendChild(t);
    if (heads) {
      var h = el("div", "heads");
      h.appendChild(el("span"));
      heads.forEach(function (x) { h.appendChild(el("span", "", x)); });
      sec.appendChild(h);
    }
    its.filter(function (i) { return i.column === s.column && i.section === s.section && i.type !== "foot" && i.type !== "social"; })
      .forEach(function (i) {
        try {
          if (i.type === "note") { sec.appendChild(el("div", "note", i.description)); return; }
          sec.appendChild(buildItem(i, !!heads, cfg));
        } catch (e) { console.warn("item failed", i, e); }
      });
    return sec;
  }

  function buildItem(i, sbc, cfg) {
    var box = el("div", "item " + (sbc ? "sbc" : "one") + (i.extra_price ? " hasx" : ""));
    var row = el("div", "row");
    row.appendChild(el("span", "n", i.name));
    if (sbc) {
      var p = num(i.price), b = i.basket, c = i.combo;
      if (i.calc && i.calc.toUpperCase() === "Y" && p != null) {
        if (!b) b = (p + num(cfg.basket_add || 3.39)).toFixed(2);
        if (!c) c = (p + num(cfg.combo_add || 5.48)).toFixed(2);
      }
      [i.price, b, c].forEach(function (v) { row.appendChild(el("span", "p", money(v))); });
    } else {
      row.appendChild(el("span", "p", money(i.price)));
    }
    box.appendChild(row);
    if (i.description) box.appendChild(el("div", "desc", i.description));
    if (i.extra_price) {
      var x = el("div", "xtra");
      x.appendChild(el("span", "xl", i.extra_label));
      x.appendChild(el("span", "", money(i.extra_price)));
      box.appendChild(x);
    }
    return box;
  }

  /* ---------------- special / image / video slides ---------------- */
  // True small caps like the old slides: capitals full size, lowercase as capitals at 80%.
  function smallCaps(node, text) {
    var run = "", small = false;
    function flush() {
      if (!run) return;
      if (small) { var s = el("span", "sc", run); node.appendChild(s); }
      else node.appendChild(document.createTextNode(run));
      run = "";
    }
    for (var k = 0; k < text.length; k++) {
      var ch = text.charAt(k), low = ch !== ch.toUpperCase();
      if (low !== small) { flush(); small = low; }
      run += low ? ch.toUpperCase() : ch;
    }
    flush();
    return node;
  }
  function buildSpecial(day) {
    var sp = data.specials.filter(function (r) { return r.day === day; })[0];
    if (!sp) return null;
    var root = el("div", "slide special");
    root.appendChild(smallCaps(el("div", "st"), sp.title));
    var sl = el("div", "sl");
    sp.lines.split("|").forEach(function (ln) {
      // ^ = extra space after this line, ~ = smaller text (markers may come in either order)
      var cls = "";
      while (ln.charAt(0) === "^" || ln.charAt(0) === "~") { cls += ln.charAt(0) === "^" ? " gap" : " sm"; ln = ln.slice(1); }
      ln = ln.replace("{price}", money(sp.price));
      sl.appendChild(smallCaps(el("div", cls.trim()), ln));
    });
    var hasSide = !!sp.side_heading;
    if (!hasSide) root.appendChild(sl);
    else { sl.style.left = "0"; root.appendChild(sl); }
    var ph = el("img", "photo " + (hasSide ? "left" : "center")); ph.src = sp.photo ? "assets/" + sp.photo : "";
    root.appendChild(ph);
    if (hasSide) {
      var side = el("div", "side");
      side.appendChild(smallCaps(el("div", "sh"), sp.side_heading));
      sp.side_lines.split("|").forEach(function (x) { side.appendChild(smallCaps(el("div", "sx"), x)); });
      root.appendChild(side);
    }
    return { el: root };
  }
  function buildImage(src) {
    var root = el("div", "slide");
    var img = el("img", "full"); img.src = src; root.appendChild(img);
    return { el: root };
  }
  // A video is read from the cache once and played from memory: works offline and avoids
  // range-request trouble. Its slot on the rotation is its own length, so it always plays out.
  var blobCache = {};
  function videoBlob(src) {
    if (!blobCache[src]) blobCache[src] = fetch(src).then(function (r) {
      if (!r.ok) throw new Error(src + " " + r.status);
      return r.blob();
    }).then(function (b) { return URL.createObjectURL(b); });
    return blobCache[src];
  }
  function savedDuration(src) { try { return parseFloat(localStorage.getItem("slicks.dur." + src)) || 0; } catch (e) { return 0; } }
  function buildVideo(src) {
    var root = el("div", "slide video");
    root.setAttribute("data-src", src);   // which file this slide plays (handy when checking seasons)
    var v = el("video", "full"); v.muted = true; v.playsInline = true; v.preload = "auto";
    root.appendChild(v);
    var shown = false;
    var s = { el: root, src: src, seconds: savedDuration(src) || 6 };   // 6 s until the real length is known
    v.addEventListener("loadedmetadata", function () {
      if (v.duration && isFinite(v.duration)) {
        s.seconds = v.duration;
        try { localStorage.setItem("slicks.dur." + src, String(v.duration)); } catch (e) {}
        if (Q.get("still")) v.currentTime = Math.max(0, Math.min(v.duration * 0.4, v.duration - 0.1));   // preview thumbnail: a mid-video frame
      }
    });
    function play() { if (Q.get("still")) return; try { v.currentTime = 0; var p = v.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {} }
    s.load = function () {
      if (v.src) return;
      videoBlob(src).then(function (u) { v.src = u; if (shown) play(); }).catch(function (e) { console.warn("video load failed", e); });
    };
    s.onShow = function () { shown = true; if (v.src) play(); else s.load(); };
    s.onHide = function () { shown = false; try { v.pause(); } catch (e) {} };
    return s;
  }

  /* ---------------- reading dates typed into the Sheet ---------------- */
  // A spreadsheet likes to "help" by turning 02-07 into a real date, which then comes out as
  // 7-Feb or 2/7/2027. Accept every shape it is likely to produce and turn it into one of
  //   "02-07"        (every year)        "2027-02-07"   (that day only)
  // Anything that is not a real date gives "" and is IGNORED, never matched by accident.
  var MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  function p2(n) { return ("0" + n).slice(-2); }
  function normDate(v) {
    v = String(v || "").trim();
    var m, y = "", mo, da;
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v))) { y = m[1]; mo = +m[2]; da = +m[3]; }
    else if ((m = /^(\d{1,2})-(\d{1,2})$/.exec(v))) { mo = +m[1]; da = +m[2]; }
    else if ((m = /^(\d{1,2})[- ]([A-Za-z]{3})[a-z]*(?:[- ,]+(\d{2,4}))?$/.exec(v))) { da = +m[1]; mo = MONTHS[m[2].toLowerCase()]; y = m[3] || ""; }
    else if ((m = /^([A-Za-z]{3})[a-z]*[- ](\d{1,2})(?:[- ,]+(\d{2,4}))?$/.exec(v))) { mo = MONTHS[m[1].toLowerCase()]; da = +m[2]; y = m[3] || ""; }
    else if ((m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(v))) { mo = +m[1]; da = +m[2]; y = m[3] || ""; }
    else return "";
    if (!mo || mo < 1 || mo > 12 || !da || da < 1 || da > 31) return "";
    if (y && y.length === 2) y = "20" + y;
    return (y ? y + "-" : "") + p2(mo) + "-" + p2(da);
  }

  /* ---------------- shop clock and schedule ---------------- */
  var fakeBase = null, fakeStart = Date.now();
  if (Q.get("now")) {
    var m = Q.get("now").match(/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)(?::(\d\d))?$/);
    if (m) fakeBase = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  }
  var tzFmt = new Intl.DateTimeFormat("en-US", { timeZone: CFG.timezone, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  // A Date whose UTC fields hold the shop's wall-clock time.
  function shopNow() {
    if (fakeBase != null) return new Date(fakeBase + (Q.get("freeze") ? 0 : Date.now() - fakeStart));
    var p = {};
    tzFmt.formatToParts(new Date()).forEach(function (x) { p[x.type] = x.value; });
    return new Date(Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second));
  }
  function mins(hhmm, dflt) {
    var m = /^(\d{1,2}):(\d\d)$/.exec(hhmm || "");
    return m ? (+m[1]) * 60 + (+m[2]) : dflt;
  }
  // closed_dates entries: 2026-11-26 (one day), 2026-11-26..2026-11-27 (a range),
  // 11-11 (every year), 12-24..12-25 (a range, every year; may run over New Year).
  // Any entry may carry a reason after "=", shown on the Closed screen that day:
  // 11-11=Veterans Day, 2026-11-20=a water main repair. Reasons cannot contain a comma.
  // Returns the matching entry's reason ("" when it has none), or null when the date is not listed.
  function closedReason(list, iso, md) {
    for (var i = 0; i < list.length; i++) {
      var e = list[i], eq = e.indexOf("="), dates = eq < 0 ? e : e.slice(0, eq);
      if (!dates.trim()) continue;
      var p = dates.split(".."), a = normDate(p[0]), b = normDate(p[1] || p[0]);
      if (!a || !b || (a.length !== b.length)) continue;                // not a real date (or mixed styles): ignore
      var hit = a.length === 10 ? (iso >= a && iso <= b) : (a <= b ? (md >= a && md <= b) : (md >= a || md <= b));
      if (hit) return eq < 0 ? "" : e.slice(eq + 1).trim();
    }
    return null;
  }
  // What one calendar day is: its weekday, whether the shop opens at all, and why not.
  function dayInfo(d) {
    var c = data.cfg, day = DAYS[d.getUTCDay()];
    var iso = d.getUTCFullYear() + "-" + p2(d.getUTCMonth() + 1) + "-" + p2(d.getUTCDate());
    var openDays = (c.open_days || "Mon,Tue,Wed,Thu,Fri").split(",").map(function (s) { return s.trim(); });
    var holidays = (c.closed_dates || "").split(",").map(function (s) { return s.trim(); });
    var reason = closedReason(holidays, iso, iso.slice(5));
    return { day: day, iso: iso, listed: reason !== null, reason: reason || "", opens: openDays.indexOf(day) >= 0 && reason === null };
  }
  function schedule(now) {
    var c = data.cfg, info = dayInfo(now);
    var t = now.getUTCHours() * 60 + now.getUTCMinutes();
    var bs = mins(c.breakfast_start, 390), ls = mins(c.lunch_start, 600), gc = mins(c.grill_close, 840), cl = mins(c.close, 870);
    var st = "closed";
    if (info.opens && t >= bs && t < cl) st = t < ls ? "breakfast" : "lunch";
    return { state: st, day: info.day, grillClosed: st === "lunch" && t >= gc };
  }

  /* ---------------- the live Closed screen ---------------- */
  // Drawn by the page instead of a fixed picture, so it can say why the shop is closed today
  // and when it opens next, and so the hours always match the Sheet.
  var DAYNAMES = { Sun: "Sunday", Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday" };
  var MONTHNAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  function clock(m) {            // 390 -> { t: "6:30", ap: "am" }
    var h = Math.floor(m / 60), mm = m % 60;
    return { t: ((h + 11) % 12 + 1) + ":" + p2(mm), ap: h < 12 ? "am" : "pm" };
  }
  function span(a, b) {          // "6:30 – 10:00 am", "10:00 am – 2:30 pm"
    var x = clock(a), y = clock(b);
    return x.t + (x.ap === y.ap ? "" : " " + x.ap) + " – " + y.t + " " + y.ap;
  }
  function openDaysText() {      // "Monday – Friday" when the days run in a row, otherwise a list
    var c = data.cfg, order = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    var days = (c.open_days || "Mon,Tue,Wed,Thu,Fri").split(",").map(function (s) { return s.trim(); });
    var idx = order.map(function (d, i) { return days.indexOf(d) >= 0 ? i : -1; }).filter(function (i) { return i >= 0; });
    if (!idx.length) return "";
    var inRow = idx[idx.length - 1] - idx[0] === idx.length - 1;
    if (inRow && idx.length > 2) return DAYNAMES[order[idx[0]]] + " – " + DAYNAMES[order[idx[idx.length - 1]]];
    return idx.map(function (i) { return DAYNAMES[order[i]]; }).join(", ");
  }
  // The words for right now. Looks up to a year ahead for the next day the shop opens.
  function closedText(now) {
    var c = data.cfg, bs = mins(c.breakfast_start, 390), ls = mins(c.lunch_start, 600), cl = mins(c.close, 870);
    var t = now.getUTCHours() * 60 + now.getUTCMinutes(), today = dayInfo(now);
    var at = clock(bs), when = "", back = "";
    for (var n = 0; n <= 370; n++) {
      var d = new Date(now.getTime() + n * 86400000), info = dayInfo(d);
      if (!info.opens || (n === 0 && t >= bs)) continue;
      if (n === 0) when = "Open today";
      else if (n === 1) when = "Back tomorrow";
      else if (n < 7) when = "Back " + DAYNAMES[info.day];
      else when = "Back " + DAYNAMES[info.day] + ", " + MONTHNAMES[d.getUTCMonth()] + " " + d.getUTCDate();
      back = when + " at " + at.t + " " + at.ap;
      break;
    }
    var why = "";
    if (today.listed) why = today.reason ? "Closed today for " + today.reason : "Closed all day today";
    return { why: why, back: back,
             hours: openDaysText() + "  •  Breakfast " + span(bs, ls) + "  •  Lunch " + span(ls, cl) };
  }
  function buildClosed() {
    var root = el("div", "slide closed");
    var logo = el("img", "logo"); logo.src = CFG.logoImage; root.appendChild(logo);
    root.appendChild(el("div", "sorry", "SORRY, WE’RE"));
    root.appendChild(el("div", "big", "CLOSED"));
    root.appendChild(el("div", "rule"));
    var info = el("div", "info");
    var why = el("div", "why"), back = el("div", "back"), hours = el("div", "hours");
    [why, back, hours].forEach(function (x) { info.appendChild(x); });
    info.appendChild(el("div", "web", CFG.website || ""));
    root.appendChild(info);
    var last = "";
    var pen = document.createElement("canvas").getContext("2d");
    function set(node, text, size, room) {      // shrink a long line so it never runs off the screen
      node.textContent = text;
      node.style.display = text ? "" : "none";
      pen.font = "bold 100px Arial, 'Liberation Sans', Helvetica, sans-serif";
      var w = pen.measureText(text).width || 1;
      node.style.fontSize = Math.min(size, Math.floor(room * 100 / w)) + "px";
    }
    function update(now) {
      var x = closedText(now), key = x.why + "|" + x.back + "|" + x.hours;
      if (key === last) return;
      last = key;
      root.classList.toggle("hasreason", !!x.why);
      set(why, x.why.toUpperCase(), 150, 3380);
      set(back, x.back.toUpperCase(), x.why ? 170 : 200, 3380);
      set(hours, x.hours, 110, 3380);
    }
    return { el: root, update: update };
  }

  /* ---------------- rotation ---------------- */
  // The extra slides for this screen right now, each with how long it stays up.
  // Pictures and the Special get extra_seconds; a video gets its own full length.
  function extrasFor(sch) {
    var out = [], each = parseFloat(data.cfg.extra_seconds || 5);
    (CFG.screens[SCREEN] || []).forEach(function (x, idx) {
      if (x.type === "special") {
        var days = (data.cfg.special_days || "Wed,Thu,Fri").split(",").map(function (d) { return d.trim(); });
        var sid = "special:" + sch.day;
        if (sch.state === "lunch" && days.indexOf(sch.day) >= 0 && slides[sid]) out.push({ id: sid, secs: each, special: true });
      } else {
        var id = "extra:" + idx, sl = slides[id];
        out.push({ id: id, secs: x.type === "video" && sl && sl.seconds ? sl.seconds : each });
      }
    });
    return out;
  }
  function pickSlide(now, sch) {
    var forced = Q.get("show");
    if (forced) return forced;
    if (sch.state === "closed") return "closed";
    var menuId = (sch.state === "breakfast" ? "B" : "L") + SCREEN;
    var extras = extrasFor(sch), c = data.cfg;
    var hasSpecial = extras.some(function (e) { return e.special; });
    var menuLen = parseFloat((hasSpecial ? c.menu_seconds_with_special : c.menu_seconds) || (hasSpecial ? 25 : 30));
    var total = menuLen + extras.reduce(function (a, e) { return a + e.secs; }, 0);
    var pos = (now.getTime() / 1000) % total;
    if (pos < menuLen) return menuId;
    pos -= menuLen;
    for (var i = 0; i < extras.length; i++) {
      if (pos < extras[i].secs) return extras[i].id;
      pos -= extras[i].secs;
    }
    return menuId;
  }

  /* ---------------- seasons (holiday video swap and overlay) ---------------- */
  // Dates like 12-01 repeat every year (and may run over New Year, e.g. 12-20 to 01-02);
  // dates like 2026-12-01 are one time only.
  function activeSeason(now) {
    var list = data.seasons || [], want = Q.get("season"), i;
    if (want) {
      for (i = 0; i < list.length; i++) if (list[i].name.toLowerCase() === want.toLowerCase()) return list[i];
      return null;
    }
    var md = ("0" + (now.getUTCMonth() + 1)).slice(-2) + "-" + ("0" + now.getUTCDate()).slice(-2);
    var full = now.getUTCFullYear() + "-" + md;
    for (i = 0; i < list.length; i++) {
      var a = normDate(list[i].start), b = normDate(list[i].end);
      if (!a || !b || a.length !== b.length) continue;                  // blank, not a real date, or mixed styles: never matches
      if (a.length === 10) { if (full >= a && full <= b) return list[i]; }
      else if (a <= b) { if (md >= a && md <= b) return list[i]; }
      else if (md >= a || md <= b) return list[i];
    }
    return null;
  }

  function show(id) {
    if (id === current || !slides[id]) return;
    if (current && slides[current]) {
      slides[current].el.classList.remove("on");
      if (slides[current].onHide) slides[current].onHide();
    }
    current = id;
    slides[id].el.classList.add("on");
    if (slides[id].onShow) slides[id].onShow();
  }

  // Once a night (3 AM shop time) reload so the Pi picks up a new version of the page itself.
  // The "already did it today" flag is stored, otherwise the reload would repeat all hour.
  function nightlyReload(now) {
    if (fakeBase || now.getUTCHours() !== 3) return false;
    var today = now.getUTCFullYear() + "-" + now.getUTCMonth() + "-" + now.getUTCDate(), last = null;
    try { last = localStorage.getItem("slicks.reloaded"); } catch (e) {}
    if (last === today) return false;
    try { localStorage.setItem("slicks.reloaded", today); } catch (e) { return false; }
    location.reload();
    return true;
  }
  function tick() {
    if (!data) return;
    var now = shopNow(), sch = schedule(now);
    if (nightlyReload(now)) return;
    var se = activeSeason(now), sn = se ? se.name : "";
    if (sn !== seasonName) {                 // first run, new data, or a season just started or ended
      seasonName = sn; season = se;
      var keep = current;
      build(); current = null;
      if (keep && slides[keep]) show(keep);
    }
    var id = pickSlide(now, sch);
    var grill = Q.get("grill") === "1" || sch.grillClosed;
    Object.keys(slides).forEach(function (k) { if (slides[k].bar) slides[k].bar.classList.toggle("on", grill); });
    if (slides.closed && slides.closed.update) slides.closed.update(now);
    show(id);
  }

  /* ---------------- build everything ---------------- */
  function build() {
    stage.innerHTML = "";
    slides = {}; current = null;
    ["B", "L"].forEach(function (p) {
      var id = p + SCREEN; slides[id] = buildMenu(id);
    });
    // a forced ?show=L1 for another screen's page is allowed in testing
    ["B1", "B2", "B3", "L1", "L2", "L3"].forEach(function (id) { if (!slides[id] && Q.get("show") === id) slides[id] = buildMenu(id); });
    (CFG.screens[SCREEN] || []).forEach(function (x, idx) {
      if (x.type === "image") slides["extra:" + idx] = buildImage(x.src);
      if (x.type === "video") {
        var file = (season && season.video) || data.cfg.video;
        slides["extra:" + idx] = buildVideo(file ? "assets/" + file : x.src);
      }
    });
    ["Wed", "Thu", "Fri", "Mon", "Tue"].forEach(function (d) { var sp = buildSpecial(d); if (sp) slides["special:" + d] = sp; });
    // Live Closed screen; the fixed picture if it is switched off, asked for, or fails to build.
    slides.closed = null;
    if (CFG.closedLive && Q.get("closed") !== "picture") {
      try { slides.closed = buildClosed(); slides.closed.update(shopNow()); }
      catch (e) { console.warn("live Closed screen failed, using the picture", e); slides.closed = null; }
    }
    if (!slides.closed) slides.closed = buildImage(CFG.closedImage);
    Object.keys(slides).forEach(function (k) { stage.appendChild(slides[k].el); });
    if (season && season.overlay) {
      var ov = el("img", "overlay"); ov.src = "assets/" + season.overlay; stage.appendChild(ov);
    }
    if (!Q.get("show")) warmUp();
  }

  // Load this screen's video now (so its length is known) and fetch every seasonal file
  // ahead of time, so December's video is already on the Pi before December.
  function warmUp() {
    Object.keys(slides).forEach(function (k) { if (slides[k].load) slides[k].load(); });
    if (prefetched) return;
    prefetched = true;
    (data.seasons || []).forEach(function (se) {
      [se.video, se.overlay].forEach(function (f) { if (f) fetch("assets/" + f).catch(function () {}); });
    });
  }

  function showError(msg) {
    stage.innerHTML = "";
    var e = el("div", "err"); e.textContent = msg; stage.appendChild(e);
  }

  function start() {
    loadAll().then(function (d) {
      data = d; seasonName = null; tick();
    }).catch(function (e) {
      console.error("startup failed", e);
      if (DATA) showError("Could not read the '" + DATA + "' data source: " + (e && e.message ? e.message : e));
    });
    setInterval(tick, 250);
    setInterval(function () {
      loadAll().then(function (d) { data = d; seasonName = null; tick(); })
        .catch(function () { /* keep showing what we have */ });
    }, Math.max(1, CFG.refreshMinutes) * 60000);
  }

  if ("serviceWorker" in navigator && location.protocol !== "file:" && !Q.get("nosw")) {
    navigator.serviceWorker.register("sw.js").catch(function (e) { console.warn("sw", e); });
  }
  start();
})();
