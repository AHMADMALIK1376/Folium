"""Finding a document by what is in it.

Lexical search over `title` and `content_text`, backed by the GIN index added in
a1f4c9d27b30. `content_text` has been maintained since Phase 1 by
`create_document`, `update_document` and version restore, so nothing here has to
keep an index in step with anything.
"""

from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import and_, func, literal_column, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Document, DocumentShare

MIN_QUERY_LENGTH = 2
MAX_RESULTS = 50
SNIPPET_LENGTH = 160

# Written as literal SQL, and it has to be, for two reasons.
#
# `to_tsvector`'s first argument is a `regconfig`, not text — passed as a bind
# parameter it arrives as a varchar and no such overload exists, so the query
# fails outright.
#
# And it must match the expression indexed by a1f4c9d27b30 **character for
# character**. Postgres matches an expression index by comparing the parsed
# expression, and a bound parameter where the index has a literal does not
# compare equal — so a query built the ordinary way silently stops using the
# index and every search becomes a sequential scan of every document.
_VECTOR_SQL = (
    "setweight(to_tsvector('english', coalesce(documents.title, '')), 'A') || "
    "setweight(to_tsvector('english', coalesce(documents.content_text, '')), 'B')"
)


def _vector():
    return literal_column(f"({_VECTOR_SQL})")


@dataclass
class SearchHit:
    document: Document
    snippet: str
    rank: float


def normalise_query(raw: str) -> str:
    """The query as it will be used, or "" if it should not run at all.

    A blank box is not a request for every document, and a single character
    matches most of them while costing a full round trip.
    """
    cleaned = (raw or "").strip()

    return cleaned if len(cleaned) >= MIN_QUERY_LENGTH else ""


def snippet_for(text: str, query: str) -> str:
    """A window of the body around the first match, for showing why it matched.

    Built in Python rather than with ts_headline: that would mean a second,
    unindexed pass over the document body inside the query, and this only has to
    be good enough to recognise the document by.
    """
    body = " ".join((text or "").split())
    if not body:
        return ""

    needle = query.strip().lower().lstrip("-")
    position = body.lower().find(needle) if needle else -1

    if position == -1:
        return body[:SNIPPET_LENGTH] + ("…" if len(body) > SNIPPET_LENGTH else "")

    start = max(0, position - SNIPPET_LENGTH // 3)
    end = min(len(body), start + SNIPPET_LENGTH)

    return ("…" if start else "") + body[start:end] + ("…" if end < len(body) else "")


async def search_documents(
    db: AsyncSession, user_id: UUID, raw_query: str
) -> list[SearchHit]:
    """Documents the caller may see, matching `raw_query`, best first.

    Access is the same rule the dashboard uses — owned, or shared with them — and
    the trash is excluded because a deleted document is not an answer to a
    question.
    """
    query = normalise_query(raw_query)
    if not query:
        return []

    # websearch_to_tsquery, deliberately. It accepts what people actually type —
    # quoted phrases, "or", a leading minus — and it does NOT raise on malformed
    # input. to_tsquery throws a syntax error on a stray operator, which turns a
    # half-typed query into a 500.
    tsquery = func.websearch_to_tsquery(literal_column("'english'"), query)
    vector = _vector()
    rank = func.ts_rank(vector, tsquery)

    visible = or_(
        Document.owner_id == user_id,
        Document.id.in_(
            select(DocumentShare.document_id).where(DocumentShare.user_id == user_id)
        ),
    )

    result = await db.execute(
        select(Document, rank.label("rank"))
        .where(and_(visible, Document.is_deleted.is_(False), vector.op("@@")(tsquery)))
        .order_by(rank.desc(), Document.updated_at.desc())
        .limit(MAX_RESULTS)
    )

    return [
        SearchHit(
            document=document,
            snippet=snippet_for(document.content_text or "", query),
            rank=float(rank_value),
        )
        for document, rank_value in result.all()
    ]
