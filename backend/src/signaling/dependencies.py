from typing import Annotated

from fastapi import Depends

from ..rooms.dependencies import RoomsDependency
from ..shared.dependencies import SettingsDependency
from .repository import InMemoryConnectionRepository
from .service import SignalingService
from .turn_credentials import TurnCredentials

ConnectionRepositoryDependency = Annotated[
    InMemoryConnectionRepository, Depends(InMemoryConnectionRepository),
]


async def get_turn_credentials(settings: SettingsDependency) -> TurnCredentials:
    return TurnCredentials(settings)


TurnCredentialsDependency = Annotated[TurnCredentials, Depends(get_turn_credentials)]


async def get_signaling(
    rooms: RoomsDependency,
    connections: ConnectionRepositoryDependency,
    turn: TurnCredentialsDependency,
) -> SignalingService:
    return SignalingService(rooms, connections, turn.issue)


SignalingDependency = Annotated[SignalingService, Depends(get_signaling)]
