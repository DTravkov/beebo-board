from pydantic import BaseModel


class Health(BaseModel):
    ok: bool


class PublicConfig(BaseModel):
    turnConfigured: bool
    directEnabled: bool
    maxParticipants: int
