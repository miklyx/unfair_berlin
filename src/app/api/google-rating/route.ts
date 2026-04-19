import { NextRequest, NextResponse } from "next/server";

const SEARCH_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const MAX_RATING_REVIEW_GAP = 60;
const FALLBACK_PATTERN = new RegExp(
  `([0-9]+(?:[.,][0-9]+)?)\\s*stars?[\\s:|()\\-—]{0,${MAX_RATING_REVIEW_GAP}}?([\\d\\s.,]+)\\s*reviews?`,
  "i",
);

function parseNumber(value: string) {
  return Number.parseFloat(value.replace(",", "."));
}

function parseCount(value: string) {
  return Number.parseInt(value.replace(/[^\d]/g, ""), 10);
}

function extractGoogleRating(html: string) {
  const aggregatePattern =
    /"aggregateRating":\{"@type":"AggregateRating","ratingValue":"([\d.,]+)","reviewCount":"([\d\s.,]+)"/;
  const aggregateMatch = html.match(aggregatePattern);
  if (aggregateMatch) {
    const rating = parseNumber(aggregateMatch[1]);
    const reviewCount = parseCount(aggregateMatch[2]);
    if (Number.isFinite(rating) && Number.isFinite(reviewCount)) {
      return { rating, reviewCount };
    }
  }

  // Limit the gap between rating and reviews to avoid matching unrelated numbers from distant text.
  const fallbackMatch = html.match(FALLBACK_PATTERN);
  if (fallbackMatch) {
    const rating = parseNumber(fallbackMatch[1]);
    const reviewCount = parseCount(fallbackMatch[2]);
    if (Number.isFinite(rating) && Number.isFinite(reviewCount)) {
      return { rating, reviewCount };
    }
  }

  return { rating: null, reviewCount: null };
}

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name")?.trim();
  const address = request.nextUrl.searchParams.get("address")?.trim();

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const query = `${name} ${address ?? ""} Google Maps`;
  const url = `https://www.google.com/search?hl=en&q=${encodeURIComponent(query)}`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": SEARCH_USER_AGENT,
        "Accept-Language": "en-US,en;q=0.9",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json({ error: "Google request failed", rating: null, reviewCount: null }, { status: 502 });
    }

    const html = await response.text();
    const { rating, reviewCount } = extractGoogleRating(html);

    return NextResponse.json({ rating, reviewCount });
  } catch {
    return NextResponse.json(
      { error: "Unable to reach Google for rating lookup", rating: null, reviewCount: null },
      { status: 502 },
    );
  }
}
