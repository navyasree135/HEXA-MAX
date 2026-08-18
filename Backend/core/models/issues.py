import enum
from datetime import datetime
from typing import Optional, List
from sqlalchemy import (
    String, Float, DateTime, ForeignKey, Enum, Integer, Text, ARRAY, func
)
from sqlalchemy.dialects.postgresql import ARRAY as PG_ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship
from core.db.base import Base


class IssuePriority(str, enum.Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class IssueStatus(str, enum.Enum):
    NEW = "new"
    REVIEWED = "reviewed"
    FORWARDED = "forwarded"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"
    MALICIOUS = "malicious"


class Issue(Base):
    __tablename__ = "issues"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, index=True)
    issue_id: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, index=True)
    citizen_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    category: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    department_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("departments.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )
    priority: Mapped[IssuePriority] = mapped_column(
        Enum(IssuePriority, name="issue_priority_enum", values_callable=lambda obj: [e.value for e in obj]),
        nullable=False,
        default=IssuePriority.MEDIUM,
        index=True
    )
    status: Mapped[IssueStatus] = mapped_column(
        Enum(IssueStatus, name="issue_status_enum", values_callable=lambda obj: [e.value for e in obj]),
        nullable=False,
        default=IssueStatus.NEW,
        index=True
    )
    location_lat: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    location_lng: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ward: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    source: Mapped[str] = mapped_column(String(50), nullable=False, default="manual")
    transcript: Mapped[str] = mapped_column(Text, nullable=False)
    audio_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    ai_summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sentiment: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    assigned_officer_ids: Mapped[List[int]] = mapped_column(
        ARRAY(Integer),
        default=list,
        nullable=False
    )
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
        index=True
    )
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    sla_due_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)

    # Relationships
    citizen = relationship("User", foreign_keys=[citizen_id], back_populates="issues")
    department = relationship("Department", back_populates="issues")
    status_history = relationship("IssueStatusHistory", back_populates="issue", cascade="all, delete-orphan", order_by="IssueStatusHistory.changed_at.desc()")
    embedding_entry = relationship("IssueEmbedding", back_populates="issue", uselist=False, cascade="all, delete-orphan")
    credibility_logs = relationship("CredibilityLog", back_populates="issue")

    @property
    def history(self):
        return self.status_history
