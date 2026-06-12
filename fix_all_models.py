import os

models_dir = '/app/app/models'
all_files = [f[:-3] for f in os.listdir(models_dir) if f.endswith('.py') and f not in ('__init__.py', 'base.py')]
print('All model files:', all_files)

f = open('/app/app/models/__init__.py')
current = f.read()
f.close()

added = []
for fname in sorted(all_files):
    fp = os.path.join(models_dir, fname + '.py')
    with open(fp) as f:
        content = f.read()
    # Find class names
    import re
    classes = re.findall(r'^class (\w+)\(', content, re.MULTILINE)
    for cls in classes:
        import_line = f'from app.models.{fname} import {cls}\n'
        if import_line not in current:
            current += import_line
            added.append(cls)

f = open('/app/app/models/__init__.py', 'w')
f.write(current)
f.close()
print('Added:', added)
