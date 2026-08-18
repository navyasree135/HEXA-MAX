from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from core.db.session import get_db
from core.models.users import User, UserRole
from core.models.issues import IssuePriority, IssueStatus
from core.schemas.issue import IssueResponse, IssueListResponse
from core.security import require_roles
from core.services.issue_service import IssueService

router = APIRouter(prefix="/queue", tags=["Officer Department Queue"])


@router.get("", response_model=IssueListResponse)
async def get_officer_queue(
    ward: Optional[str] = Query(None, description="Optional ward filter within officer department"),
    priority: Optional[IssuePriority] = Query(None, description="Filter by priority (high, medium, low)"),
    status: Optional[str] = Query(None, description="Filter by grievance status (pending, in_progress, resolved, etc.)"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(require_roles(UserRole.OFFICER, UserRole.ADMIN)),
    db: AsyncSession = Depends(get_db)
):
    """
    Queue scoped to the officer's assigned department.
    Sorted by priority (high → medium → low) and creation time.
    """
    dept_id = current_user.department_id

    db_status = None
    if status:
      status_lower = status.lower()
      if status_lower == "pending":
          db_status = [IssueStatus.NEW, IssueStatus.IN_PROGRESS]
      else:
          try:
              db_status = IssueStatus(status_lower)
          except ValueError:
              from fastapi import HTTPException
              raise HTTPException(
                  status_code=422,
                  detail=f"Invalid status: '{status}'. Must be 'pending' or one of {[s.value for s in IssueStatus]}"
              )

    issues, total = await IssueService.get_queue(
        db=db,
        department_id=dept_id,
        ward=ward,
        priority=priority,
        status=db_status,
        limit=limit,
        offset=offset
    )

    items = []
    for iss in issues:
        resp = IssueResponse.model_validate(iss)
        resp.citizen_name = iss.citizen.name if iss.citizen else None
        resp.citizen_phone = iss.citizen.phone if iss.citizen else None
        resp.department_name = iss.department.name if iss.department else None
        items.append(resp)

    return IssueListResponse(total=total, items=items)
