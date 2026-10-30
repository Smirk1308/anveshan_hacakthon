import unittest
from urllib.parse import parse_qs, urlparse

from backend.ranking import _build_result
from backend.schemas import Classification, EmergencyType, Hospital, Severity


class DirectionsTests(unittest.TestCase):
    origin = (12.2958, 76.6394)
    destination = (12.302, 76.645)

    def make_hospital(self, *, verified: bool, location_verified: bool) -> Hospital:
        return Hospital(
            id="mysuru-hospital",
            name="Mysuru Hospital",
            lat=self.destination[0],
            lng=self.destination[1],
            address="Mysuru, Karnataka",
            phone="0821 1234567",
            type="government",
            verified=verified,
            location_verified=location_verified,
            last_verified="2026-10-30" if verified else None,
            verified_by="hospital contact" if verified else None,
            source="Hospital confirmed" if verified else "Public listing",
        )

    def build_result(self, hospital: Hospital):
        emergency = Classification(
            type=EmergencyType.GENERAL_UNCLEAR,
            severity=Severity.SERIOUS,
            summary="Emergency reported.",
            confidence=0.8,
            input_language="en",
        )
        return _build_result(
            hospital=hospital,
            distance=1.2,
            emergency=emergency,
            required=[],
            preferred=[],
            user_lat=self.origin[0],
            user_lng=self.origin[1],
            language="en",
        )[0]

    def test_maps_url_sets_origin_and_destination_coordinates(self):
        hospital = self.make_hospital(verified=True, location_verified=True)
        result = self.build_result(hospital)

        self.assertIsNotNone(result.directions_url)
        parsed = urlparse(result.directions_url)
        params = parse_qs(parsed.query)
        self.assertEqual(parsed.scheme, "https")
        self.assertEqual(parsed.netloc, "www.google.com")
        self.assertEqual(parsed.path, "/maps/dir/")
        self.assertEqual(params["api"], ["1"])
        self.assertEqual(params["origin"], ["12.295800,76.639400"])
        self.assertEqual(params["destination"], ["12.302000,76.645000"])
        self.assertEqual(params["travelmode"], ["driving"])

    def test_unverified_hospital_and_pin_still_get_demo_directions(self):
        hospital = self.make_hospital(verified=False, location_verified=False)
        result = self.build_result(hospital)

        self.assertIsNotNone(result.directions_url)
        params = parse_qs(urlparse(result.directions_url).query)
        self.assertEqual(params["origin"], ["12.295800,76.639400"])
        self.assertEqual(params["destination"], ["12.302000,76.645000"])


if __name__ == "__main__":
    unittest.main()
