class FoliumError(Exception):
    """Base class for domain errors raised by the service layer.

    The service layer must never import fastapi. These exceptions are the
    contract between services and the HTTP layer, which maps them to
    status codes.
    """


class NotFoundError(FoliumError):
    """The resource does not exist, or the caller may not know that it does."""


class PermissionDeniedError(FoliumError):
    """The caller may see the resource but not perform this action.

    Must NEVER be raised for documents or shares: returning 403 for those
    confirms the resource exists, which breaks this project's rule that
    access-denied and does-not-exist must be indistinguishable (404, never
    403). Document and share code paths raise NotFoundError instead, even
    when the underlying reason is a permission shortfall rather than a
    missing row. This exception exists only for future resource types
    where confirming existence is not sensitive.
    """


class ValidationError(FoliumError):
    """The request was well-formed but semantically invalid."""


class ConflictError(FoliumError):
    """The request conflicts with current state."""


class JwksUnavailableError(FoliumError):
    """Supabase's signing keys could not be fetched and nothing is cached.

    This is an infrastructure failure, not an authentication decision, so it
    maps to 503. It must NEVER be downgraded into allowing the request: doing
    so would let an attacker bypass authentication by making the key endpoint
    unreachable.
    """
