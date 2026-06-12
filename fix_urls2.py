fixes = [
    (r'E:\AI Projects\gridintel\frontend\src\components\layout\FilterBar.tsx', [
        ("get<Office[]>('/offices')", "get<Office[]>('/offices/')"),
        ("get<Company[]>('/companies')", "get<Company[]>('/companies/')"),
    ]),
    (r'E:\AI Projects\gridintel\frontend\src\components\layout\AlertsPanel.tsx', [
        ("get('/notifications')", "get('/notifications/')"),
        ('get("/notifications")', 'get("/notifications/")'),
    ]),
]
for fp, replacements in fixes:
    c = open(fp, encoding='utf-8').read()
    for old, new in replacements:
        c = c.replace(old, new)
    open(fp, 'w', encoding='utf-8').write(c)
    print('Fixed:', fp)
