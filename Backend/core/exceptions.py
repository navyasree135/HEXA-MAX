import logging
from typing import Any, Dict, Optional
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from sqlalchemy.exc import DBAPIError, OperationalError


class AppException(Exception):
    """Base application exception."""
    def __init__(
        self,
        message: str,
        error_code: str = "INTERNAL_SERVER_ERROR",
        status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail: Optional[Any] = None
    ):
        super().__init__(message)
        self.message = message
        self.error_code = error_code
        self.status_code = status_code
        self.detail = detail


class NotFoundError(AppException):
    """Resource not found exception (404)."""
    def __init__(self, message: str = "Resource not found", detail: Optional[Any] = None):
        super().__init__(
            message=message,
            error_code="NOT_FOUND",
            status_code=status.HTTP_404_NOT_FOUND,
            detail=detail
        )


class UnauthorizedError(AppException):
    """Authentication required or invalid (401)."""
    def __init__(self, message: str = "Authentication required", detail: Optional[Any] = None):
        super().__init__(
            message=message,
            error_code="UNAUTHORIZED",
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=detail
        )


class ForbiddenError(AppException):
    """Permission denied exception (403)."""
    def __init__(self, message: str = "Permission denied", detail: Optional[Any] = None):
        super().__init__(
            message=message,
            error_code="FORBIDDEN",
            status_code=status.HTTP_403_FORBIDDEN,
            detail=detail
        )


class BlockedUserError(AppException):
    """User account is blocked (403 account_blocked)."""
    def __init__(
        self,
        message: str = "Your account is temporarily or permanently blocked from raising complaints.",
        reason: Optional[str] = None,
        blocked_until: Optional[str] = None,
        duration_tier: Optional[str] = None
    ):
        super().__init__(
            message=message,
            error_code="account_blocked",
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "reason": reason,
                "blocked_until": blocked_until,
                "duration_tier": duration_tier
            }
        )


class ConflictError(AppException):
    """Resource conflict (409)."""
    def __init__(self, message: str = "Resource conflict", detail: Optional[Any] = None):
        super().__init__(
            message=message,
            error_code="CONFLICT",
            status_code=status.HTTP_409_CONFLICT,
            detail=detail
        )


class OptimisticLockError(AppException):
    """Optimistic locking collision (409)."""
    def __init__(self, message: str = "Issue has been modified or claimed by another user. Please refresh and retry."):
        super().__init__(
            message=message,
            error_code="OPTIMISTIC_LOCK_CONFLICT",
            status_code=status.HTTP_409_CONFLICT
        )


class ValidationError(AppException):
    """Validation failure (422)."""
    def __init__(self, message: str = "Validation failed", detail: Optional[Any] = None):
        super().__init__(
            message=message,
            error_code="VALIDATION_ERROR",
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=detail
        )


def register_exception_handlers(app: FastAPI) -> None:
    """
    Registers standardized exception handlers on a FastAPI application.
    """
    @app.exception_handler(AppException)
    async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error_code": exc.error_code,
                "message": exc.message,
                "detail": exc.detail
            }
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "error_code": "VALIDATION_ERROR",
                "message": "Invalid request parameters or payload",
                "detail": exc.errors()
            }
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error_code": f"HTTP_{exc.status_code}",
                "message": str(exc.detail),
                "detail": None
            }
        )

    @app.exception_handler(OSError)
    @app.exception_handler(DBAPIError)
    @app.exception_handler(OperationalError)
    async def db_offline_handler(request: Request, exc: Exception) -> JSONResponse:
        """
        Intercepts PostgreSQL connection-refused or database offline/unreachable errors.
        Returns 503 with an empty-but-valid payload so the frontend can degrade gracefully
        instead of receiving a raw 500 that crashes React components.
        """
        logging.getLogger("core.exceptions").warning(
            f"DB offline on {request.method} {request.url.path}: {exc}"
        )
        # Return an empty valid response shape so frontend Promise.allSettled captures it
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "error_code": "DB_OFFLINE",
                "message": "Database is temporarily unavailable. Showing cached data.",
                "items": [],
                "total": 0,
                "points": [],
                "trends": [],
            }
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        logging.getLogger("core.exceptions").exception(f"Unhandled exception on {request.method} {request.url.path}: {exc}")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error_code": "INTERNAL_SERVER_ERROR",
                "message": "An unexpected error occurred. Please try again later.",
                "detail": str(exc)
            }
        )
