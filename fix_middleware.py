with open(r'E:\AI Projects\gridintel\frontend\src\middleware.ts', 'w') as f:
    f.write('import { NextResponse } from "next/server";\nimport type { NextRequest } from "next/server";\n\nexport function middleware(request: NextRequest) {\n  return NextResponse.next();\n}\n')
print('Done')
