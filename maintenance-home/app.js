/* Per-home maintenance dashboard — shared app.
   A single home's slice of the Maintenance Department dashboard, read live from the
   same two public webhooks (maint-data + cert-data). Read-only, nothing is written back.

   Each home has its own page (maintenance-home/aurora/ etc.) that sets window.MH_HOME.
   The top maintenance-home/ page sets no home, so it shows a chooser. */
(function () {
  "use strict";

  var MAINT_URL = window.MH_MAINT_URL || "https://ruthbloch.app.n8n.cloud/webhook/maint-data";
  var CERT_URL  = window.MH_CERT_URL  || "https://ruthbloch.app.n8n.cloud/webhook/cert-data";
  var BASE = window.MH_BASE || "./";

  // The maintenance homes, in the department dashboard's order.
  var HOMES = ["Aurora", "Orion", "Cygnus", "Leo", "Lyra", "Lynx", "Vela House"];

  function baseName(h) { return String(h || "").trim().toLowerCase().replace(/\s*house$/, ""); }
  function normHome(h) {
    if (!h) return null;
    var b = baseName(h);
    for (var i = 0; i < HOMES.length; i++) if (baseName(HOMES[i]) === b) return HOMES[i];
    return null;
  }
  function slug(h) { return String(h).toLowerCase().replace(/\s+/g, "-"); }  // "Vela House" -> "vela-house"
  function homeUrl(h) { return BASE + slug(h) + "/"; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }

  var HOME = normHome(window.MH_HOME) ||
             normHome(new URLSearchParams(location.search).get("home"));  // old ?home= links still work

  /* ---- frequency grouping (same buckets as the department dashboard) ---- */
  function fgroup(f) {
    if (!f) return "Other"; f = f.toLowerCase();
    if (f.indexOf("month") >= 0) return "Monthly";
    if (f.indexOf("quarter") >= 0) return "Quarterly";
    if (f.indexOf("biannual") >= 0) return "Biannual";
    if (f.indexOf("annual") >= 0 || f.indexOf("year") >= 0) return "Annual";
    if (f.indexOf("season") >= 0) return "Seasonal";
    if (f.indexOf("week") >= 0) return "Weekly";
    if (f.indexOf("visit") >= 0) return "On Visit";
    return "Other";
  }
  var GROUP_ORDER = ["Monthly", "Quarterly", "Seasonal", "Annual", "Biannual", "Weekly", "On Visit", "Other"];

  /* ---- status pills ---- */
  function routinePill(x) {
    var d = x.daysLeft;
    if (x.state === "complete") return { t: "Complete", c: "complete" };
    if (x.state === "overdue") return { t: "Overdue " + Math.abs(d) + "d", c: "overdue" };
    if (x.state === "due-soon") return { t: (d <= 0 ? "Due today" : "Due in " + d + "d"), c: "due-soon" };
    if (x.state === "upcoming") return { t: "Due in " + d + "d", c: "upcoming" };
    if (x.state === "missing-report") return { t: "Report missing", c: "missing-report" };
    return { t: "Not scheduled", c: "unscheduled" };
  }
  function certPill(x) {
    var d = x.daysLeft;
    if (x.state === "overdue") return { t: "Overdue " + Math.abs(d) + "d", c: "overdue" };
    if (x.state === "due-soon") return { t: (d <= 0 ? "Due today" : "Due in " + d + "d"), c: "due-soon" };
    if (x.state === "ok") return { t: "In date", c: "complete" };
    return { t: "No date", c: "unscheduled" };
  }

  /* ---- emergencies: emergByHome uses short keys ("Vela" for "Vela House") ---- */
  function emergFor(map, home) {
    if (!map) return 0;
    if (map[home] != null) return map[home];
    var b = baseName(home);
    for (var k in map) if (baseName(k) === b) return map[k];
    return 0;
  }

  function el(id) { return document.getElementById(id); }
  function set(id, html) { var n = el(id); if (n) n.innerHTML = html; }

  /* ---- render a single home ---- */
  function renderHome(home, maint, cert) {
    var routine = (maint.routine || []).filter(function (x) { return normHome(x.home) === home; });
    var certs = (cert.certificates || []).filter(function (x) { return normHome(x.home) === home; });
    var emerg = emergFor(maint.emergByHome, home);
    var jobs = (maint.nr && maint.nr.byHome && (maint.nr.byHome[home] || emergFor(maint.nr.byHome, home))) || 0;

    var rBy = function (s) { return routine.filter(function (x) { return x.state === s; }).length; };
    var cBy = function (s) { return certs.filter(function (x) { return x.state === s; }).length; };
    var rOverdue = rBy("overdue"), rDue = rBy("due-soon") + rBy("missing-report"), rDone = rBy("complete");
    var cOverdue = cBy("overdue"), cDue = cBy("due-soon"), cOk = cBy("ok");

    /* KPI tiles */
    var kpis = [
      { n: emerg, l: "Emergencies logged", c: emerg ? "crit" : "ok" },
      { n: cOverdue, l: "Certificates overdue", c: cOverdue ? "crit" : "ok" },
      { n: cDue, l: "Certificates due soon", c: cDue ? "warn" : "" },
      { n: cOk, l: "Certificates in date", c: "ok" },
      { n: rOverdue, l: "Routine checks overdue", c: rOverdue ? "crit" : "ok" },
      { n: rDue, l: "Routine due soon", c: rDue ? "warn" : "" },
      { n: rDone, l: "Routine complete", c: rDone ? "ok" : "" },
      { n: jobs, l: "Non-routine jobs open", c: jobs ? "blue" : "" }
    ];
    var kpiHtml = kpis.map(function (k) {
      return '<div class="kpi ' + (k.c || "") + '"><div class="n">' + k.n + '</div><div class="l">' + k.l + '</div></div>';
    }).join("");

    /* Certificates table */
    var order = { overdue: 0, "due-soon": 1, ok: 2 };
    var certSorted = certs.slice().sort(function (a, b) {
      var oa = order[a.state] == null ? 3 : order[a.state], ob = order[b.state] == null ? 3 : order[b.state];
      if (oa !== ob) return oa - ob;
      return (a.daysLeft == null ? 1e9 : a.daysLeft) - (b.daysLeft == null ? 1e9 : b.daysLeft);
    });
    var certRows = certSorted.map(function (x) {
      var p = certPill(x);
      var name = x.url ? '<a class="nm" href="' + esc(x.url) + '" target="_blank" rel="noopener">' + esc(x.name || x.type) + "</a>"
                       : '<span class="nm">' + esc(x.name || x.type) + "</span>";
      return "<tr><td>" + name + '</td><td class="trade">' + esc(x.type || "") + '</td><td class="right"><span class="pill ' + p.c + '">' + esc(p.t) + "</span></td></tr>";
    }).join("");
    var certCard =
      '<div class="card"><h3>Certificates</h3><p class="cap">' +
      (certs.length ? (certs.length + " on file &middot; " + cOverdue + " overdue, " + cDue + " due soon, " + cOk + " in date") : "None on file for this home yet") +
      '</p>' +
      (certs.length
        ? '<table><thead><tr><th>Certificate</th><th>Type</th><th class="right">Status</th></tr></thead><tbody>' + certRows + "</tbody></table>"
        : '<div class="empty">No certificates are set up for ' + esc(home) + " in ClickUp yet.</div>") +
      "</div>";

    /* Routine checks, grouped by frequency */
    var byGroup = {};
    routine.forEach(function (x) { var g = fgroup(x.freq); (byGroup[g] = byGroup[g] || []).push(x); });
    var stateRank = { overdue: 0, "missing-report": 1, "due-soon": 2, upcoming: 3, unscheduled: 4, complete: 5 };
    var groupsPresent = GROUP_ORDER.filter(function (g) { return byGroup[g]; });
    var routineBody = groupsPresent.map(function (g) {
      var list = byGroup[g].slice().sort(function (a, b) { return (stateRank[a.state] == null ? 9 : stateRank[a.state]) - (stateRank[b.state] == null ? 9 : stateRank[b.state]); });
      var rows = list.map(function (x) {
        var p = routinePill(x);
        return '<div class="rcheck"><div class="rn">' + esc(x.name) + "</div>" +
               (x.type ? '<span class="rty">' + esc(x.type) + "</span>" : "") +
               '<span class="pill ' + p.c + '">' + esc(p.t) + "</span></div>";
      }).join("");
      return '<div class="freq-group"><h4>' + esc(g) + ' <span style="color:var(--faint);font-weight:600">(' + list.length + ")</span></h4>" + rows + "</div>";
    }).join("");
    var routineCard =
      '<div class="card"><h3>Routine checks</h3><p class="cap">' +
      (routine.length ? (routine.length + " checks &middot; " + rOverdue + " overdue, " + rDue + " due soon, " + rDone + " complete") : "Not set up for this home yet") +
      '</p>' +
      (routine.length ? routineBody : '<div class="empty">No routine checks are set up for ' + esc(home) + " in ClickUp yet. They will appear here once a schedule is added.</div>") +
      "</div>";

    /* Emergencies */
    var emergCard =
      '<div class="card"><h3>Emergencies</h3><p class="cap">Logged against this home in the Emergencies list</p>' +
      '<div class="big"><div class="num ' + (emerg ? "" : "zero") + '">' + emerg + '</div><div class="cap2">' +
      (emerg ? ("emergenc" + (emerg === 1 ? "y" : "ies") + " recorded for " + esc(home)) : "no emergencies recorded") +
      "</div></div></div>";

    var missing = [];
    if (!routine.length) missing.push("routine checks");
    if (!certs.length) missing.push("certificates");
    var noteHtml = missing.length
      ? '<div class="note warn"><span class="ic">&#9888;</span><div><b>' + esc(home) + " is partly set up.</b> No " + missing.join(" or ") +
        " are in ClickUp for this home yet, so those panels are empty. Emergencies and anything else already recorded still show.</div></div>"
      : '<div class="note"><span class="ic">&#10003;</span><div><b>Live.</b> Read straight from the Maintenance Department lists and the Property Certificates sandbox. Read-only, nothing is written back.</div></div>';

    var body =
      noteHtml +
      '<div class="sec"><div class="sec-h"><span class="bar"></span><span class="t">At a glance</span></div><div class="kpis">' + kpiHtml + "</div></div>" +
      '<div class="sec"><div class="sec-h"><span class="bar"></span><span class="t">Certificates &amp; compliance</span></div>' + certCard + "</div>" +
      '<div class="sec"><div class="sec-h"><span class="bar"></span><span class="t">Routine maintenance</span></div>' + routineCard + "</div>" +
      '<div class="sec"><div class="sec-h"><span class="bar"></span><span class="t">Safety</span></div>' + emergCard + "</div>" +
      '<p class="foot">Live from ClickUp &mdash; department lists via the <code>maint-data</code> API and property certificates via <code>cert-data</code>. This is ' + esc(home) +
      '&rsquo;s slice of the Maintenance Department dashboard. Refreshes on load and once a day; the Refresh button pulls the latest instantly.</p>';

    el("body").innerHTML = body;

    var d = new Date(maint.generated || Date.now());
    set("stamp", '<span class="dot"></span>live from ClickUp &middot; ' + d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }));
  }

  /* ---- chooser (no home set) ---- */
  function renderChooser(maint, cert) {
    var routine = maint.routine || [], certs = cert.certificates || [];
    var cards = HOMES.map(function (h) {
      var rc = routine.filter(function (x) { return normHome(x.home) === h; }).length;
      var cc = certs.filter(function (x) { return normHome(x.home) === h; }).length;
      var em = emergFor(maint.emergByHome, h);
      var bits = [];
      if (cc) bits.push(cc + " certs");
      if (rc) bits.push(rc + " checks");
      if (em) bits.push(em + " emerg");
      return '<a class="homebtn" href="' + esc(homeUrl(h)) + '">' + esc(h) + "<small>" + (bits.length ? bits.join(" &middot; ") : "not set up yet") + "</small></a>";
    }).join("");
    el("body").innerHTML =
      '<div class="note"><span class="ic">&#9432;</span><div>Open a home to see its maintenance picture, then use <b>Add to Home Screen</b> so the phone keeps it.</div></div>' +
      '<div class="sec"><div class="homes">' + cards + "</div></div>";
    var d = new Date(maint.generated || Date.now());
    set("stamp", '<span class="dot"></span>live from ClickUp &middot; ' + d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }));
  }

  /* ---- shell + load ---- */
  function shell() {
    var title = HOME ? esc(HOME) : "Maintenance by home";
    var sub = HOME ? "Maintenance overview &middot; live from ClickUp" : "Pick a home to see its maintenance picture";
    var allHomes = '<a class="allhomes" href="' + esc(BASE) + '../maintenance-dashboard/">All homes &rarr;</a>';
    document.getElementById("root").innerHTML =
      '<header class="hd"><div>' +
      '<p class="eyebrow">Heart &amp; Home Living &middot; Maintenance</p>' +
      "<h1>" + title + "</h1><p class=\"sub\">" + sub + "</p></div>" +
      '<div class="hd-right">' + (HOME ? allHomes : "") +
      '<button id="refreshBtn" class="refresh-btn" type="button">&#8635;&nbsp;Refresh</button>' +
      '<div class="stamp" id="stamp"><span class="dot"></span>loading&hellip;</div>' +
      "</div></header>" +
      '<div id="body"><div class="loading">Loading live data from ClickUp&hellip;</div></div>';

    var btn = document.getElementById("refreshBtn");
    if (btn) btn.addEventListener("click", function () {
      if (btn.disabled) return;
      btn.disabled = true; btn.textContent = "Refreshing…";
      load().then(function () { btn.disabled = false; btn.innerHTML = "&#10003;&nbsp;Refreshed"; })
            .catch(function () { btn.disabled = false; btn.innerHTML = "Refresh failed"; });
    });
  }

  function fail(msg) {
    set("stamp", '<span class="dot off"></span>offline');
    set("body", '<div class="note warn"><span class="ic">&#9888;</span><div><b>Could not load live data.</b> ' + esc(msg) +
      ". This page reads the maint-data and cert-data webhooks; check they are active in n8n.</div></div>");
  }

  function load() {
    return Promise.all([
      fetch(MAINT_URL, { cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error("maint-data " + r.status); return r.json(); }),
      fetch(CERT_URL, { cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error("cert-data " + r.status); return r.json(); })
    ]).then(function (res) {
      try { HOME ? renderHome(HOME, res[0], res[1]) : renderChooser(res[0], res[1]); }
      catch (e) { fail(e && e.message ? e.message : "render error"); }
    }).catch(function (e) { fail(e && e.message ? e.message : "network error"); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
  function start() { shell(); load(); setInterval(load, 86400000); }
})();
