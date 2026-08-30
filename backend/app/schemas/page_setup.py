"""How a document sits on paper.

Stored as one JSONB column, validated here. The column is jsonb because page
size, orientation and the four margins are a single setting that nothing
queries or sorts on — but jsonb enforces nothing, so this module is the only
thing standing between a typo and a document that renders at 400 inches wide.
Every field is bounded.

Inches, not millimetres. Word's presets are stated in inches and this exists to
match them; 0.75in is exact where 19.05mm is a rounding artefact of it. CSS
understands `in` natively, so the number stored is the number rendered.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

PageSize = Literal["a4", "letter", "legal"]
Orientation = Literal["portrait", "landscape"]

# The widest sensible margin is bounded by the narrowest page. Letter and Legal
# are 8.5in across, so 4in a side would leave nothing to write on; 3 leaves half
# an inch, which is absurd but not degenerate, and refusing it is not this
# module's job. Zero is allowed: a full-bleed document is a real thing.
MIN_MARGIN_IN = 0.0
MAX_MARGIN_IN = 3.0


class PageMargins(BaseModel):
    model_config = ConfigDict(extra="forbid")

    top: float = Field(default=1.0, ge=MIN_MARGIN_IN, le=MAX_MARGIN_IN)
    right: float = Field(default=1.0, ge=MIN_MARGIN_IN, le=MAX_MARGIN_IN)
    bottom: float = Field(default=1.0, ge=MIN_MARGIN_IN, le=MAX_MARGIN_IN)
    left: float = Field(default=1.0, ge=MIN_MARGIN_IN, le=MAX_MARGIN_IN)


class PageSetup(BaseModel):
    """The whole setting, with defaults that match Word's Normal on A4.

    `extra="forbid"` throughout. A misspelled key in a jsonb column is
    invisible: it saves, it round-trips, and the setting it was meant to change
    simply never applies. Rejecting it at the door is the only place that can
    be noticed.
    """

    model_config = ConfigDict(extra="forbid")

    size: PageSize = "a4"
    orientation: Orientation = "portrait"
    margins: PageMargins = Field(default_factory=PageMargins)
