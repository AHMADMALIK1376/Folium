import jwt

from tests.keys import OMIT, TEST_KID, jwks_document, make_token, private_key


def test_jwks_document_shape():
    doc = jwks_document()
    assert list(doc.keys()) == ["keys"]
    key = doc["keys"][0]
    assert key["kid"] == TEST_KID
    assert key["alg"] == "ES256"
    assert key["kty"] == "EC"
    assert key["crv"] == "P-256"
    assert key["use"] == "sig"


def test_make_token_is_verifiable_with_the_public_key():
    token = make_token(email="a@example.com", issuer="https://x/auth/v1", audience="authenticated")
    decoded = jwt.decode(
        token,
        private_key.public_key(),
        algorithms=["ES256"],
        audience="authenticated",
        issuer="https://x/auth/v1",
    )
    assert decoded["email"] == "a@example.com"
    assert decoded["sub"]


def test_make_token_sets_the_kid_header():
    token = make_token(issuer="https://x/auth/v1")
    assert jwt.get_unverified_header(token)["kid"] == TEST_KID


def test_extra_claims_are_merged():
    token = make_token(issuer="https://x/auth/v1", user_metadata={"full_name": "Ada"})
    decoded = jwt.decode(token, private_key.public_key(), algorithms=["ES256"], audience="authenticated", issuer="https://x/auth/v1")
    assert decoded["user_metadata"] == {"full_name": "Ada"}


def test_email_can_be_omitted_entirely():
    token = make_token(email=OMIT, issuer="https://x/auth/v1")
    decoded = jwt.decode(token, options={"verify_signature": False}, algorithms=["ES256"])
    assert "email" not in decoded


def test_email_can_be_explicitly_null():
    token = make_token(email=None, issuer="https://x/auth/v1")
    decoded = jwt.decode(token, options={"verify_signature": False}, algorithms=["ES256"])
    assert "email" in decoded
    assert decoded["email"] is None


def test_kid_header_can_be_omitted():
    token = make_token(kid=OMIT, issuer="https://x/auth/v1")
    assert "kid" not in jwt.get_unverified_header(token)


def test_kid_can_be_overridden():
    token = make_token(kid="rotated", issuer="https://x/auth/v1")
    assert jwt.get_unverified_header(token)["kid"] == "rotated"
