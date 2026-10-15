import logging
import time
from typing import Any

import httpx

logger = logging.getLogger(__name__)

TOO_MANY_REQUESTS = 429
RETRY_STATUSES = {502, 503, 504}

_client = httpx.Client(
    timeout=httpx.Timeout(45.0, connect=10.0),
    headers={"User-Agent": "weather-aware-truck-routing/1.0"},
)


class UpstreamError(Exception):
    """An external service failed. `message` can be shown to the user."""

    def __init__(self, message: str, status: int | None = None, payload: Any = None):
        super().__init__(message)
        self.message = message
        self.status = status
        self.payload = payload

    @property
    def is_rate_limited(self) -> bool:
        return self.status == TOO_MANY_REQUESTS


def _error_reason(response: httpx.Response) -> str | None:
    try:
        reason = response.json().get("reason")
    except (ValueError, AttributeError):
        return None
    return reason if isinstance(reason, str) and len(reason) < 200 else None


def get_json(url: str, *, params: dict[str, Any] | None = None, service: str) -> Any:
    for attempt in range(2):
        try:
            response = _client.get(url, params=params)
        except (httpx.ConnectError, httpx.ConnectTimeout) as error:
            logger.warning("%s connection failed: %s", service, error)
            if attempt == 0:
                continue
            raise UpstreamError(f"The {service} service is unreachable. Please try again.") from error
        except httpx.TimeoutException as error:
            # don't retry, it would just use up more of the rate limit
            logger.warning("%s timed out: %s", service, error)
            raise UpstreamError(f"The {service} service is responding slowly. Please try again in a minute.") from error
        except httpx.HTTPError as error:
            logger.warning("%s request failed: %s", service, error)
            raise UpstreamError(f"The {service} service is unreachable. Please try again.") from error

        if response.status_code == TOO_MANY_REQUESTS:
            # limits are per minute/hour/day, retrying now would fail again
            reason = _error_reason(response) or "Please try again later."
            logger.warning("%s rate limit reached: %s", service, reason)
            raise UpstreamError(f"The {service} service's free usage limit was reached. {reason}", TOO_MANY_REQUESTS)
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
