import { vtEnv } from "@/lib/vtcall-env";

export type ShowpeerResult = {
  ok: boolean;
  status: number | null;
  active: boolean;
  count: number;
  calls: any[];
  providerMessage: string | null;
};

export async function readShowpeer(extension: string, token: string): Promise<ShowpeerResult> {
  const base = vtEnv("VTCALL_SHOWPEER_URL", "https://api23.vtcall.app/API/showpeer");

  try {
    const url = new URL(base);
    url.searchParams.set("ramal", extension);

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        access_token: token,
        "access-token": token,
      },
      cache: "no-store",
      redirect: "follow",
    });

    const raw = await response.text();
    let data: any = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = raw || null;
    }

    const calls = Array.isArray(data) ? data : [];
    return {
      ok: response.ok,
      status: response.status,
      active: response.ok && calls.length > 0,
      count: response.ok ? calls.length : 0,
      calls: response.ok ? calls.slice(0, 10) : [],
      providerMessage: !response.ok ? String(raw || "").slice(0, 250) : null,
    };
  } catch (e: any) {
    return {
      ok: false,
      status: null,
      active: false,
      count: 0,
      calls: [],
      providerMessage: String(e?.message || e).slice(0, 250),
    };
  }
}
