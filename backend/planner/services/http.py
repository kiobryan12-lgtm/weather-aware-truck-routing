import logging
import time
from typing import Any

import httpx

logger = logging.getLogger(__name__)

TOO_MANY_REQUESTS = 429
RETRY_STATUSES = {502, 503, 504}

_client = httpx.Client(
    timeout=httpx.Timeout(20.0, connect=10.0),
    headers={"User-Agent": "weather-aware-truck-routing/1.0"},
)


class UpstreamError(Exception):
    """A third-party service failed. `message` is safe to show to users."""

    def __init__(self, message: str, status: int | None = None, payload: Any = None):
        super().__init__(message)
        self.message = message
        self.status = status
        self.payload = payload

    @property
    def is_rate_limited(self) -> bool:
        return self.status == TOO_MANY_REQUESTS


def get_json(url: str, *, params: dict[str, Any] | None = None, service: str) -> Any:
    for attempt in range(2):
        try:
            response = _client.get(url, params=params)
        except httpx.HTTPError as error:
            logger.warning("%s request failed: %s", service, error)
            if attempt == 0:
                continue
            raise UpstreamError(f"The {service} service is unreachable. Please try again.") from error

        if response.status_code == TOO_MANY_REQUESTS:
            # Free-tier limits reset per minute, so retrying immediately would fail again.
            logger.warning("%s rate limit reached", service)
            raise UpstreamError(
                f"The {service} service's free usage limit was reached. Please wait a minute and try again.",
                TOO_MANY_REQUESTS,
            )
        if response.status_code in RETRY_STATUSES and attempt == 0:
            time.sleep(1)
            continue
        try:
            payload = response.json()
        except ValueError as error:
            raise UpstreamError(f"The {service} service returned an invalid response.", response.status_code) from error
        if response.is_success:
            return payload
        logger.warning("%s returned %s: %s", service, response.status_code, str(payload)[:300])
        raise UpstreamError(f"The {service} service could not process the request.", response.status_code, payload)

    raise UpstreamError(f"The {service} service is busy. Please try again in a moment.")
