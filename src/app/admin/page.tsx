import HospitalBedAdmin from "@/features/patient/components/hospital-bed-admin";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Hospital Bed Availability Admin | Sanjeevani",
  description:
    "Live hospital bed and emergency department occupancy management for hospital staff.",
};

export default function AdminPage() {
  return <HospitalBedAdmin />;
}
