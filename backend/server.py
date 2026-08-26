from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path(__file__).parent / '.env')

import os
import logging
from fastapi import FastAPI, APIRouter, Request
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware

from db import db, client
from routers import (auth, employees, attendance, leave, holidays, clients,
                     reports, notifications, audit, dashboard, settings, orgs)
from seed import seed

logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("medalyze")

app = FastAPI(title="Medalyze HRMS API")
api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"message": "Medalyze HRMS API", "status": "ok"}


api_router.include_router(auth.router)
api_router.include_router(employees.router)
api_router.include_router(attendance.router)
api_router.include_router(attendance.break_router)
api_router.include_router(leave.router)
api_router.include_router(holidays.router)
api_router.include_router(holidays.bo_router)
api_router.include_router(clients.router)
api_router.include_router(reports.router)
api_router.include_router(notifications.router)
api_router.include_router(audit.router)
api_router.include_router(dashboard.router)
api_router.include_router(settings.router)
api_router.include_router(orgs.router)

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("organization_id")
    await db.attendance.create_index([("user_id", 1), ("date", 1)])
    await db.leave_transactions.create_index([("organization_id", 1), ("user_id", 1), ("leave_type_id", 1)])
    await db.audit_logs.create_index([("organization_id", 1), ("created_at", -1)])
    await db.notifications.create_index([("user_id", 1), ("created_at", -1)])
    try:
        await seed()
    except Exception as e:
        logger.error(f"Seed error: {e}")


@app.on_event("shutdown")
async def shutdown():
    client.close()
