import unittest
from fastapi.testclient import TestClient
from backend.main import app


class HospitalBedTests(unittest.TestCase):
    def test_list_admin_hospitals(self):
        with TestClient(app) as client:
            response = client.get("/api/admin/hospitals")
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertIn("hospitals", data)
            self.assertGreaterEqual(len(data["hospitals"]), 23)
            h = data["hospitals"][0]
            self.assertIn("department_beds", h)
            self.assertIn("total_beds", h)
            self.assertIn("available_beds", h)

    def test_get_hospital_beds(self):
        with TestClient(app) as client:
            response = client.get("/api/admin/hospitals/hosp_002/beds")
            self.assertEqual(response.status_code, 200)
            data = response.json()
            self.assertEqual(data["hospital_id"], "hosp_002")
            self.assertEqual(data["hospital_name"], "JSS Hospital")
            self.assertGreater(len(data["department_beds"]), 0)

    def test_update_hospital_beds(self):
        with TestClient(app) as client:
            get_res = client.get("/api/admin/hospitals/hosp_006/beds")
            self.assertEqual(get_res.status_code, 200)
            beds = get_res.json()["department_beds"]

            orig_avail = beds[0]["available"]
            new_avail = max(1, orig_avail - 1)
            beds[0]["available"] = new_avail

            update_res = client.put(
                "/api/admin/hospitals/hosp_006/beds",
                json={"department_beds": beds, "updated_by": "Dr. Test"},
            )
            self.assertEqual(update_res.status_code, 200)
            data = update_res.json()
            self.assertTrue(data["success"])
            self.assertEqual(data["department_beds"][0]["available"], new_avail)

            # Restore original
            beds[0]["available"] = orig_avail
            client.put(
                "/api/admin/hospitals/hosp_006/beds",
                json={"department_beds": beds},
            )

    def test_update_hospital_beds_exceeds_total(self):
        with TestClient(app) as client:
            get_res = client.get("/api/admin/hospitals/hosp_006/beds")
            beds = get_res.json()["department_beds"]
            beds[0]["available"] = beds[0]["total"] + 100

            update_res = client.put(
                "/api/admin/hospitals/hosp_006/beds",
                json={"department_beds": beds},
            )
            self.assertEqual(update_res.status_code, 422)


if __name__ == "__main__":
    unittest.main()
