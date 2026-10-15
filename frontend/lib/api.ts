export type User = {
  phone_number: string;
  user_name: string;
  kode_outlet: string;
  kode_distributor: string;
  outlet_name: string;
  distributor_name: string;
};
export type Product = {
  kode_sku: string;
  nama_sku: string;
  image_url: string;
  harga_jual: number;
};
export type Line = Product & { quantity: number; total_price: number };
export type Order = {
  order_number: string;
  order_date: string;
  order_status: string;
  kode_outlet: string;
  kode_distributor: string;
  outlet_name: string;
  distributor_name: string;
  total_price: number;
  total_quantity: number;
  items?: Line[];
};
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  const data = await response
    .json()
    .catch(() => ({ error: "Respons server tidak valid." }));
  if (!response.ok) {
    if (
      response.status === 401 &&
      !path.includes("/auth/login") &&
      !path.includes("/auth/me")
    )
      window.dispatchEvent(new Event("session-expired"));
    throw new ApiError(data.error || "Permintaan gagal.", response.status);
  }
  return data as T;
}
export const rupiah = (v: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(v);
export const date = (v: string) =>
  new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date(v));
