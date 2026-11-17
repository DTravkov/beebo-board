from fastapi import APIRouter

from ..rooms.constants import MAX_PARTICIPANTS
from ..shared.dependencies import SettingsDependency
from .schemas import Health, PublicConfig

router = APIRouter(prefix='/api', tags=['system'])


@router.get('/health', response_model=Health)
async def health():
    return {'ok': True}


@router.get('/config', response_model=PublicConfig)
async def config(settings: SettingsDependency):
    return {
        'turnConfigured': settings.turn_configured,
        'directEnabled': settings.direct_connections_enabled,
        'maxParticipants': MAX_PARTICIPANTS,
    }
