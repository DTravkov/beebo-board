from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

RoomId = Annotated[str, Field(strict=True, pattern=r'^[a-zA-Z0-9_-]{16,64}$')]
AdmissionToken = Annotated[str, Field(strict=True, pattern=r'^[a-zA-Z0-9_-]{43}$')]
ConnectionPolicy = Literal['relay', 'all']


class CreateRoom(BaseModel):
    model_config = ConfigDict(strict=True)
    roomId: RoomId
    verifier: AdmissionToken
    policy: ConnectionPolicy


class CreatedRoom(BaseModel):
    roomId: str
