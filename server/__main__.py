import argparse
import sys

import uvicorn
from pydantic import ValidationError

from .src.config import Settings


def main() -> None:
    parser = argparse.ArgumentParser(description='Beebo FastAPI signaling server')
    parser.add_argument('--reload', action='store_true')
    args = parser.parse_args()
    try:
        settings = Settings()
    except ValidationError:
        # Settings errors can contain a TURN secret in Pydantic input/context.
        print('Invalid server configuration. Check PORT, TURN_URLS, TURN_SECRET and TURN_SECRET_FILE.', file=sys.stderr)
        raise SystemExit(1) from None
    uvicorn.run(
        'server.src.main:app', host=settings.host, port=settings.port,
        reload=args.reload, reload_dirs=['server/src'] if args.reload else None,
        workers=1, access_log=False, log_level='warning', proxy_headers=False,
        ws='websockets', ws_max_size=32_768, ws_max_queue=16,
        ws_per_message_deflate=False, timeout_graceful_shutdown=5,
        h11_max_incomplete_event_size=16_384,
    )


if __name__ == '__main__':
    main()
