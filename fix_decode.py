with open('/app/app/api/v1/auth_and_analytics.py') as f:
    content = f.read()
content = content.replace(
    'decode_token(payload.refresh_token, token_type="refresh")',
    'decode_refresh_token(payload.refresh_token)'
).replace(
    '    decode_token,',
    '    decode_refresh_token,'
)
with open('/app/app/api/v1/auth_and_analytics.py', 'w') as f:
    f.write(content)
print('Done')
