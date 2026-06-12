fp = r'E:\AI Projects\gridintel\frontend\src\app\(dashboard)\dashboard\page.tsx'
c = open(fp, encoding='utf-8').read()
old = 'Authorization: `Bearer ${localStorage.getItem("access_token") ?? ""}`,'
new = 'Authorization: `Bearer ${(() => { try { const r = localStorage.getItem("gridintel-auth"); return r ? JSON.parse(r)?.state?.token || "" : ""; } catch { return ""; } })()}`,'
c = c.replace(old, new)
open(fp, 'w', encoding='utf-8').write(c)
print('Done')
