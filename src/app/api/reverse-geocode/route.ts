import { NextRequest, NextResponse } from "next/server";

const BERLIN_BOUNDS = {
  minLng: 13.0883,
  maxLng: 13.7612,
  minLat: 52.3383,
  maxLat: 52.6755,
};

const NOMINATIM_ENDPOINT = "https://nominatim.openstreetmap.org/reverse";

function isWithinBerlinBounds(lat: number, lng: number) {
  return (
    lat >= BERLIN_BOUNDS.minLat &&
    lat <= BERLIN_BOUNDS.maxLat &&
    lng >= BERLIN_BOUNDS.minLng &&
    lng <= BERLIN_BOUNDS.maxLng
  );
}

export async function GET(request: NextRequest) {
  const lat = Number.parseFloat(request.nextUrl.searchParams.get("lat") ?? "");
  const lng = Number.parseFloat(request.nextUrl.searchParams.get("lng") ?? "");

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat and lng must be valid numbers." }, { status: 400 });
  }

  if (!isWithinBerlinBounds(lat, lng)) {
    return NextResponse.json({ error: "Coordinates must be within Berlin bounds." }, { status: 400 });
  }

  const nominatimUrl = `${NOMINATIM_ENDPOINT}?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(
    lng,
  )}&zoom=18&addressdetails=1`;

  try {
    const response = await fetch(nominatimUrl, {
      headers: {
        "User-Agent": "unfair_berlin/1.0",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Nominatim responded with HTTP ${response.status}`);
    }

    const payload = (await response.json()) as {
      display_name?: string;
      name?: string;
    };

    const address = payload.display_name?.trim() || payload.name?.trim() || "Address unavailable";

    return NextResponse.json({ address });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not resolve address.",
      },
      { status: 502 },
    );
  }
}
