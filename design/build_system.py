# Builds the TAB design system files (design/system/project/...) from the repo's real tokens and CSS.
# Run from the TAB folder: python design/build_system.py
# Keeps the system's original createdOnFiles marker; removed components are reported for a null publish.
import json, os, datetime

R = 'design/system/project'


def w(p, s):
    fp = os.path.join(R, p)
    os.makedirs(os.path.dirname(fp), exist_ok=True)
    with open(fp, 'w', encoding='utf8', newline='\n') as f:
        f.write(s)


now = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
idx_path = os.path.join(R, 'design-system.json')
created = json.load(open(idx_path, encoding='utf8'))['createdOnFiles'] if os.path.exists(idx_path) else {"v": 1, "at": now}

C = [
    ("stone", "#e8e6e0", "Light ground: the top of the landing stage and the one light panel."),
    ("stone-2", "#d6d4cd", "Lower stone and nodes on the light panel."),
    ("graphite", "#1b1b1a", "Main dark ground: everything after the hero, dashboard, docs."),
    ("graphite-2", "#252523", "Panels, tab cards, ledger and ring cards on graphite."),
    ("graphite-3", "#2f2f2c", "Raised surfaces inside panels: notices, chips, FAQ chevrons."),
    ("ink", "#0a0a09", "Text on stone; console surface; dark pill fill. 15:1 on stone."),
    ("ink-2", "#5b5a55", "Muted text on stone (second beat of a headline). 5.3:1 on stone."),
    ("paper", "#f3f2ee", "Text on graphite; primary pill fill. 15:1 on graphite."),
    ("paper-2", "#a9a8a2", "Muted text on graphite. 7.4:1 on graphite."),
    ("paper-3", "#75746e", "Decorative or disabled only on graphite (code comments, released amounts). Not for body text."),
    ("line", "rgba(243,242,238,0.12)", "Hairlines between rows and panel dividers on graphite."),
    ("line-2", "rgba(243,242,238,0.2)", "Input and secondary-button borders on graphite."),
    ("accent", "#ff4d2e", "Coral. The only colour: spent arc, refusals, destructive actions, limits. 5.6:1 on graphite."),
    ("accent-deep", "#b8321a", "Coral for small text on stone panels, where plain coral is too faint. 4.9:1 on stone."),
    ("ok", "#9fd8ad", "Semantic only: settled payment state labels."),
]

tokens = {
    "name": "TAB", "version": 2,
    "color": {"themes": [{"id": "site", "name": "Site"}], "tokens": [{"name": n, "value": v, "usage": u} for n, v, u in C]},
    "type": {
        "fonts": [],
        "families": {
            "display": "\"Funnel Display\", system-ui, sans-serif",
            "body": "\"Funnel Sans\", system-ui, -apple-system, \"Segoe UI\", sans-serif",
            "mono": "\"Geist Mono\", ui-monospace, \"Cascadia Mono\", Consolas, monospace",
        },
        "groups": [
            {"name": "Display", "family": "display", "styles": [
                {"name": "h1", "fontSize": "105.6px", "lineHeight": 0.92, "fontWeight": 400, "letterSpacing": "-0.035em", "sample": "Give your agent a tab. Not your wallet.", "usage": "Hero and page titles. clamp(2.9rem, 6.4vw, 6.6rem). Second beat in the muted colour."},
                {"name": "h2", "fontSize": "78.4px", "lineHeight": 0.95, "fontWeight": 400, "letterSpacing": "-0.035em", "sample": "Four steps. One signature.", "usage": "Panel headlines, max 16ch. clamp(2.4rem, 5vw, 4.9rem)."},
                {"name": "h3", "fontSize": "25.6px", "lineHeight": 1.08, "fontWeight": 500, "letterSpacing": "-0.025em", "sample": "Give the agent a key", "usage": "Step and check titles inside panels."},
            ]},
            {"name": "Text", "family": "body", "styles": [
                {"name": "lede", "fontSize": "18.9px", "lineHeight": 1.42, "fontWeight": 400, "letterSpacing": "-0.015em", "sample": "TAB lets an AI agent pay for APIs in USDC on Solana, up to a limit you set.", "usage": "Beside a headline, max 34ch; the second sentence is muted."},
                {"name": "body", "fontSize": "16px", "lineHeight": 1.5, "fontWeight": 400, "sample": "Revoke in one click. Whatever's left goes back to your wallet.", "usage": "Running text."},
                {"name": "small", "fontSize": "14px", "lineHeight": 1.5, "fontWeight": 400, "sample": "Opening fee: 0.20 USDC, in the same signature.", "usage": "Hints, form help, errors."},
            ]},
            {"name": "Mono", "family": "mono", "styles": [
                {"name": "eyebrow", "fontSize": "11px", "lineHeight": 1.4, "fontWeight": 500, "letterSpacing": "0.12em", "sample": "HOW IT WORKS", "usage": "Uppercase eyebrows and field labels."},
                {"name": "balance", "fontSize": "73.6px", "lineHeight": 1, "fontWeight": 500, "letterSpacing": "-0.04em", "sample": "3.79", "usage": "The ring readout and console balance. Tabular figures."},
                {"name": "log", "fontSize": "12px", "lineHeight": 1.75, "fontWeight": 400, "sample": "GET api.pricefeed.dev/quote → 402 0.010", "usage": "Console logs, the hero feed, code."},
            ]},
        ],
    },
    "spacing": {"tokens": [
        {"name": "space-1", "value": "8px", "usage": "Chip padding, icon gaps."},
        {"name": "space-2", "value": "12px", "usage": "Gap between stacked panels; button groups."},
        {"name": "space-3", "value": "16px", "usage": "Minimum page gutter on phones."},
        {"name": "space-4", "value": "24px", "usage": "Row padding inside panels."},
        {"name": "space-5", "value": "56px", "usage": "Page gutter on desktop (clamp 16px to 56px)."},
        {"name": "space-6", "value": "72px", "usage": "Panel padding on desktop (clamp 24px to 72px)."},
        {"name": "space-7", "value": "96px", "usage": "Panel head to content on desktop."},
    ]},
    "radius": {"tokens": [
        {"name": "radius-input", "value": "14px", "usage": "Inputs and copy boxes."},
        {"name": "radius-card", "value": "22px", "usage": "Tab cards, notices, the ledger."},
        {"name": "radius-panel", "value": "28px", "usage": "Panels and the console (clamp 20px to 28px)."},
        {"name": "radius-pill", "value": "999px", "usage": "Buttons, chips, the chevron disc."},
    ]},
    "shadow": {"tokens": [
        {"name": "shadow-ring", "value": "0 30px 50px rgba(0,0,0,.35)", "usage": "Only the ring casts a shadow (as a drop-shadow filter)."},
    ]},
}
w('tokens.json', json.dumps(tokens, indent=2))
w('README.md', open('design/system-readme.md', encoding='utf8').read())

head = ('@import url("https://fonts.googleapis.com/css2?family=Funnel+Display:wght@300..800&family=Funnel+Sans:wght@300..800&family=Geist+Mono:wght@400;500&display=swap");\n'
        '/* TAB component styles: the production stylesheet from the TAB repo (src/web/styles.css), verbatim. */\n')
w('components/bundle.css', head + open('src/web/styles.css', encoding='utf8').read())

comps = json.load(open('design/system-components.json', encoding='utf8'))
names = {c['name'] for c in comps}
for c in comps:
    w(f"components/{c['name']}/README.md", f"# {c['name']}\n\n{c['guide']}\n")
    w(f"components/{c['name']}/preview.html", f"<!-- @dsCard group=\"{c['group']}\" height={c['height']} -->\n{c['preview']}\n")
w('components/Cover/preview.html', open('design/system-cover.html', encoding='utf8').read())

removed = []
cdir = os.path.join(R, 'components')
for d in sorted(os.listdir(cdir)):
    if os.path.isdir(os.path.join(cdir, d)) and d not in names and d != 'Cover':
        for f in os.listdir(os.path.join(cdir, d)):
            os.remove(os.path.join(cdir, d, f))
            removed.append(f"project/components/{d}/{f}")
        os.rmdir(os.path.join(cdir, d))

idx = {
    "v": 3, "layout": "files", "createdOnFiles": created, "title": "TAB", "namespace": "TAB", "libraries": [],
    "sections": {}, "groups": [], "assetGroups": {}, "blobs": {}, "docs": {"readme": "project/README.md", "sections": []},
    "lastChange": {"by": "ThyImpaler", "at": now, "via": "Claude Code", "note": "v2: redesign. Chrome ring identity, Funnel + Geist Mono, coral accent; Receipt and RuledList retired."},
}
w('design-system.json', json.dumps(idx, indent=2))
print("removed:", json.dumps(removed))
print("files:", sorted(os.path.relpath(os.path.join(d, f), R).replace('\\', '/') for d, _, fs in os.walk(R) for f in fs))
