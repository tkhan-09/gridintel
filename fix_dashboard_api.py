fp = r'E:\AI Projects\gridintel\frontend\src\app\(dashboard)\dashboard\page.tsx'
with open(fp, encoding='utf-8') as f:
    c = f.read()

# Add apiClient import if not present
if "import apiClient" not in c:
    c = c.replace(
        "import { useCallback,",
        "import apiClient from '@/lib/api_client';\nimport { useCallback,"
    )

# Replace fetch block with apiClient
old = """      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/analytics/dashboard?month=${new Date().getMonth() + 1}&year=${new Date().getFullYear()}`,
        {
          headers: {
            Authorization: `Bearer ${(() => { try { const r = localStorage.getItem("gridintel-auth"); return r ? JSON.parse(r)?.state?.token || "" : ""; } catch { return ""; } })()}`,
          },
        }
      );
      if (res.ok) {
        const json = await res.json();
        setData(json);
      } else {
        // Fallback to mock during development
        setData(MOCK_DASHBOARD);
      }"""

new = """      const month = new Date().getMonth() + 1;
      const year = new Date().getFullYear();
      const res = await apiClient.get(`/analytics/dashboard?month=${month}&year=${year}`);
      setData(res.data);"""

if old in c:
    c = c.replace(old, new)
    print('Replaced fetch block')
else:
    print('Pattern not found - checking partial')
    print(repr(c[c.find('const res = await fetch'):c.find('const res = await fetch')+200]))

with open(fp, 'w', encoding='utf-8') as f:
    f.write(c)
print('Done')
