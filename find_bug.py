import sys
sys.path.insert(0, '/app')

from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi
from fastapi.routing import APIRoute
from app.api.v1 import billing_and_system

app2 = FastAPI(separate_input_output_schemas=False)
app2.include_router(billing_and_system.router, prefix='/api/v1')

for route in app2.routes:
    if not isinstance(route, APIRoute):
        continue
    try:
        get_openapi(title='t', version='1', routes=[route])
    except Exception as e:
        for dep in route.dependant.dependencies:
            dep_name = getattr(dep.call, '__name__', str(dep.call))
            print(f'BAD: {route.path} -> DEP: {dep_name}')