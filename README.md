# Commandline

A [micro.blog](https://micro.blog) theme that presents your entire site as an
all-black interactive terminal. There's no nav bar — every page is reached by
typing a command at the prompt: `help`, `list`, `list <category>`, `archive`,
`next`, `open <n>`, `about`, `photos`, `search <query>`, `home`, `clear`.

## How it works

This is a plain Hugo theme (that's all a micro.blog custom theme is), plus one
JavaScript file (`static/js/terminal.js`) that turns typed commands into
in-page navigation:

- Every page embeds a small JSON "data island" (`<script id="sc-index">`)
  listing your recent posts — title, date, categories, summary, and any
  attached image URLs. That's what powers `list`, `list <category>`,
  `search`, and `photos`, entirely client-side, with zero extra network
  requests on first load.
- Individual posts and the About page are still real, normal Hugo pages
  (crawlable, bookmarkable, and fully readable with JavaScript off — see
  `layouts/_default/single.html` and `layouts/page/single.html`, which
  render a plain fallback that terminal.js hides once it boots). Navigating
  to one of them from the terminal does a single `fetch()` of that page's
  real HTML and renders it inline with `history.pushState`, instead of a
  full reload.
- `/archive/` is also real (crawlable, bookmarkable, readable with
  JavaScript off) but it isn't a normal content page — micro.blog generates
  it itself as an alternate output format of the home page, so the theme
  supplies `layouts/list.archivehtml.html` instead of a `content/` file
  (see `exampleSite/config.toml`'s `[outputFormats]`/`[outputs]`, added so
  `hugo server` reproduces that locally). It lists every post grouped by
  year with no pagination in the raw HTML. terminal.js re-renders the same
  posts from the `sc-index` data island already on the page — no extra
  fetch — grouped the same way and paginated at 10 per page with `next`,
  exactly like `list`.
- `list`, `search`, and `photos` are virtual views with no real page behind
  them — they're addressed with a URL hash (`#list/travel`, `#search/foo`,
  `#photos`) so they're still bookmarkable and refresh-safe.

## One convention to know about

The `about` command navigates to **`/about/`**. Make sure your About page's
path in micro.blog is set to that (it's the default for most micro.blog
blogs already). If you'd rather use a different path, change `ABOUT_PATH` at
the top of `static/js/terminal.js`.

Categories come from micro.blog's normal `categories` taxonomy — nothing to
configure.

## Previewing locally

```
brew install hugo   # if you don't have it
cd exampleSite
hugo server --themesDir ../.. --theme commandline -D
```

Then open `http://localhost:1313/`.

## Installing on micro.blog

1. Push this repo to GitHub.
2. In micro.blog: **Design → Edit Custom Themes → New Theme**, then import
   from your GitHub repo URL.
3. Make sure your About page exists at `/about/` (see above).
4. Select the theme for your blog and rebuild.

## Known tradeoffs

A command-line-only interface is a real accessibility and discoverability
cost — there's no visible menu, and it's less immediately obvious on mobile
or to non-technical visitors. Every result the terminal prints is clickable
(not just typeable) and a `type help` hint is always on screen, but there's
intentionally no button/menu chrome — that's the point of the theme.
