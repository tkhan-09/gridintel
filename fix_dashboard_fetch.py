fp = r'E:\AI Projects\gridintel\frontend\src\app\(dashboard)\dashboard\page.tsx'
c = open(fp, encoding='utf-8').read()
old = '`${process.env.NEXT_PUBLIC_API_URL}/api/v1/analytics/dashboard`,'
new = '`${process.env.NEXT_PUBLIC_API_URL}/api/v1/analytics/dashboard?month=${new Date().getMonth() + 1}&year=${new Date().getFullYear()}`,'
c = c.replace(old, new)
open(fp, 'w', encoding='utf-8').write(c)
print('Done')
