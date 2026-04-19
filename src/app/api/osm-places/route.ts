import { NextResponse } from "next/server";

type OverpassElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: {
    lat: number;
    lon: number;
  };
  tags?: Record<string, string | undefined>;
};

const BERLIN_BBOX = "52.3383,13.0883,52.6755,13.7612";
const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";

function buildAddress(tags: Record<string, string | undefined> | undefined) {
  if (!tags) {
    return "";
  }

  const street = tags["addr:street"];
  const houseNumber = tags["addr:housenumber"];
  const postcode = tags["addr:postcode"];
  const city = tags["addr:city"];

  return [
    [street, houseNumber].filter(Boolean).join(" "),
    [postcode, city].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");
}

export async function GET() {
  const query = `
[out:json][timeout:25];
(
  nwr["amenity"~"^(cafe|restaurant|bar|pub|nightclub)$"](${BERLIN_BBOX});
);
out center 700;
`;

  try {
    const response = await fetch(OVERPASS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=UTF-8",
      },
      body: query,
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Overpass responded with HTTP ${response.status}`);
    }

    const payload = (await response.json()) as { elements?: OverpassElement[] };

    const places = (payload.elements ?? [])
      .map((element) => {
        const lat = element.lat ?? element.center?.lat;
        const lng = element.lon ?? element.center?.lon;

        if (typeof lat !== "number" || typeof lng !== "number") {
          return null;
        }

        const tags = element.tags ?? {};
        const amenity = tags.amenity ?? "unknown";
        const address = buildAddress(tags);

        return {
          id: `${element.type}-${element.id}`,
          name: tags.name?.trim() || "Unnamed place",
          address: address || tags["addr:full"] || "Address unavailable",
          lat,
          lng,
          amenity,
        };
      })
      .filter((place): place is NonNullable<typeof place> => place !== null);

    return NextResponse.json({ places });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not load OSM places.",
      },
      { status: 502 },
    );
  }
}
