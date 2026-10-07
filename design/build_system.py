# Builds the TAB design system files (design/system/project/...) from the repo's real tokens.
# Run from the TAB folder: python design/build_system.py
import json, os, datetime

R = 'design/system/project'


def w(p, s):
    fp = os.path.join(R, p)
    os.makedirs(os.path.dirname(fp), exist_ok=True)
    with open(fp, 'w', encoding='utf8', newline='\n') as f:
        f.write(s)


now = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

C = [
    ("paper", "#eef0ec", "Page background. Cool thermal paper, never cream."),
    ("paper-hi", "#fbfcfa", "Receipts, inputs, notices: anything printed on top of the page."),
    ("paper-lo", "#e3e6e1", "Meter tracks and quiet fills on paper."),
    ("ink", "#14161a", "Text, rules, primary buttons. 16:1 on paper."),
    ("ink-2", "#5b616b", "Secondary text, labels, captions. 5.6:1 on paper."),
    ("rule", "#c9cdc6", "Hairlines between ruled rows and dashed receipt separators. Decorative only, never text."),
    ("stamp", "#c8321f", "The one accent. Means a limit, a refusal or VOID. Never decoration. 5:1 on paper."),
    ("ok", "#1f6b3a", "Semantic only: a settled payment where a tick alone isn't enough."),
    ("carbon", "#15171b", "Console panels and code: anything an agent does live."),
    ("carbon-2", "#1f2227", "Raised surface inside a carbon panel."),
    ("carbon-ink", "#e7e8e4", "Text on carbon. 14:1."),
    ("carbon-dim", "#8c9097", "Secondary text on carbon. 5.9:1."),
    ("carbon-rule", "#2c3036", "Hairlines and button borders on carbon."),
    ("carbon-stamp", "#ff7a63", "Stamp red on carbon: refusals in the console. 6.6:1."),
]

tokens = {
    "name": "TAB", "version": 1,
    "color": {"themes": [{"id": "paper", "name": "Paper"}], "tokens": [{"name": n, "value": v, "usage": u} for n, v, u in C]},
    "type": {
        "fonts": [],
        "families": {
            "display": "\"Anybody\", \"Arial Narrow\", system-ui, sans-serif",
            "body": "\"Schibsted Grotesk\", system-ui, -apple-system, \"Segoe UI\", sans-serif",
            "mono": "\"Martian Mono\", ui-monospace, \"Cascadia Mono\", Consolas, monospace",
        },
        "groups": [
            {"name": "Display", "family": "display", "styles": [
                {"name": "display-1", "fontSize": "184px", "lineHeight": 0.86, "fontWeight": 800, "letterSpacing": "-0.012em", "sample": "PUT YOUR AGENT ON A TAB.", "usage": "Hero only. Uppercase, width 62%, clamp(60px, 12.4vw, 184px). One stamp-red word at most."},
                {"name": "display-2", "fontSize": "112px", "lineHeight": 0.88, "fontWeight": 800, "letterSpacing": "-0.01em", "sample": "FIVE CHECKS. EVERY PAYMENT.", "usage": "Section heads. Uppercase, width 64%, clamp(44px, 7.4vw, 112px)."},
                {"name": "display-3", "fontSize": "30px", "lineHeight": 1.05, "fontWeight": 700, "letterSpacing": "-0.01em", "sample": "Hand the agent a key, not a wallet", "usage": "Row titles in ruled lists, sentence case, width 75%."},
            ]},
            {"name": "Text", "family": "body", "styles": [
                {"name": "lede", "fontSize": "20px", "lineHeight": 1.5, "fontWeight": 400, "sample": "Give an agent a USDC limit, a per-payment cap and an expiry.", "usage": "Intro paragraphs, max 46ch. Bold (600) carries the promise."},
                {"name": "body", "fontSize": "16px", "lineHeight": 1.5, "fontWeight": 400, "sample": "Revoke from the dashboard and signing stops at once.", "usage": "Running text."},
                {"name": "small", "fontSize": "14px", "lineHeight": 1.5, "fontWeight": 400, "sample": "Devnet: you need devnet USDC and a little SOL.", "usage": "Hints, footers, errors."},
            ]},
            {"name": "Mono", "family": "mono", "styles": [
                {"name": "label", "fontSize": "11px", "lineHeight": 1.4, "fontWeight": 400, "letterSpacing": "0.08em", "sample": "SPENDING LIMITS FOR AI AGENTS", "usage": "Uppercase eyebrows, field labels, chips."},
                {"name": "receipt", "fontSize": "12px", "lineHeight": 1.6, "fontWeight": 400, "sample": "api.pricefeed.dev        0.010", "usage": "Receipts, ledgers and consoles. Tabular figures."},
                {"name": "button", "fontSize": "13px", "lineHeight": 1.2, "fontWeight": 400, "letterSpacing": "0.02em", "sample": "Open a tab", "usage": "Button labels, sentence case."},
            ]},
        ],
    },
    "spacing": {"tokens": [
        {"name": "space-1", "value": "8px", "usage": "Tight gaps: chip padding, icon to label."},
        {"name": "space-2", "value": "12px", "usage": "Button groups, form field gaps, receipt teeth."},
        {"name": "space-3", "value": "16px", "usage": "Minimum page gutter on phones."},
        {"name": "space-4", "value": "24px", "usage": "Row padding in ruled lists."},
        {"name": "space-5", "value": "32px", "usage": "Heading to lede, CTA row offset."},
        {"name": "space-6", "value": "80px", "usage": "Page gutter on desktop (clamp 16px to 80px)."},
        {"name": "space-7", "value": "120px", "usage": "Section head to content on desktop."},
        {"name": "space-8", "value": "220px", "usage": "Between sections on desktop (clamp 112px to 220px). Don't close it up."},
    ]},
    "radius": {"tokens": [
        {"name": "radius-none", "value": "0", "usage": "Everything. TAB is square: paper, rules and stamps have no rounded corners."},
        {"name": "radius-round", "value": "50%", "usage": "Only the loading spinner."},
    ]},
    "shadow": {"tokens": [
        {"name": "shadow-receipt", "value": "0 1px 0 #c9cdc6, 0 30px 60px -32px rgba(20,22,26,.38)", "usage": "Receipts only: paper lifting off paper. Nothing else casts a shadow."},
    ]},
    "stroke": {"tokens": [
        {"name": "stroke-hair", "value": "1px", "usage": "Rules between rows, dashed receipt separators."},
        {"name": "stroke-heavy", "value": "1.5px", "usage": "The top rule of a ruled list, buttons, inputs, notices."},
        {"name": "stroke-stamp", "value": "3px", "usage": "The VOID / CLOSED stamp border."},
    ]},
}
w('tokens.json', json.dumps(tokens, indent=2))

w('README.md', open('design/system-readme.md', encoding='utf8').read())

css = open('src/web/styles.css', encoding='utf8').read()
start = css.index('/* ---------- buttons ---------- */')
end = css.index('footer.site')
head = (
    '@import url("https://fonts.googleapis.com/css2?family=Anybody:wdth,wght@50..150,700..900&family=Martian+Mono:wght@400;700&family=Schibsted+Grotesk:wght@400;500;600&display=swap");\n'
    '/* TAB component styles. Same rules as src/web/styles.css in the TAB repo, trimmed. */\n'
    ':root{--display:var(--font-display);--body:var(--font-body);--mono:var(--font-mono);--ease:cubic-bezier(0.22,1,0.36,1)}\n'
    'body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--body);-webkit-font-smoothing:antialiased}\n'
    '.label{font-family:var(--mono);font-size:11px;line-height:1.4;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-2)}\n'
    '.muted{color:var(--ink-2)}\n'
    '.d2,.d3{font-family:var(--display);font-weight:800;text-transform:uppercase;margin:0;word-spacing:.06em}\n'
    '.d3{font-stretch:75%;font-weight:700;text-transform:none;font-size:26px;line-height:1.05;letter-spacing:-.01em;word-spacing:0}\n'
)
w('components/bundle.css', head + css[start:end])

comps = json.load(open('design/system-components.json', encoding='utf8'))
for c in comps:
    w(f"components/{c['name']}/README.md", f"# {c['name']}\n\n{c['guide']}\n")
    w(f"components/{c['name']}/preview.html", f"<!-- @dsCard group=\"{c['group']}\" height={c['height']} -->\n{c['preview']}\n")

w('components/Cover/preview.html', open('design/system-cover.html', encoding='utf8').read())

idx = {
    "v": 3, "layout": "files", "createdOnFiles": {"v": 1, "at": now}, "title": "TAB", "namespace": "TAB", "libraries": [],
    "sections": {}, "groups": [], "assetGroups": {}, "blobs": {}, "docs": {"readme": "project/README.md", "sections": []},
    "lastChange": {"by": "ThyImpaler", "at": now, "via": "Claude Code", "note": "First system, built from the TAB repo's styles.css and the chosen Receipt direction."},
}
w('design-system.json', json.dumps(idx, indent=2))
print(sorted(os.path.relpath(os.path.join(d, f), R).replace('\\', '/') for d, _, fs in os.walk(R) for f in fs))
