import json
import logging

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST

from .services.analysis import analyze_trip_cached
from .services.geocoding import GeocodingError, search_places
from .services.http import UpstreamError
from .services.routing import RoutingError
from .services.validation import ValidationError, parse_trip_request

logger = logging.getLogger(__name__)


def error_response(status: int, detail: str) -> JsonResponse:
    return JsonResponse({"detail": detail}, status=status)


@require_GET
def health(request):
    return JsonResponse({"status": "ok"})


@csrf_exempt
@require_POST
def analyze_routes(request):
    try:
        payload = json.loads(request.body or b"null")
    except json.JSONDecodeError:
        return error_response(400, "Request body must be valid JSON.")

    try:
        return JsonResponse(analyze_trip_cached(parse_trip_request(payload)))
    except (ValidationError, GeocodingError) as error:
        return error_response(400, str(error))
    except RoutingError as error:
        return error_response(422, str(error))
    except UpstreamError as error:
        return error_response(503 if error.is_rate_limited else 502, error.message)
    except Exception:
        logger.exception("Route analysis failed")
        return error_response(500, "Something went wrong while analyzing routes. Please try again.")


@require_GET
def search_locations(request):
    query = request.GET.get("q", "").strip()[:100]
    try:
        places = search_places(query)
    except UpstreamError as error:
        return error_response(502, error.message)
    suggestions = [
        {"id": place.id, "name": place.name, "detail": place.detail, "location": list(place.location)} for place in places
    ]
    return JsonResponse(suggestions, safe=False)
