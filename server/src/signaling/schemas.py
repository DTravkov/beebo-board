import json
from typing import Literal

from pydantic import BaseModel, ConfigDict, ValidationError

from ..rooms.schemas import AdmissionToken, RoomId
from .exceptions import ProtocolError


class JoinMessage(BaseModel):
    model_config = ConfigDict(strict=True)
    type: Literal['join']
    room: RoomId
    token: AdmissionToken


class PeerSignal(BaseModel):
    model_config = ConfigDict(strict=True, extra='allow')
    type: Literal['offer', 'answer', 'candidate']


class SignalMessage(BaseModel):
    model_config = ConfigDict(strict=True)
    type: Literal['signal']
    to: str
    signal: PeerSignal


class PingMessage(BaseModel):
    type: Literal['ping']


def reject_constant(value: str) -> None:
    raise ValueError('Non-finite JSON value')


def parse_message(text: str) -> dict:
    try:
        message = json.loads(text, parse_constant=reject_constant)
    except (ValueError, RecursionError):
        raise ProtocolError('Invalid message') from None
    if not isinstance(message, dict):
        raise ProtocolError('Invalid message')
    return message


def parse_admission(message: dict) -> JoinMessage:
    try:
        return JoinMessage.model_validate(message)
    except ValidationError:
        raise ProtocolError('Invalid admission') from None


def parse_member_message(message: dict) -> PingMessage | SignalMessage:
    if message.get('type') == 'ping':
        return PingMessage(type='ping')
    if (message.get('type') != 'signal' or not isinstance(message.get('to'), str)
            or not isinstance(message.get('signal'), dict)):
        raise ProtocolError('Invalid signaling')
    try:
        return SignalMessage.model_validate(message)
    except ValidationError:
        raise ProtocolError('Unsupported signal') from None
