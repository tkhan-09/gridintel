with open('/app/app/api/v1/copilot.py') as f:
    content = f.read()
content = content.replace('llama3-70b-8192', 'llama-3.3-70b-versatile')
with open('/app/app/api/v1/copilot.py', 'w') as f:
    f.write(content)
print('Done')
