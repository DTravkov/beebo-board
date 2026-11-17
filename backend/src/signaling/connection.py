import asyncio
import json

from fastapi import WebSocket

MAX_PAYLOAD = 32_768
MAX_QUEUED_BYTES = 262_144


class WebSocketConnection:
    """One writer per socket; bounded queues isolate slow peers from the room."""

    def __init__(self, socket: WebSocket):
        self.socket = socket
        self.queue: asyncio.Queue[str | None] = asyncio.Queue(maxsize=128)
        self.queued_bytes = 0
        self.close_reason: str | None = None
        self.close_code = 1008

    def send(self, message: dict) -> None:
        if self.close_reason is not None:
            return
        text = json.dumps(message, separators=(',', ':'), ensure_ascii=False)
        size = len(text.encode('utf-8'))
        if self.queue.full() or self.queued_bytes + size > MAX_QUEUED_BYTES:
            self.close('Slow connection')
            return
        self.queued_bytes += size
        self.queue.put_nowait(text)

    def close(self, reason: str, code: int = 1008) -> None:
        if self.close_reason is not None:
            return
        self.close_reason, self.close_code = reason, code
        while not self.queue.empty():
            self.queue.get_nowait()
        self.queued_bytes = 0
        self.queue.put_nowait(None)

    async def write(self) -> None:
        while True:
            text = await self.queue.get()
            if text is None:
                await asyncio.wait_for(self.socket.close(self.close_code, self.close_reason), 5)
                return
            # Account for the in-flight send until it completes.
            await asyncio.wait_for(self.socket.send_text(text), 5)
            self.queued_bytes = max(0, self.queued_bytes - len(text.encode('utf-8')))
