import random
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any, Tuple
# pyrefly: ignore [missing-import]
from sqlalchemy import select, func, update, and_, or_
# pyrefly: ignore [missing-import]
from sqlalchemy.ext.asyncio import AsyncSession
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import selectinload

from core.config import settings
from core.exceptions import (
    NotFoundError,
    ForbiddenError,
    ConflictError,
    OptimisticLockError,
    ValidationError
)
from core.models.users import User, UserRole, UserStatus
from core.models.issues import Issue, IssuePriority, IssueStatus
from core.models.issue_status_history import IssueStatusHistory
from core.models.departments import Department
from core.models.sla_config import SLAConfig
from core.schemas.issue import (
    IssueCreateRequest,
    IssueForwardRequest,
    IssueResolveRequest,
    IssueMarkMaliciousRequest,
    IssueUpdateStatusRequest,
    DuplicateCheckResult
)
from core.services.ai_service import AIService
from core.services.rag_service import RAGService
from core.services.credibility_service import CredibilityService
from core.services.websocket_manager import ws_manager



def stub_reverse_geocode(lat: Optional[float], lng: Optional[float]) -> Optional[str]:
    """
    Reverse geocoding stub: converts lat/lng coordinates to a municipal ward name.
    Swappable with external Maps / OpenStreetMap API.
    """
    if lat is None or lng is None:
        return None
    # Deterministic mapping for sample city grid
    ward_num = int((abs(lat) * 10 + abs(lng) * 10)) % 12 + 1
    return f"Ward {ward_num}"


class IssueService:
    """
    Handles end-to-end issue lifecycle: creation, AI triage, SLA calculation,
    duplicate detection, optimistic locking, forwarding, and malicious reporting.
    """

    @staticmethod
    def generate_issue_code() -> str:
        """
        Generates public tracking code e.g. ISS-2026-000482.
        """
        year = datetime.now(timezone.utc).year
        num = random.randint(100000, 999999)
        return f"ISS-{year}-{num}"

    @staticmethod
    async def calculate_sla_due_date(
        db: AsyncSession,
        category: str,
        priority: IssuePriority
    ) -> datetime:
        """
        Calculates SLA deadline based on category and priority configuration.
        """
        now = datetime.now(timezone.utc)
        result = await db.execute(
            select(SLAConfig).where(
                SLAConfig.category.ilike(category.strip()),
                SLAConfig.priority == priority.value
            )
        )
        sla_entry = result.scalar_one_or_none()

        if sla_entry:
            hours = sla_entry.sla_hours
        else:
            # Standard SLA defaults
            default_hours = {
                IssuePriority.HIGH: 24,
                IssuePriority.MEDIUM: 48,
                IssuePriority.LOW: 72
            }
            hours = default_hours.get(priority, 48)

        return now + timedelta(hours=hours)

    @classmethod
    async def match_department(cls, db: AsyncSession, category: str) -> Optional[int]:
        """
        Maps grievance category to appropriate municipal department ID.
        """
        result = await db.execute(select(Department))
        departments = result.scalars().all()

        cat_lower = category.lower()
        for dept in departments:
            dept_lower = dept.name.lower()
            if any(term in dept_lower for term in cat_lower.split()) or any(term in cat_lower for term in dept_lower.split()):
                return dept.id

        # Return first department if available
        return departments[0].id if departments else None

    @classmethod
    async def create_citizen_issue(
        cls,
        db: AsyncSession,
        citizen: User,
        data: IssueCreateRequest,
        audio_bytes: Optional[bytes] = None
    ) -> Tuple[Issue, DuplicateCheckResult]:
        """
        Citizen issue creation pipeline:
        1. Transcribe audio if provided
        2. AI classification (category, priority, summary, sentiment)
        3. Reverse geocode lat/lng to ward
        4. Duplicate detection via pgvector embeddings
        5. SLA computation
        6. Persist issue, embedding, and initial status history
        """
        transcript = data.transcript
        if audio_bytes:
            stt_text = await AIService.transcribe_audio(audio_bytes)
            if stt_text:
                transcript = stt_text

        # AI Classification (Skip if already parsed in draft)
        if data.ai_summary and data.priority and data.category:
            category = data.category
            priority_str = data.priority
            priority = IssuePriority(priority_str) if priority_str in [e.value for e in IssuePriority] else IssuePriority.MEDIUM
            summary = data.ai_summary
            sentiment = "neutral"
        else:
            ai_res = await AIService.classify_grievance(transcript)
            category = data.category or ai_res["category"]
            priority_str = ai_res["priority"]
            priority = IssuePriority(priority_str) if priority_str in [e.value for e in IssuePriority] else IssuePriority.MEDIUM
            summary = ai_res["summary"]
            sentiment = ai_res["sentiment"]
            
            # Override transcript with translated English version if available
            if "english_translation" in ai_res and ai_res["english_translation"]:
                transcript = ai_res["english_translation"]

        # Geocoding ward
        ward = data.ward or stub_reverse_geocode(data.location_lat, data.location_lng)

        # Duplicate check (Semantic Analysis)
        dup_info = await RAGService.check_duplicate_issue(
            db=db,
            transcript=transcript,
            ward=ward
        )
        
        # Priority Escalation based on Semantic Analysis
        if dup_info.is_duplicate:
            priority = IssuePriority.HIGH
            summary = f"{summary} [Elevated Priority: High volume of similar issues detected in this ward]"

        # Calculate SLA
        sla_due_at = await cls.calculate_sla_due_date(db, category, priority)

        # Match department
        dept_id = await cls.match_department(db, category)

        # Generate unique issue tracking ID
        issue_code = cls.generate_issue_code()

        issue = Issue(
            issue_id=issue_code,
            citizen_id=citizen.id,
            category=category,
            department_id=dept_id,
            priority=priority,
            status=IssueStatus.NEW,
            location_lat=data.location_lat,
            location_lng=data.location_lng,
            ward=ward,
            transcript=transcript,
            source=data.source,
            audio_url=data.audio_url,
            ai_summary=summary,
            sentiment=sentiment,
            assigned_officer_ids=[],
            version=1,
            sla_due_at=sla_due_at
        )
        db.add(issue)
        await db.flush()

        # Record history
        history = IssueStatusHistory(
            issue_id=issue.id,
            old_status=None,
            new_status=IssueStatus.NEW.value,
            changed_by_user_id=citizen.id,
            notes="Grievance filed by citizen" + (" (Potential duplicate)" if dup_info.is_duplicate else "")
        )
        db.add(history)

        await db.commit()
        await db.refresh(issue)

        dup_result = DuplicateCheckResult(
            is_duplicate=dup_info["is_duplicate"],
            similarity_score=dup_info["similarity_score"],
            existing_issue_id=dup_info["existing_issue_id"],
            existing_summary=dup_info["existing_summary"]
        )

        return issue, dup_result

    @staticmethod
    async def get_issue_by_id(db: AsyncSession, issue_id_or_code: str) -> Optional[Issue]:
        """
        Fetches full issue record by database integer ID or public string issue_id (ISS-...).
        """
        query = select(Issue).options(
            selectinload(Issue.citizen),
            selectinload(Issue.department),
            selectinload(Issue.status_history).selectinload(IssueStatusHistory.changed_by_user)
        )
        if issue_id_or_code.isdigit():
            query = query.where(or_(Issue.id == int(issue_id_or_code), Issue.issue_id == issue_id_or_code))
        else:
            query = query.where(Issue.issue_id == issue_id_or_code)

        result = await db.execute(query)
        return result.scalar_one_or_none()

    @classmethod
    async def forward_issue(
        cls,
        db: AsyncSession,
        issue_id: int,
        staff_user: User,
        data: IssueForwardRequest
    ) -> Issue:
        """
        Forward issue to target department claimable queue.
        """
        issue = await cls.get_issue_by_id(db, str(issue_id))
        if not issue:
            raise NotFoundError(f"Issue {issue_id} not found")

        old_status = issue.status.value
        issue.department_id = data.department_id
        issue.status = IssueStatus.FORWARDED
        issue.version += 1

        history = IssueStatusHistory(
            issue_id=issue.id,
            old_status=old_status,
            new_status=IssueStatus.FORWARDED.value,
            changed_by_user_id=staff_user.id,
            notes=f"Forwarded to department ID {data.department_id}. Notes: {data.notes or 'None'}"
        )
        db.add(history)
        await db.commit()
        await db.refresh(issue)
        return issue

    @classmethod
    async def resolve_issue(
        cls,
        db: AsyncSession,
        issue_id: int,
        staff_user: User,
        data: IssueResolveRequest
    ) -> Issue:
        """
        Mark issue as resolved.
        """
        issue = await cls.get_issue_by_id(db, str(issue_id))
        if not issue:
            raise NotFoundError(f"Issue {issue_id} not found")

        old_status = issue.status.value
        issue.status = IssueStatus.RESOLVED
        issue.resolved_at = datetime.now(timezone.utc)
        issue.version += 1

        history = IssueStatusHistory(
            issue_id=issue.id,
            old_status=old_status,
            new_status=IssueStatus.RESOLVED.value,
            changed_by_user_id=staff_user.id,
            notes=f"Resolved by {staff_user.name}. Resolution: {data.notes}"
        )
        db.add(history)
        await db.commit()
        await db.refresh(issue)
        return issue

    @classmethod
    async def mark_issue_malicious(
        cls,
        db: AsyncSession,
        issue_id: int,
        staff_user: User,
        data: IssueMarkMaliciousRequest
    ) -> Issue:
        """
        Mark grievance as malicious/spam.
        Deducts credibility score and alerts administrators if score < 0.5.
        """
        issue = await cls.get_issue_by_id(db, str(issue_id))
        if not issue:
            raise NotFoundError(f"Issue {issue_id} not found")

        old_status = issue.status.value
        issue.status = IssueStatus.MALICIOUS
        issue.version += 1

        history = IssueStatusHistory(
            issue_id=issue.id,
            old_status=old_status,
            new_status=IssueStatus.MALICIOUS.value,
            changed_by_user_id=staff_user.id,
            notes=f"Flagged as malicious by {staff_user.name}. Reason: {data.reason}"
        )
        db.add(history)
        await db.flush()

        # Penalize citizen
        await CredibilityService.penalize_malicious_issue(
            db=db,
            citizen_id=issue.citizen_id,
            issue_id=issue.id,
            reason=data.reason
        )

        await db.commit()
        await db.refresh(issue)
        return issue

    @classmethod
    async def claim_issue(
        cls,
        db: AsyncSession,
        issue_id: int,
        officer: User,
        client_version: Optional[int] = None
    ) -> Issue:
        """
        Officer claims an issue from department queue using optimistic locking.
        """
        issue = await cls.get_issue_by_id(db, str(issue_id))
        if not issue:
            raise NotFoundError(f"Issue {issue_id} not found")

        if client_version is not None and issue.version != client_version:
            raise OptimisticLockError()

        if officer.id in (issue.assigned_officer_ids or []):
            return issue

        # Optimistic assignment
        assigned_list = list(issue.assigned_officer_ids or [])
        assigned_list.append(officer.id)
        issue.assigned_officer_ids = assigned_list
        old_status = issue.status.value
        issue.status = IssueStatus.IN_PROGRESS
        issue.version += 1

        assigned_at_str = datetime.now(timezone.utc).isoformat()
        history = IssueStatusHistory(
            issue_id=issue.id,
            old_status=old_status,
            new_status=IssueStatus.IN_PROGRESS.value,
            changed_by_user_id=officer.id,
            notes=f"Claimed by Officer {officer.name}"
        )
        db.add(history)
        await db.commit()
        await db.refresh(issue)

        # Broadcast live status change to connected admin map dashboards
        try:
            await ws_manager.broadcast_status_change(
                issue_id=issue.issue_id,
                status=IssueStatus.IN_PROGRESS.value,
                officer_name=officer.name,
                officer_id=officer.id,
                assigned_at=assigned_at_str,
                lat=issue.location_lat,
                lng=issue.location_lng,
                category=issue.category,
                ward=issue.ward,
                priority=issue.priority.value if hasattr(issue.priority, "value") else str(issue.priority),
                summary=issue.ai_summary or (issue.transcript[:80] if issue.transcript else "")
            )
        except Exception:
            pass

        return issue

    @classmethod
    async def update_issue_status(
        cls,
        db: AsyncSession,
        issue_id: int,
        officer: User,
        data: IssueUpdateStatusRequest
    ) -> Issue:
        """
        Officer updates issue status (in_progress, resolved) with optimistic locking.
        """
        issue = await cls.get_issue_by_id(db, str(issue_id))
        if not issue:
            raise NotFoundError(f"Issue {issue_id} not found")

        if data.version is not None and issue.version != data.version:
            raise OptimisticLockError()

        old_status = issue.status.value
        issue.status = data.status
        if data.status == IssueStatus.RESOLVED:
            issue.resolved_at = datetime.now(timezone.utc)
        issue.version += 1

        history = IssueStatusHistory(
            issue_id=issue.id,
            old_status=old_status,
            new_status=data.status.value,
            changed_by_user_id=officer.id,
            notes=data.notes or f"Status updated to {data.status.value}"
        )
        db.add(history)
        await db.commit()
        await db.refresh(issue)

        # Broadcast live status change to connected admin map dashboards
        try:
            assigned_at_str = datetime.now(timezone.utc).isoformat()
            await ws_manager.broadcast_status_change(
                issue_id=issue.issue_id,
                status=data.status.value,
                officer_name=officer.name,
                officer_id=officer.id,
                assigned_at=assigned_at_str,
                lat=issue.location_lat,
                lng=issue.location_lng,
                category=issue.category,
                ward=issue.ward,
                priority=issue.priority.value if hasattr(issue.priority, "value") else str(issue.priority),
                summary=issue.ai_summary or (issue.transcript[:80] if issue.transcript else "")
            )
        except Exception:
            pass

        return issue

    @classmethod
    async def get_queue(
        cls,
        db: AsyncSession,
        department_id: Optional[int] = None,
        ward: Optional[str] = None,
        priority: Optional[IssuePriority] = None,
        status: Optional[IssueStatus] = None,
        limit: int = 50,
        offset: int = 0
    ) -> Tuple[List[Issue], int]:
        """
        Fetches issues sorted by priority (high → medium → low) and creation time.
        """
        stmt = select(Issue).options(
            selectinload(Issue.citizen),
            selectinload(Issue.department),
            selectinload(Issue.status_history).selectinload(IssueStatusHistory.changed_by_user)
        )

        conditions = []
        if department_id:
            conditions.append(Issue.department_id == department_id)
        if ward:
            conditions.append(Issue.ward == ward)
        if priority:
            conditions.append(Issue.priority == priority)
        if status:
            if isinstance(status, (list, tuple)):
                conditions.append(Issue.status.in_(status))
            else:
                conditions.append(Issue.status == status)

        if conditions:
            stmt = stmt.where(and_(*conditions))

        # Count total
        count_stmt = select(func.count(Issue.id))
        if conditions:
            count_stmt = count_stmt.where(and_(*conditions))
        total_res = await db.execute(count_stmt)
        total = total_res.scalar_one()

        # Priority ordering: high -> medium -> low
        # Using case expression for deterministic sort
        # pyrefly: ignore [missing-import]
        from sqlalchemy import case
        priority_order = case(
            (Issue.priority == IssuePriority.HIGH, 1),
            (Issue.priority == IssuePriority.MEDIUM, 2),
            (Issue.priority == IssuePriority.LOW, 3),
            else_=4
        )

        stmt = stmt.order_by(priority_order, Issue.created_at.desc()).limit(limit).offset(offset)
        result = await db.execute(stmt)
        return list(result.scalars().all()), total
