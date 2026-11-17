from typing import Annotated

from fastapi import Depends

from ..config import Settings
from .policy import RequestPolicy


async def get_settings() -> Settings:
    return Settings()


SettingsDependency = Annotated[Settings, Depends(get_settings)]


async def get_request_policy(settings: SettingsDependency) -> RequestPolicy:
    return RequestPolicy(settings.origins)


RequestPolicyDependency = Annotated[RequestPolicy, Depends(get_request_policy)]
