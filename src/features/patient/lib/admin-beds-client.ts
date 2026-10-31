import { DepartmentBedCount, DepartmentBedCountSchema } from "./contracts";
import { z } from "zod";

export const AdminHospitalSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  address: z.string(),
  phone: z.string(),
  total_beds: z.number().int().nonnegative(),
  available_beds: z.number().int().nonnegative(),
  department_beds: z.array(DepartmentBedCountSchema).default([]),
});

export type AdminHospitalSummary = z.infer<typeof AdminHospitalSummarySchema>;

export const AdminHospitalDetailSchema = z.object({
  hospital_id: z.string(),
  hospital_name: z.string(),
  total_beds: z.number().int().nonnegative(),
  available_beds: z.number().int().nonnegative(),
  department_beds: z.array(DepartmentBedCountSchema),
});

export type AdminHospitalDetail = z.infer<typeof AdminHospitalDetailSchema>;

function getApiUrl(): string {
  return (
    process.env.NEXT_PUBLIC_TRIAGE_API_URL ?? "http://localhost:8000"
  ).replace(/\/$/, "");
}

export async function fetchAdminHospitals(): Promise<AdminHospitalSummary[]> {
  const url = `${getApiUrl()}/api/admin/hospitals`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to load hospitals: ${res.statusText}`);
  }
  const json = await res.json();
  return z.array(AdminHospitalSummarySchema).parse(json.hospitals);
}

export async function fetchHospitalBeds(
  hospitalId: string,
): Promise<AdminHospitalDetail> {
  const url = `${getApiUrl()}/api/admin/hospitals/${encodeURIComponent(hospitalId)}/beds`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to load hospital beds: ${res.statusText}`);
  }
  const json = await res.json();
  return AdminHospitalDetailSchema.parse(json);
}

export async function updateHospitalBeds(
  hospitalId: string,
  departmentBeds: DepartmentBedCount[],
  updatedBy: string = "Hospital Staff",
): Promise<AdminHospitalDetail> {
  const url = `${getApiUrl()}/api/admin/hospitals/${encodeURIComponent(hospitalId)}/beds`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      department_beds: departmentBeds,
      updated_by: updatedBy,
    }),
  });
  if (!res.ok) {
    const errorJson = await res.json().catch(() => null);
    throw new Error(
      errorJson?.detail || `Failed to update beds: ${res.statusText}`,
    );
  }
  const json = await res.json();
  return AdminHospitalDetailSchema.parse(json);
}
