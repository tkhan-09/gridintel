with open('/app/app/main.py') as f:
    content = f.read()
content = content.replace('allow_origins=settings.cors_origins', "allow_origins=['*']")
with open('/app/app/main.py', 'w') as f:
    f.write(content)
print('Done')
