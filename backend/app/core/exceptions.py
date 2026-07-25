class FoliumError(Exception):
    """Base class for domain errors raised by the service layer.

    The service layer must never import fastapi. These exceptions are the
    contract between services and the HTTP layer, which maps them to
    status codes.
    """


class NotFoundError(FoliumError):
    """The resource does not exist, or the caller may not know that it does."""


class PermissionDeniedError(FoliumError):
    """The caller may see the resource but not perform this action."""


class ValidationError(FoliumError):
    """The request was well-formed but semantically invalid."""


class ConflictError(FoliumError):
    """The request conflicts with current state."""
