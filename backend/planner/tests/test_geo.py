from django.test import SimpleTestCase

from planner.services.geo import (
    cumulative_miles,
    haversine_miles,
    interpolate_along,
    offset_point,
    point_at_distance,
    simplify,
    slice_line,
)

DENVER = (-104.9903, 39.7392)
KANSAS_CITY = (-94.5786, 39.0997)


class DistanceTests(SimpleTestCase):
    def test_haversine_matches_known_distance(self):
        self.assertAlmostEqual(haversine_miles(DENVER, KANSAS_CITY), 558, delta=3)

    def test_cumulative_miles_starts_at_zero_and_increases(self):
        distances = cumulative_miles([(0, 0), (0, 1), (0, 2)])
        self.assertEqual(distances[0], 0)
        self.assertAlmostEqual(distances[2], 2 * distances[1])


class AlongLineTests(SimpleTestCase):
    line = [(0.0, 0.0), (0.0, 1.0), (0.0, 2.0)]

    def setUp(self):
        self.cumulative = cumulative_miles(self.line)

    def test_point_at_distance_interpolates_and_clamps(self):
        middle = point_at_distance(self.line, self.cumulative, self.cumulative[-1] / 4)
        self.assertAlmostEqual(middle[1], 0.5)
        self.assertEqual(point_at_distance(self.line, self.cumulative, -5), self.line[0])
        self.assertEqual(point_at_distance(self.line, self.cumulative, 10_000), self.line[-1])

    def test_interpolate_along_values(self):
        seconds = [0.0, 100.0, 300.0]
        self.assertAlmostEqual(interpolate_along(self.cumulative, seconds, self.cumulative[1] * 1.5), 200.0)

    def test_slice_line_includes_inner_vertices(self):
        piece = slice_line(self.line, self.cumulative, self.cumulative[1] / 2, self.cumulative[2] * 0.75)
        self.assertEqual(len(piece), 3)
        self.assertEqual(piece[1], (0.0, 1.0))


class SimplifyTests(SimpleTestCase):
    def test_removes_collinear_points_and_keeps_corners(self):
        line = [(0, 0), (1, 0.0001), (2, 0), (2, 1)]
        self.assertEqual(simplify(line, 0.01), [(0, 0), (2, 0), (2, 1)])

    def test_short_lines_are_unchanged(self):
        self.assertEqual(simplify([(0, 0), (1, 1)], 0.1), [(0, 0), (1, 1)])


class OffsetPointTests(SimpleTestCase):
    def test_left_offset_is_north_when_heading_east(self):
        shifted = offset_point((0, 0), (10, 0), along=0.5, across=0.2)
        self.assertAlmostEqual(shifted[0], 5)
        self.assertAlmostEqual(shifted[1], 2)
