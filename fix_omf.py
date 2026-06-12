f = open('/app/app/models/__init__.py')
c = f.read()
f.close()
if 'omf_history' not in c:
    c += 'from app.models.omf_history import OMFHistory\n'
    f = open('/app/app/models/__init__.py', 'w')
    f.write(c)
    f.close()
    print('Added OMFHistory')
else:
    print('Already exists')
