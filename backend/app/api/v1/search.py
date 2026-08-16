from typing import Annotated

from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.api.deps import CurrentUser, DbSession
from app.schemas.document import DocumentSummary
from app.services import search as service

router = APIRouter(prefix="/documents/search", tags=["documents"])


class SearchResult(DocumentSummary):
    """A document, plus why it matched.

    The snippet is the point: a list of titles does not say what was found, and
    "Untitled document" three times over is not an answer.
    """

    snippet: str
    owned: bool


class SearchResults(BaseModel):
    query: str
    results: list[SearchResult]


@router.get("", response_model=SearchResults)
async def search(
    db: DbSession,
    user: CurrentUser,
    q: Annotated[str, Query(max_length=200)] = "",
) -> SearchResults:
    """Search titles and bodies of documents the caller can see.

    A blank or one-character query returns nothing rather than everything: an
    empty search box is not a request for the whole account.

    Capped at 200 characters, because the query goes into a tsquery parser and
    an unbounded string is an unbounded parse.
    """
    hits = await service.search_documents(db, user.id, q)

    return SearchResults(
        query=q,
        results=[
            SearchResult(
                **DocumentSummary.model_validate(hit.document).model_dump(),
                snippet=hit.snippet,
                owned=hit.document.owner_id == user.id,
            )
            for hit in hits
        ],
    )
