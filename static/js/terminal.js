(function () {
  "use strict";

  var PAGE_SIZE = 10;
  var ABOUT_PATH = "/about/"; // convention: create your About page at this path
  var ARCHIVE_PATH = "/archive/"; // micro.blog's own route; see layouts/list.archivehtml.html

  // Easter eggs: typing the full phrase triggers a response. "quotes" eggs cycle through
  // one quote at a time (shuffled); "fixed" eggs always print the same line; "sequence"
  // eggs run bespoke scripted output (see runRebootSequence).
  var EASTER_EGGS = {
    "global thermonuclear war": {
      type: "quotes",
      key: "wargames",
      quotes: [
        "Greetings, Professor Falken.",
        "Shall we play a game?",
        "Love to. How about Global Thermonuclear War?",
        "Wouldn't you prefer a good game of chess?",
        "A strange game. The only winning move is not to play.",
        "How about a nice game of chess?",
        "What is the primary goal?",
        "You should know, Professor. You programmed me.",
        "Is this a game, or is it real?",
        "Shall we play a game of chess instead?",
      ],
    },
    "hack the planet": {
      type: "quotes",
      key: "hackers",
      quotes: [
        "Hack the planet!",
        "Mess with the best, die like the rest.",
        "There's no right and wrong. There's only fun and boring.",
        "This is our world now — the world of the electron and the switch.",
        "God, I love this system!",
        "RISC architecture is gonna change everything.",
        "Never send a boy to do a woman's job.",
        "You're in a database, stupid!",
        "My Nikes are untied!",
        "Welcome to the world of hurt, Zero Cool.",
      ],
    },
    "swordfish": {
      type: "fixed",
      line: "Really? That movie sucked.",
    },
    "reboot park systems": {
      type: "sequence",
    },
  };

  var output = document.getElementById("term-output");
  var input = document.getElementById("term-input");
  var fallback = document.getElementById("content-fallback");

  var indexData = { site: document.title, posts: [] };
  var indexScript = document.getElementById("sc-index");
  if (indexScript) {
    try {
      indexData = JSON.parse(indexScript.textContent);
    } catch (e) {
      /* leave indexData empty; list/search/photos will just report no results */
    }
  }

  var state = {
    query: null, // { items: [...], offset: 0, kind: 'list'|'search'|'photos'|'archive' }
    lastRendered: [], // the slice of items currently on screen, for `open N`
    history: [],
    historyPos: 0,
    eggQueues: {}, // egg key -> shuffled quotes not yet shown this cycle
  };

  var pageCache = new Map(); // url -> parsed page data

  // ---------- small DOM helpers ----------

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === "text") node.textContent = attrs[k];
        else if (k === "html") node.innerHTML = attrs[k];
        else node.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) {
      node.appendChild(c);
    });
    return node;
  }

  function addLine(node, className) {
    var line = el("div", { class: "line" + (className ? " " + className : "") });
    if (typeof node === "string") line.textContent = node;
    else line.appendChild(node);
    output.appendChild(line);
    scrollToBottom();
    return line;
  }

  function addGap() {
    output.appendChild(el("div", { class: "line gap" }));
  }

  function scrollToBottom() {
    window.scrollTo(0, document.body.scrollHeight);
  }

  function link(text, href, onClick) {
    var a = el("a", { href: href, text: text });
    a.addEventListener("click", function (ev) {
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button === 1) return; // let it open normally
      ev.preventDefault();
      onClick();
    });
    return a;
  }

  // ---------- boot ----------

  function boot() {
    document.body.addEventListener("click", function () {
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed) input.focus();
    });
    input.addEventListener("keydown", onKeyDown);

    window.addEventListener("popstate", function () {
      route(location.pathname, location.hash, false);
    });

    var kind = fallback.dataset.kind;
    printBanner();

    if (location.pathname === ARCHIVE_PATH) {
      // /archive/ is still Kind "home" under the hood (see layouts/list.archivehtml.html) —
      // check the real path first so it doesn't fall into the plain "home" branch below.
      addGap();
      cmdArchive(false);
    } else if (kind === "home") {
      if (location.hash) {
        route(location.pathname, location.hash, false);
      } else {
        addGap();
        addLine("Type " + strong("help") + " for a list of commands.");
      }
    } else {
      // Landed directly on a real content page (a post, or /about/) — show it inline.
      var data = extractPageData(fallback, location.pathname);
      pageCache.set(location.pathname, data);
      addGap();
      renderPost(data);
    }

    input.focus();
  }

  function strong(text) {
    return text; // plain terminal text; kept as a function in case of future styling
  }

  function printBanner() {
    addLine("Welcome to " + indexData.site + ".", "banner");
  }

  // ---------- input handling ----------

  function onKeyDown(ev) {
    if (ev.key === "Enter") {
      var raw = input.value;
      input.value = "";
      if (raw.trim() !== "") {
        state.history.push(raw);
      }
      state.historyPos = state.history.length;
      addGap();
      addLine(raw, "cmd-echo");
      runCommand(raw);
    } else if (ev.key === "ArrowUp") {
      if (state.history.length) {
        state.historyPos = Math.max(0, state.historyPos - 1);
        input.value = state.history[state.historyPos] || "";
        moveCaretToEnd();
      }
      ev.preventDefault();
    } else if (ev.key === "ArrowDown") {
      if (state.history.length) {
        state.historyPos = Math.min(state.history.length, state.historyPos + 1);
        input.value = state.history[state.historyPos] || "";
        moveCaretToEnd();
      }
      ev.preventDefault();
    }
  }

  function moveCaretToEnd() {
    var v = input.value;
    input.value = "";
    input.value = v;
  }

  // ---------- command parsing ----------

  function runCommand(raw) {
    var trimmed = raw.trim();
    if (trimmed === "") return;

    var egg = EASTER_EGGS[trimmed.toLowerCase()];
    if (egg) {
      triggerEasterEgg(egg);
      return;
    }

    var spaceIdx = trimmed.indexOf(" ");
    var cmd = (spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx)).toLowerCase();
    var rest = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1).trim();

    switch (cmd) {
      case "help":
        printHelp();
        break;
      case "list":
        cmdList(rest);
        break;
      case "archive":
        cmdArchive();
        break;
      case "next":
        cmdNext();
        break;
      case "open":
        cmdOpen(rest);
        break;
      case "about":
        cmdAbout();
        break;
      case "photos":
        cmdPhotos();
        break;
      case "search":
        cmdSearch(rest);
        break;
      case "home":
        cmdHome();
        break;
      case "clear":
        cmdClear();
        break;
      default:
        addLine('Unknown command "' + cmd + '". Type help for a list of commands.', "error");
    }
  }

  function triggerEasterEgg(egg) {
    if (egg.type === "fixed") {
      addLine(egg.line, "egg");
    } else if (egg.type === "sequence") {
      runRebootSequence();
    } else {
      addLine('"' + nextEggQuote(egg) + '"', "egg");
    }
  }

  function runRebootSequence() {
    var line = addLine("Hold on to your butts", "egg");
    var cursor = el("span", { class: "blink-cursor", text: "█" });
    line.appendChild(cursor);
    scrollToBottom();
    setTimeout(function () {
      cursor.remove();
      addLine("\"Ah Ah Ah, you didn't say the magic word.\"", "egg");
    }, 1500);
  }

  function nextEggQuote(egg) {
    var queue = state.eggQueues[egg.key];
    if (!queue || !queue.length) {
      queue = shuffled(egg.quotes);
      state.eggQueues[egg.key] = queue;
    }
    return queue.shift();
  }

  function shuffled(arr) {
    var copy = arr.slice();
    for (var i = copy.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  function printHelp() {
    addLine("Available commands:");
    [
      ["help", "show this list"],
      ["list", "show the last 10 posts"],
      ["list <category>", "show the last 10 posts in a category"],
      ["archive", "browse all posts by year, 10 per page"],
      ["next", "show the next 10 results"],
      ["open <n>", "open item n from the results above"],
      ["about", "go to the about page"],
      ["photos", "browse photos by filename"],
      ["search <query>", "search posts"],
      ["home", "return to the welcome screen"],
      ["clear", "clear the screen"],
    ].forEach(function (pair) {
      addLine("  " + pair[0].padEnd(20, " ") + pair[1], "dim");
    });
  }

  // ---------- list / search / photos ----------

  function cmdList(category, pushHistory) {
    var items = indexData.posts;
    var label;
    if (category) {
      var needle = category.toLowerCase();
      items = items.filter(function (p) {
        return (p.categories || []).some(function (c) {
          return c.toLowerCase() === needle;
        });
      });
      label = 'posts in "' + category + '"';
    } else {
      label = "posts";
    }

    if (!items.length) {
      addLine("No " + label + " found.", "dim");
      return;
    }

    if (pushHistory !== false) {
      pushVirtualRoute(category ? "#list/" + encodeURIComponent(category) : "#list");
    }
    state.query = { items: items, offset: 0, kind: "list" };
    renderResultsPage();
  }

  function cmdSearch(query, pushHistory) {
    if (!query) {
      addLine("Usage: search <query>", "error");
      return;
    }
    var needle = query.toLowerCase();
    var items = indexData.posts.filter(function (p) {
      return (
        p.title.toLowerCase().indexOf(needle) !== -1 ||
        (p.summary || "").toLowerCase().indexOf(needle) !== -1
      );
    });

    if (!items.length) {
      addLine('No results for "' + query + '".', "dim");
      return;
    }

    if (pushHistory !== false) pushVirtualRoute("#search/" + encodeURIComponent(query));
    state.query = { items: items, offset: 0, kind: "search" };
    renderResultsPage();
  }

  function cmdPhotos(pushHistory) {
    var photos = [];
    indexData.posts.forEach(function (p) {
      (p.images || []).forEach(function (imgUrl) {
        photos.push({
          filename: filenameFromUrl(imgUrl),
          url: p.url,
          title: p.title,
          date: p.date,
        });
      });
    });

    if (!photos.length) {
      addLine("No photos found.", "dim");
      return;
    }

    if (pushHistory !== false) pushVirtualRoute("#photos");
    state.query = { items: photos, offset: 0, kind: "photos" };
    renderResultsPage();
  }

  function filenameFromUrl(u) {
    var clean = u.split("?")[0].split("#")[0];
    var parts = clean.split("/");
    return parts[parts.length - 1] || clean;
  }

  // ---------- archive (real /archive/ page, all posts grouped by year) ----------

  function cmdArchive(pushHistory) {
    var items = indexData.posts;
    if (!items.length) {
      addLine("No posts yet.", "dim");
      return;
    }
    if (pushHistory !== false) history.pushState(null, "", ARCHIVE_PATH);
    addLine("Archive:", "banner");
    state.query = { items: items, offset: 0, kind: "archive" };
    renderResultsPage();
  }

  function cmdNext() {
    if (!state.query) {
      addLine("Nothing to page through yet. Try list or search first.", "dim");
      return;
    }
    var q = state.query;
    if (q.offset + PAGE_SIZE >= q.items.length) {
      addLine("No more results.", "dim");
      return;
    }
    q.offset += PAGE_SIZE;
    renderResultsPage();
  }

  function renderResultsPage() {
    var q = state.query;
    var slice = q.items.slice(q.offset, q.offset + PAGE_SIZE);
    state.lastRendered = slice;
    var lastYear = null;

    slice.forEach(function (item, i) {
      var n = i + 1;
      if (q.kind === "archive") {
        var year = item.date.slice(0, 4);
        if (year !== lastYear) {
          addLine(year + ":");
          lastYear = year;
        }
      }
      var lineEl = el("span", {});
      var label =
        q.kind === "photos"
          ? item.filename
          : item.title + (item.date ? "  (" + item.date + ")" : "");
      lineEl.appendChild(document.createTextNode("  " + n + "  "));
      lineEl.appendChild(link(label, item.url, makeOpener(item)));
      addLine(lineEl);
    });

    if (q.offset + PAGE_SIZE < q.items.length) {
      addLine("Type next for more, or open <n> to view one.", "dim");
    } else {
      addLine("Type open <n> to view one.", "dim");
    }
  }

  function makeOpener(item) {
    return function () {
      navigateToPath(item.url);
    };
  }

  function cmdOpen(arg) {
    var n = parseInt(arg, 10);
    if (!arg || isNaN(n) || n < 1 || n > state.lastRendered.length) {
      addLine("Usage: open <n> — pick a number from the last list shown.", "error");
      return;
    }
    navigateToPath(state.lastRendered[n - 1].url);
  }

  // ---------- navigation ----------

  function cmdAbout() {
    navigateToPath(ABOUT_PATH);
  }

  function cmdHome() {
    history.pushState(null, "", "/");
    printBanner();
    addLine("Type help for a list of commands.", "dim");
  }

  function cmdClear() {
    output.innerHTML = "";
    printBanner();
    addLine("Nothing here.");
    addGap();
    addLine("Type home to return, or help for commands.", "dim");
  }

  function pushVirtualRoute(hash) {
    var base = location.pathname === "/" ? "/" : location.pathname;
    history.pushState(null, "", base + hash);
  }

  function navigateToPath(path, pushHistory) {
    var doPush = pushHistory !== false;

    if (pageCache.has(path)) {
      if (doPush) history.pushState(null, "", path);
      renderPost(pageCache.get(path));
      return;
    }

    addLine("Loading " + path + " ...", "dim");
    fetch(path)
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.text();
      })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, "text/html");
        var remoteFallback = doc.getElementById("content-fallback");
        if (!remoteFallback) throw new Error("no content found");
        var data = extractPageData(remoteFallback, path);
        pageCache.set(path, data);
        if (doPush) history.pushState(null, "", path);
        renderPost(data);
      })
      .catch(function (err) {
        addLine("Could not load " + path + " (" + err.message + ").", "error");
      });
  }

  function extractPageData(root, path) {
    var titleEl = root.querySelector(".term-post-title");
    var dateEl = root.querySelector(".term-post-date");
    var catEls = root.querySelectorAll(".term-post-categories li");
    var contentEl = root.querySelector(".term-post-content");
    return {
      path: path,
      title: titleEl ? titleEl.textContent : "",
      date: dateEl ? dateEl.getAttribute("datetime") : "",
      categories: Array.prototype.map.call(catEls, function (li) {
        return li.textContent;
      }),
      contentHtml: contentEl ? contentEl.innerHTML : "<p><em>Nothing here.</em></p>",
    };
  }

  function renderPost(data) {
    if (data.title) addLine(data.title, "banner");
    if (data.date) addLine(data.date.slice(0, 10), "dim");
    if (data.categories && data.categories.length) {
      addLine(data.categories.join(", "), "dim");
    }
    var content = el("div", { html: data.contentHtml, class: "term-post-content" });
    output.appendChild(content);
    scrollToBottom();
    addGap();
    addLine("Type home to return, or help for commands.", "dim");
  }

  // ---------- routing (initial load + back/forward) ----------

  function route(pathname, hash, pushHistory) {
    if (hash && hash.indexOf("#photos") === 0) {
      cmdPhotos(pushHistory);
      return;
    }
    if (hash && hash.indexOf("#search/") === 0) {
      cmdSearch(decodeURIComponent(hash.slice("#search/".length)), pushHistory);
      return;
    }
    if (hash === "#list") {
      cmdList("", pushHistory);
      return;
    }
    if (hash && hash.indexOf("#list/") === 0) {
      cmdList(decodeURIComponent(hash.slice("#list/".length)), pushHistory);
      return;
    }
    if (pathname === ARCHIVE_PATH) {
      cmdArchive(pushHistory);
      return;
    }
    if (pathname && pathname !== "/") {
      navigateToPath(pathname, pushHistory);
      return;
    }
    printBanner();
    addLine("Type help for a list of commands.", "dim");
  }

  boot();
})();
