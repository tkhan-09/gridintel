import os

base = r'E:\AI Projects\gridintel\frontend\src'
replacements = [
    ("/api/v1/notifications'", "/api/v1/notifications/'"),
    ('/api/v1/notifications"', '/api/v1/notifications/"'),
    ("/api/v1/offices'", "/api/v1/offices/'"),
    ('/api/v1/offices"', '/api/v1/offices/"'),
    ("/api/v1/companies'", "/api/v1/companies/'"),
    ('/api/v1/companies"', '/api/v1/companies/"'),
]

count = 0
for root, dirs, fs in os.walk(base):
    for f in fs:
        if not (f.endswith('.tsx') or f.endswith('.ts')):
            continue
        fp = os.path.join(root, f)
        content = open(fp, encoding='utf-8').read()
        new = content
        for old, rep in replacements:
            new = new.replace(old, rep)
        if new != content:
            open(fp, 'w', encoding='utf-8').write(new)
            count += 1
            print('Fixed:', fp)
print('Total fixed:', count)
