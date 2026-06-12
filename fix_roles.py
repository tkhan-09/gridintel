import os

files = [
    '/app/app/api/v1/billing_and_system.py',
    '/app/app/api/v1/mod_and_operations.py',
    '/app/app/api/v1/auth_and_analytics.py',
]

replacements = [
    ('"SuperAdmin"', '"super_admin"'),
    ('"Admin"', '"admin"'),
    ('"Operator"', '"operator"'),
    ('"Auditor"', '"auditor"'),
    ('"Manager"', '"manager"'),
    ('"Engineer"', '"engineer"'),
    ('"Viewer"', '"viewer"'),
]

for fp in files:
    if not os.path.exists(fp):
        continue
    with open(fp) as f:
        c = f.read()
    for old, new in replacements:
        c = c.replace(old, new)
    with open(fp, 'w') as f:
        f.write(c)
    print('Fixed:', fp)
print('Done')
