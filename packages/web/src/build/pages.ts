import { Marked, Renderer, type Tokens } from "marked";
import { FILTER_LAYERS, LAYER_LABEL, RULE_LAYERS, boxLabel, type RuleLayer } from "../layers.js";

export const SITE = "https://pbiplint.com";

export const NAV = [
  { href: "/", label: "Έλεγχος" },
  { href: "/rules/", label: "Κανόνες" },
  { href: "/privacy/", label: "Ασφάλεια" },
  { href: "/about/", label: "Σχετικά" },
] as const;

/**
 * The sections of the rules index, in order. Core has the same list, but importing it would make
 * this build depend on core's dist, so the copy is deliberate and a test holds the two together.
 */
export const CATEGORY_ORDER = [
  "Performance",
  "Error Prevention",
  "Accessibility",
  "DAX Expressions",
  "Maintenance",
  "Report Design",
  "Formatting",
  "Naming Conventions",
];
const STATUS_LABEL: Record<string, string> = {
  ported: "ported",
  needsLiveModel: "needs a live model",
  builtin: "built in",
};
/** Known source URLs and how the attribution line names them. A URL this map does not name is left out of the attribution line. */
const SOURCE_NAMES: Record<string, string> = {
  "https://github.com/microsoft/Analysis-Services/blob/master/BestPracticeRules/BPARules.json":
    "Microsoft's Best Practice Analyzer ruleset",
  "https://github.com/NatVanG/fab-inspector/blob/main/Rules/Base-rules.json":
    "PBI Inspector's base rules by Nat Van Gulck",
};
/** What the rule page's button offers to check, by the layer the rule reads. */
const CHECK_LABEL: Record<RuleLayer, string> = {
  model: "Check a model for this",
  report: "Check a report for this",
  project: "Check a project for this",
  // A Power Query rule reads the M in a model's files, so the button takes a model.
  powerquery: "Check a model for this",
};
/** The caption a fenced example carries, by the word after `tmdl` or `pbir` in its info string. */
const EXAMPLE_CAPTION: Record<string, string> = {
  fires: "Fires the rule",
  fixed: "After the fix",
};
/**
 * The info string of the fence that holds the config, on a page whose example runs under one.
 * It renders as a figure captioned with the file name, and is neither an example that fires nor
 * one that is fixed.
 */
const CONFIG_FENCE = "json pbiplint.config.json";

export const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * What a link that opens in a new tab adds to its accessible name, hidden from the eye, since the
 * stylesheet's arrow says the same thing on screen (WCAG 3.2.5). The results page writes the same
 * words; the copy is deliberate for the reason CATEGORY_ORDER gives, and a test holds the two equal.
 */
export const NEW_TAB_NOTE = " (opens in a new tab)";

/** Whether a link leaves the site: an absolute http or https URL, rather than a path or an anchor. */
const leavesSite = (href: string): boolean => /^https?:\/\//i.test(href);

/**
 * A link that leaves the site, which opens in a new tab so a reader partway through a page keeps
 * their place. `rel` keeps the new page from reaching back into this one through `window.opener`
 * and keeps this page's address out of the request. `label` is HTML.
 */
export const external = (href: string, label: string): string =>
  `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${label}<span class="visually-hidden">${NEW_TAB_NOTE}</span></a>`;

const str = (v: string | string[] | undefined): string =>
  Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
const list = (v: string | string[] | undefined): string[] => (Array.isArray(v) ? v : v ? [v] : []);

// eslint-disable-next-line no-control-regex -- matching control characters is the whole point
export const CONTROL_CHARACTER = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

const characterReferences = (s: string): string =>
  s.replace(CONTROL_CHARACTER, (c) => `&#${c.charCodeAt(0)};`);

const escapeCode = (s: string): string => characterReferences(escapeHtml(s).replace(/'/g, "&#39;"));

/** Report objects whose page.json or visual.json carries an `annotations` array an ignore can go in. */
const REPORT_ANNOTATED = new Set(["Page", "Visual"]);
/** The other report objects: a rule scoped to these alone is turned off for the project instead. */
const REPORT_ONLY = new Set(["Report", "Bookmark", "ReportMeasure"]);

export function ignoreHelp(ruleId: string, scope: readonly string[] = []): string {
  const project = `To turn the rule off for a whole project, set \`"${ruleId}": "off"\` under \`rules\` in \`pbiplint.config.json\`.`;
  if (scope.length > 0 && scope.every((s) => s === "File"))
    return `This rule reports on files, so there is no object to annotate. ${project}`;
  if (scope.length > 0 && scope.every((s) => s === "ReportMeasure"))
    return `This rule reports on measures defined in the report, and pbiplint reads no annotation on them, so there is no object to annotate. ${project}`;
  if (scope.length > 0 && scope.every((s) => s === "Bookmark"))
    return `This rule reports on bookmarks, and a bookmark's file has no place for an annotation, so there is no object to annotate. ${project}`;
  const reportScoped =
    scope.length > 0 && scope.every((s) => REPORT_ANNOTATED.has(s) || REPORT_ONLY.has(s));
  const page = scope.includes("Page");
  const visual = scope.includes("Visual");
  if (reportScoped && (page || visual)) {
    const [object, file] =
      page && visual
        ? ["page or visual", "page.json or visual.json"]
        : page
          ? ["page", "page.json"]
          : ["visual", "visual.json"];
    return (
      `To ignore this rule on one ${object}, add \`{ "name": "pbiplint.ignore", "value": "${ruleId}" }\` to the ` +
      `\`annotations\` array of its ${file}. Power BI Desktop keeps the annotation. ${project}`
    );
  }
  if (reportScoped)
    return `This rule reports on the report itself, so there is no object to annotate. ${project}`;
  return (
    `To ignore this rule on one object, add \`annotation pbiplint.ignore = ${ruleId}\` under ` +
    `the object in its TMDL file. Power BI Desktop keeps the annotation. ${project}`
  );
}

/** The body with the ignore mechanics as the last paragraph of "When to ignore it", when the page has that section. */
export function withIgnoreHelp(body: string, ruleId: string, scope: readonly string[]): string {
  const heading = /^## When to ignore it[ \t]*$/m.exec(body);
  if (!heading) return body;
  const after = heading.index + heading[0].length;
  const next = /^## /m.exec(body.slice(after));
  const end = next ? after + next.index - 1 : body.length;
  return `${body.slice(0, end).trimEnd()}\n\n${ignoreHelp(ruleId, scope)}\n${body.slice(end)}`;
}

/** Rule id to page slug; a code span that names a rule in this map links to its page. */
export type RuleLinks = ReadonlyMap<string, string>;

/** The link table for a set of pages, read from their frontmatter before any page is rendered. */
export function ruleLinks(pages: { slug: string; markdown: string }[]): RuleLinks {
  return new Map(
    pages.map(({ slug, markdown }) => [
      str(parseFrontmatter(markdown, `rules/${slug}.md`).data.id),
      slug,
    ]),
  );
}

export function attribution(sources: string[]): string {
  const links = sources
    .filter((url) => SOURCE_NAMES[url] !== undefined)
    .map((url) => external(url, escapeHtml(SOURCE_NAMES[url]!)));
  if (links.length === 0) return "";
  return `<p class="sources">Ported from ${links.join(" and ")}.</p>\n`;
}

export type Frontmatter = Record<string, string | string[]>;

const unquote = (value: string): string => {
  const quoted = /^"(.*)"$/.exec(value);
  return quoted ? quoted[1]!.replace(/\\(["\\])/g, "$1") : value;
};

export function parseFrontmatter(
  text: string,
  source: string,
): { data: Frontmatter; body: string } {
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (!m) throw new Error(`${source}: no frontmatter (the page must open with a --- block)`);
  const data: Frontmatter = {};
  let items: string[] | null = null;
  for (const line of m[1]!.split("\n")) {
    const item = /^\s+- (.*)$/.exec(line);
    if (item && items) {
      items.push(item[1]!.trim());
      continue;
    }
    if (line.trim() === "") continue;
    const kv = /^([A-Za-z_]+):\s*(.*)$/.exec(line);
    if (!kv)
      throw new Error(
        `${source}: cannot read frontmatter line ${JSON.stringify(line)} ` +
          "(expected `key: value` or an indented `- item`)",
      );
    const key = kv[1]!;
    const value = kv[2]!.trim();
    items = null;
    if (value === "") {
      items = [];
      data[key] = items;
    } else if (value.startsWith("[") && value.endsWith("]")) {
      data[key] = value
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else {
      data[key] = unquote(value);
    }
  }
  return { data, body: m[2]! };
}

export type SiteLayer = "model" | "report";
export type { RuleLayer };

export const SITE_LAYERS: readonly SiteLayer[] = ["model", "report"];

export const showsLayers = (published: readonly SiteLayer[] = SITE_LAYERS): boolean =>
  new Set(published).size > 1;

export function pageLayer(data: Frontmatter, source: string): RuleLayer {
  if (data.layer === undefined) return "model";
  const value = str(data.layer);
  const layer = RULE_LAYERS.find((l) => l === value);
  if (!layer)
    throw new Error(
      `${source}: unknown layer ${JSON.stringify(value)} ` +
        `(expected one of ${RULE_LAYERS.join(", ")}, or no layer key at all)`,
    );
  return layer;
}

export const publishesLayer = (
  layer: RuleLayer,
  published: readonly SiteLayer[] = SITE_LAYERS,
): boolean =>
  layer === "project"
    ? published.length > 0
    : layer === "powerquery"
      ? published.includes("model")
      : published.includes(layer);

const section = (body: string, heading: string): string =>
  body.split(`## ${heading}`)[1]?.split(/\n## /)[0] ?? "";
const firstParagraph = (s: string): string =>
  s
    .trim()
    .split(/\n\s*\n/)[0]
    ?.replace(/\s+/g, " ")
    .trim() ?? "";
const plainText = (markdown: string): string =>
  markdown.replace(/`+/g, "").replace(/\s+/g, " ").trim();

export const headingId = (text: string): string =>
  plainText(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N} -]/gu, "")
    .trim()
    .replace(/\s+/g, "-");

const plainPre = (n: number): string =>
  `<pre tabindex="0" role="region" aria-label="Code block ${n}">`;
const figurePre = (id: string): string =>
  `<pre tabindex="0" role="region" aria-labelledby="${id}">`;
const captionId = (n: number): string => `code_${n}`;
const plainFence = new Renderer();

function siteMarkdown(links: RuleLinks = new Map(), self = ""): Marked {
  let figures = 0;
  let plainBlocks = 0;
  return new Marked({
    hooks: {
      preprocess(markdown: string): string {
        figures = 0;
        plainBlocks = 0;
        return markdown;
      },
    },
    renderer: {
      heading({ tokens, depth, text }: Tokens.Heading): string {
        return `<h${depth} id="${headingId(text)}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
      },
      code(token: Tokens.Code): string {
        const { text, lang, escaped } = token;
        const code = (escaped ? characterReferences(text) : escapeCode(text)).replace(/\n$/, "");
        const figure = (classes: string, caption: string, language: string): string => {
          const id = captionId(++figures);
          return `<figure class="${classes}">\n<figcaption id="${id}">${caption}</figcaption>\n${figurePre(id)}<code class="language-${language}">${code}\n</code></pre>\n</figure>\n`;
        };
        if (lang === CONFIG_FENCE)
          return figure("example", "<code>pbiplint.config.json</code>", "json");
        const example = /^(tmdl|pbir) (fires|fixed)(?: (\S+))?$/.exec(lang ?? "");
        if (!example)
          return characterReferences(plainFence.code(token)).replace(
            /^<pre>/,
            plainPre(++plainBlocks),
          );
        const language = example[1] === "pbir" ? "json" : "tmdl";
        const kind = example[2]!;
        const file = example[3];
        const caption =
          file !== undefined && file !== "tree.json"
            ? `${EXAMPLE_CAPTION[kind]} in <code>${escapeHtml(file)}</code>`
            : EXAMPLE_CAPTION[kind]!;
        return figure(`example ${kind}`, caption, language);
      },
      codespan({ text }: Tokens.Codespan): string {
        const flags = escapeCode(text).replace(/(^|\s)(-\S+)/g, '$1<span class="flag">$2</span>');
        const code = `<code>${flags}</code>`;
        const slug = links.get(text);
        if (slug === undefined || text === self) return code;
        return `<a href="/rules/${escapeHtml(slug)}/">${code}</a>`;
      },
      link({ href, text, tokens, autolink }: Tokens.Link): string | false {
        if (!leavesSite(href)) return false;
        return external(href, autolink ? escapeHtml(text) : this.parser.parseInline(tokens));
      },
    },
  });
}
const md = siteMarkdown();
const render = (markdown: string, links?: RuleLinks, self?: string): string =>
  (links ? siteMarkdown(links, self) : md).parse(markdown, { async: false }) as string;
const renderInline = (markdown: string): string =>
  plainText(md.parseInline(markdown, { async: false }) as string);

function header(path: string): string {
  const current = (href: string): boolean =>
    href === path || (href !== "/" && !href.startsWith("http") && path.startsWith(href));
  const links = NAV.map((n) =>
    leavesSite(n.href)
      ? external(n.href, n.label)
      : `<a href="${n.href}"${current(n.href) ? ' aria-current="page"' : ""}>${n.label}</a>`,
  ).join("");
  return `<header class="site-header">
      <div class="container">
        <a class="brand" href="/"><img src="/favicon.svg" alt="" width="28" height="28" /> Data Tutor · Power BI Checker</a>
        <nav class="nav-row" aria-label="Site">${links}</nav>
        <details class="nav-menu">
          <summary aria-label="Menu"><span class="nav-menu-icon" aria-hidden="true"></span></summary>
          <nav class="nav-panel" aria-label="Site">${links}</nav>
        </details>
      </div>
    </header>`;
}

export const VERSION_MARKER = "<!-- pbiplint-version -->";

export const THEME_HELP_ID = "light-and-dark";
export const THEME_HELP_PATH = `/about/#${THEME_HELP_ID}`;

const FOOTER = `<footer class="site-footer">
      <div class="container">
        <p>100% Ιδιωτικό — κανένα αρχείο δεν φεύγει από τον browser σας: <a href="/privacy/">Πολιτική Ασφαλείας</a>.</p>
        <p>Φωτεινό ή σκοτεινό θέμα ανάλογα με τις ρυθμίσεις της συσκευής σας: <a href="${THEME_HELP_PATH}">πώς να το αλλάξετε</a>.</p>
        <p>
          Εκπαιδευτικό εργαλείο από την <strong>Data Tutor</strong> · Βασισμένο στον open-source
          κώδικα ${external("https://github.com/pbiplint/pbiplint", "pbiplint")} (άδεια AGPL-3.0 ·
          ${external("[YOUR_GITHUB_REPO_URL]", "πηγαίος κώδικας")}).
        </p>
        ${VERSION_MARKER}
      </div>
    </footer>`;

export interface PageOptions {
  title: string;
  description: string;
  path: string;
  main: string;
  scripts?: string[];
}

export function page({ title, description, path, main, scripts = [] }: PageOptions): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="canonical" href="${SITE}${escapeHtml(path)}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="/src/styles.css" />
  </head>
  <body>
    ${header(path)}
    <main class="container">
${main}
    </main>
    ${FOOTER}
    <script type="module" src="/src/nav.ts"></script>${scripts.map((s) => `\n    <script type="module" src="${escapeHtml(s)}"></script>`).join("")}
  </body>
</html>
`;
}

export interface RuleMeta {
  slug: string;
  id: string;
  title: string;
  category: string;
  severity: string;
  status: string;
  layer: RuleLayer;
  summary: string;
}

export function rulePage(
  markdown: string,
  slug: string,
  links: RuleLinks = new Map(),
  published: readonly SiteLayer[] = SITE_LAYERS,
): { html: string; meta: RuleMeta } {
  const source = `rules/${slug}.md`;
  const { data, body } = parseFrontmatter(markdown, source);
  const title = /^# (.+)$/m.exec(body)?.[1] ?? str(data.name);
  const meta: RuleMeta = {
    slug,
    id: str(data.id),
    title,
    category: str(data.category),
    severity: str(data.severity),
    status: str(data.status),
    layer: pageLayer(data, source),
    summary: firstParagraph(section(body, "What it checks")),
  };
  const layerItem = showsLayers(published) ? ` · ${escapeHtml(LAYER_LABEL[meta.layer])} layer` : "";
  const video = str(data.video);
  const main = `<article class="rule">
  <p class="eyebrow"><a href="/rules/">Rules</a> / ${escapeHtml(meta.category)}</p>
  <h1>${escapeHtml(title)}</h1>
  <p class="meta"><span class="badge ${escapeHtml(meta.severity)}">${escapeHtml(meta.severity)}</span> <code>${escapeHtml(meta.id)}</code> · ${escapeHtml(STATUS_LABEL[meta.status] ?? meta.status)}${layerItem} · scope: ${escapeHtml(list(data.scope).join(", "))}</p>
  ${video ? `<p class="video">${external(video, "Watch the video for this rule")}</p>` : ""}
  ${render(withIgnoreHelp(body.replace(/^# .+\n/m, ""), meta.id, list(data.scope)), links, meta.id)}
  ${attribution(list(data.sources))}<p class="cta"><a class="button" href="/">${CHECK_LABEL[meta.layer]}</a> ${external(`https://github.com/pbiplint/pbiplint/edit/main/rules/${slug}.md`, "Improve this page")}</p>
</article>`;
  return {
    html: page({
      title: `${title} · Data Tutor PBIP Linter`,
      description: plainText(meta.summary),
      path: `/rules/${slug}/`,
      main,
    }),
    meta,
  };
}

export function rulesIndex(
  metas: RuleMeta[],
  published: readonly SiteLayer[] = SITE_LAYERS,
): string {
  for (const m of metas)
    if (!CATEGORY_ORDER.includes(m.category))
      throw new Error(
        `${m.slug}: unknown category "${m.category}" (add it to CATEGORY_ORDER in packages/web/src/build/pages.ts)`,
      );
  const is =
    (status: string, ...layers: RuleLayer[]) =>
    (m: RuleMeta): boolean =>
      m.status === status && (layers.length === 0 || layers.includes(m.layer));
  const clauses: [(m: RuleMeta) => boolean, string][] = [
    [
      is("ported", "model", "powerquery"),
      "rules ported from Microsoft's Best Practice Analyzer ruleset and verified against Tabular Editor",
    ],
    [is("needsLiveModel"), "listed but not run because they need statistics only a live model has"],
    [
      is("ported", "report"),
      "report rules ported from PBI Inspector's base rules by Nat Van Gulck",
    ],
    [is("builtin"), "built into the linter"],
  ];
  for (const m of metas)
    if (!clauses.some(([counts]) => counts(m)))
      throw new Error(
        `${m.slug}: status "${m.status}" on the ${m.layer} layer is in no clause of the rules count (add a clause for it in rulesIndex in packages/web/src/build/pages.ts)`,
      );
  const counted = clauses.map(([counts, text]) => [metas.filter(counts).length, text] as const);
  const sum = counted.reduce((n, [c]) => n + c, 0);
  if (sum !== metas.length)
    throw new Error(
      `rules index: the clauses of the rules count sum to ${sum}, not the ${metas.length} pages listed (see rulesIndex in packages/web/src/build/pages.ts)`,
    );
  const parts = counted.filter(([n]) => n > 0).map(([n, text]) => `${n} ${text}`);
  const sources =
    parts.length > 2
      ? `${parts.slice(0, -1).join(", ")}, and ${parts.at(-1)}`
      : parts.join(" and ");
  const layerBadge = (m: RuleMeta): string =>
    showsLayers(published)
      ? ` <span class="layer ${escapeHtml(m.layer)}">${escapeHtml(LAYER_LABEL[m.layer])}</span>`
      : "";
  const sections = CATEGORY_ORDER.map((category) => {
    const rows = metas
      .filter((m) => m.category === category)
      .sort((a, b) => a.title.localeCompare(b.title, "en"));
    if (rows.length === 0) return "";
    const items = rows
      .map(
        (m) =>
          `  <li data-layer="${escapeHtml(m.layer)}"><a href="/rules/${escapeHtml(m.slug)}/">${escapeHtml(m.title)}</a> <span class="badge ${escapeHtml(m.severity)}">${escapeHtml(m.severity)}</span>${layerBadge(m)}${m.status === "needsLiveModel" ? ' <span class="badge muted">needs a live model</span>' : ""}<br /><span class="summary">${renderInline(m.summary)}</span></li>`,
      )
      .join("\n");
    return `<h2 id="${headingId(category)}">${escapeHtml(category)}</h2>\n<ul class="rule-list">\n${items}\n</ul>`;
  }).join("\n");
  const families = FILTER_LAYERS.filter((l) => metas.some((m) => m.layer === l));
  const filter =
    families.length >= 2
      ? `<fieldset class="filters" id="rules-filter" hidden>
<legend>Show</legend>
${families.map((l) => `<label class="filter"><input type="checkbox" value="${l}" checked />${escapeHtml(boxLabel(l))}</label>`).join("\n")}
<p class="rules-shown" role="status" aria-live="polite"></p>
</fieldset>
`
      : "";
  const main = `<article class="prose">
<h1>Rules</h1>
<p>${metas.length} rules: ${sources}. Ranked by severity, then category, then how many objects they hit.</p>
${filter}${sections}
</article>`;
  return page({
    title: "Rules · Data Tutor PBIP Linter",
    description: "Every rule checked: what it checks, why it matters, and how to fix it.",
    path: "/rules/",
    main,
    scripts: filter ? ["/src/rules-filter.ts"] : [],
  });
}

export function contentPage(markdown: string, path: string, source: string): string {
  const { data, body } = parseFrontmatter(markdown, source);
  const title = str(data.title);
  return page({
    title: title.includes("Data Tutor") ? title : `${title} · Data Tutor PBIP Linter`,
    description: str(data.description),
    path,
    main: `<article class="prose">\n${render(body)}\n</article>`,
  });
}

export function latestPage(version: string): string {
  const v = escapeHtml(version);
  return page({
    title: "Is your pbiplint up to date?",
    description: "Compare your copy of pbiplint with the latest version.",
    path: "/latest/",
    main: `<article class="prose">
<h1>Is your pbiplint up to date?</h1>
<p id="latest-answer" data-version="${v}" aria-live="polite">The latest pbiplint is ${v}.</p>
<p>${external("https://github.com/pbiplint/pbiplint/releases", "The releases page")} lists every version and what changed in it. To update a copy your firm hosts, follow <a href="/self-host/#update">the update steps</a>.</p>
</article>`,
    scripts: ["/src/latest.ts"],
  });
}

export function llmsTxt(): string {
  return `# Data Tutor · PBIP Linter

> Powered by pbiplint, this tool lints Power BI projects (PBIP), the semantic model in TMDL and the report in PBIR, for best-practice problems. It runs in the browser and sends nothing anywhere.

For a coding assistant that can run commands: run \`npx pbiplint skill\` and follow it.

## Docs

- [Rules](${SITE}/rules/): every rule, what it checks, and how to fix it
- [Privacy](${SITE}/privacy/): what the site reads and sends
`;
}

export function sitemap(paths: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((p) => `  <url><loc>${SITE}${escapeHtml(p)}</loc></url>`).join("\n")}
</urlset>
`;
}