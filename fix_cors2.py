with open('/app/app/main.py') as f:
    content = f.read()
content = content.replace(
    "allow_origins=['*'],\n    allow_credentials=True,",
    "allow_origins=['*'],\n    allow_credentials=False,"
)
with open('/app/app/main.py', 'w') as f:
    f.write(content)
print('Done')
