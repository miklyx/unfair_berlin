"use client";

import { FormEvent, useMemo, useState } from "react";

type Place = {
  id: number;
  name: string;
  address: string;
  lat: number;
  lng: number;
  deletedCount: number;
  platform: string;
  notes: string;
  googleRating: number | null;
  googleReviewCount: number | null;
};

type Submission = Place & {
  proofName: string;
};

type FeedbackType = "success" | "error" | null;
const RATING_DECIMAL_PLACES = 1;

const initialPlaces: Place[] = [
  {
    id: 1,
    name: "Cafe Sonnenhof",
    address: "Rykestraße 12, Berlin",
    lat: 52.5409,
    lng: 13.4233,
    deletedCount: 8,
    platform: "Google Maps",
    notes: "Multiple users reported review removals after legal threat emails.",
    googleRating: null,
    googleReviewCount: null,
  },
  {
    id: 2,
    name: "Restaurant Lindenblick",
    address: "Kottbusser Damm 44, Berlin",
    lat: 52.4935,
    lng: 13.4236,
    deletedCount: 5,
    platform: "Tripadvisor",
    notes: "Users shared screenshots of platform notices confirming deletion.",
    googleRating: null,
    googleReviewCount: null,
  },
];

const berlinBounds = {
  minLng: 13.0883,
  maxLng: 13.7612,
  minLat: 52.3383,
  maxLat: 52.6755,
};

function isWithinBerlinBounds(lat: number, lng: number) {
  return (
    lat >= berlinBounds.minLat &&
    lat <= berlinBounds.maxLat &&
    lng >= berlinBounds.minLng &&
    lng <= berlinBounds.maxLng
  );
}

function getMarkerPosition(place: Place) {
  const lngRatio =
    (place.lng - berlinBounds.minLng) / (berlinBounds.maxLng - berlinBounds.minLng);
  const latRatio =
    (berlinBounds.maxLat - place.lat) / (berlinBounds.maxLat - berlinBounds.minLat);

  return {
    left: `${lngRatio * 100}%`,
    top: `${latRatio * 100}%`,
  };
}

export default function Home() {
  const [places, setPlaces] = useState<Place[]>(initialPlaces);
  const [pendingSubmissions, setPendingSubmissions] = useState<Submission[]>([]);
  const [selectedPlaceId, setSelectedPlaceId] = useState<number | null>(initialPlaces[0]?.id ?? null);
  const [placeIdCounter, setPlaceIdCounter] = useState(
    initialPlaces.reduce((maxId, place) => Math.max(maxId, place.id), 0) + 1,
  );
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackType, setFeedbackType] = useState<FeedbackType>(null);
  const [dialogPlaceId, setDialogPlaceId] = useState<number | null>(null);
  const [ratingLoading, setRatingLoading] = useState(false);
  const [ratingError, setRatingError] = useState("");

  const selectedPlace = useMemo(
    () => places.find((place) => place.id === selectedPlaceId) ?? null,
    [places, selectedPlaceId],
  );

  const dialogPlace = useMemo(
    () => places.find((place) => place.id === dialogPlaceId) ?? null,
    [dialogPlaceId, places],
  );

  const topPlaces = useMemo(
    () => [...places].sort((a, b) => b.deletedCount - a.deletedCount).slice(0, 5),
    [places],
  );

  const totalReviews = useMemo(
    () => places.reduce((sum, place) => sum + place.deletedCount, 0),
    [places],
  );

  const approveSubmission = (submissionId: number) => {
    setPendingSubmissions((currentPending) => {
      const submission = currentPending.find((item) => item.id === submissionId);
      if (!submission) {
        return currentPending;
      }

      setPlaces((currentPlaces) => [
        ...currentPlaces,
        {
          id: submission.id,
          name: submission.name,
          address: submission.address,
          lat: submission.lat,
          lng: submission.lng,
          deletedCount: submission.deletedCount,
          platform: submission.platform,
          notes: submission.notes,
          googleRating: null,
          googleReviewCount: null,
        },
      ]);
      setSelectedPlaceId(submission.id);
      return currentPending.filter((item) => item.id !== submissionId);
    });
  };

  const rejectSubmission = (submissionId: number) => {
    setPendingSubmissions((currentPending) => currentPending.filter((item) => item.id !== submissionId));
  };

  const closePlaceDialog = () => {
    setDialogPlaceId(null);
    setRatingLoading(false);
    setRatingError("");
  };

  const openPlaceDialog = async (place: Place) => {
    setSelectedPlaceId(place.id);
    setDialogPlaceId(place.id);
    setRatingError("");

    if (place.googleRating !== null && place.googleReviewCount !== null) {
      return;
    }

    setRatingLoading(true);

    try {
      const response = await fetch(
        `/api/google-rating?name=${encodeURIComponent(place.name)}&address=${encodeURIComponent(place.address)}`,
      );
      if (!response.ok) {
        throw new Error("Failed to load rating");
      }

      const payload = (await response.json()) as {
        rating: number | null;
        reviewCount: number | null;
      };

      setPlaces((currentPlaces) =>
        currentPlaces.map((currentPlace) =>
          currentPlace.id === place.id
            ? {
                ...currentPlace,
                googleRating: payload.rating,
                googleReviewCount: payload.reviewCount,
              }
            : currentPlace,
        ),
      );
    } catch {
      setRatingError("Could not load Google Maps rating.");
    } finally {
      setRatingLoading(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    const proof = formData.get("proof");
    if (!(proof instanceof File) || !proof.name) {
      setFeedbackType("error");
      setFeedbackMessage("Please upload a proof screenshot or moderation letter.");
      return;
    }

    const name = String(formData.get("name") ?? "").trim();
    const address = String(formData.get("address") ?? "").trim();
    const lat = Number.parseFloat(String(formData.get("lat") ?? ""));
    const lng = Number.parseFloat(String(formData.get("lng") ?? ""));
    const deletedCount = Number.parseInt(String(formData.get("deletedCount") ?? ""), 10);
    const platform = String(formData.get("platform") ?? "");
    const notes = String(formData.get("notes") ?? "").trim();

    if (!name || !address) {
      setFeedbackType("error");
      setFeedbackMessage("Place name and address are required.");
      return;
    }

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setFeedbackType("error");
      setFeedbackMessage("Latitude and longitude must be valid numbers.");
      return;
    }

    if (!isWithinBerlinBounds(lat, lng)) {
      setFeedbackType("error");
      setFeedbackMessage("Coordinates must be within Berlin city bounds.");
      return;
    }

    if (!Number.isFinite(deletedCount) || deletedCount < 1) {
      setFeedbackType("error");
      setFeedbackMessage("Deleted reviews count must be at least 1.");
      return;
    }

    const submission: Submission = {
      id: placeIdCounter,
      name,
      address,
      lat,
      lng,
      deletedCount,
      platform,
      notes,
      googleRating: null,
      googleReviewCount: null,
      proofName: proof.name,
    };

    setPendingSubmissions((currentPending) => [...currentPending, submission]);
    setPlaceIdCounter((currentCounter) => currentCounter + 1);
    setFeedbackType("success");
    setFeedbackMessage("Submission sent to moderation queue.");
    form.reset();
  };

  return (
    <>
      <main className="app-shell unfair-page">
        <section className="map" aria-label="Map of unfair places">
          <iframe
            id="osm-frame"
            title="OpenStreetMap Berlin"
            src="https://www.openstreetmap.org/export/embed.html?bbox=13.0883%2C52.3383%2C13.7612%2C52.6755&amp;layer=mapnik"
          />
          <div className="pin-layer" aria-label="Place pins">
            {places
              .filter((place) => isWithinBerlinBounds(place.lat, place.lng))
              .map((place) => {
                const markerPosition = getMarkerPosition(place);
                const title = `${place.name} — ${place.deletedCount} deleted reviews`;

                return (
                  <button
                    key={place.id}
                    type="button"
                    className={`map-pin${selectedPlaceId === place.id ? " selected" : ""}`}
                    style={markerPosition}
                    title={title}
                    aria-label={title}
                    onClick={() => {
                      openPlaceDialog(place);
                    }}
                  />
                );
              })}
          </div>
        </section>

        <aside className="details-panel">
          <h1>Unfair Berlin</h1>
          <p className="intro">Community map of Berlin places reported for deleting fair negative reviews.</p>

          <section className="panel-block">
            <h2>Place details</h2>
            <div className="selected-place">
              {!selectedPlace && "Select a map pin to see details."}
              {selectedPlace && (
                <>
                  <strong>{selectedPlace.name}</strong>
                  <br />
                  {selectedPlace.address}
                  <br />
                  Deleted reviews: <strong>{selectedPlace.deletedCount}</strong>
                  <br />
                  Platform: {selectedPlace.platform}
                  {selectedPlace.notes && (
                    <>
                      <br />
                      Notes: {selectedPlace.notes}
                    </>
                  )}
                </>
              )}
            </div>
          </section>

          <section className="panel-block">
            <h2>Submit a place</h2>
            <form onSubmit={handleSubmit}>
              <label>
                Place name
                <input id="name" name="name" required />
              </label>
              <label>
                Address
                <input id="address" name="address" required />
              </label>
              <div className="coords-grid">
                <label>
                  Latitude
                  <input
                    id="lat"
                    name="lat"
                    type="number"
                    step="0.000001"
                    min={berlinBounds.minLat}
                    max={berlinBounds.maxLat}
                    required
                  />
                </label>
                <label>
                  Longitude
                  <input
                    id="lng"
                    name="lng"
                    type="number"
                    step="0.000001"
                    min={berlinBounds.minLng}
                    max={berlinBounds.maxLng}
                    required
                  />
                </label>
              </div>
              <label>
                Deleted reviews count
                <input id="deletedCount" name="deletedCount" type="number" min={1} required />
              </label>
              <label>
                Platform
                <select id="platform" name="platform" required>
                  <option value="Google Maps">Google Maps</option>
                  <option value="Tripadvisor">Tripadvisor</option>
                  <option value="Yelp">Yelp</option>
                  <option value="Other">Other</option>
                </select>
              </label>
              <label>
                Proof screenshot / letter
                <input id="proof" name="proof" type="file" accept="image/*,.pdf" required />
              </label>
              <label>
                Notes
                <textarea id="notes" name="notes" rows={2} />
              </label>
              <button type="submit">Submit for moderation</button>
              <p className={`form-feedback${feedbackType ? ` ${feedbackType}` : ""}`} aria-live="polite">
                {feedbackMessage}
              </p>
            </form>
          </section>

          <section className="panel-block">
            <h2>Moderation queue</h2>
            <ul className="moderation-list">
              {!pendingSubmissions.length && <li>No pending submissions.</li>}
              {pendingSubmissions.map((submission) => (
                <li key={submission.id} className="moderation-item">
                  <strong>{submission.name}</strong>
                  <br />
                  {submission.address}
                  <br />
                  {submission.deletedCount} deleted reviews on {submission.platform}
                  <br />
                  Proof: {submission.proofName}
                  <div className="moderation-actions">
                    <button type="button" onClick={() => approveSubmission(submission.id)}>
                      Approve
                    </button>
                    <button
                      type="button"
                      className="reject-btn"
                      onClick={() => rejectSubmission(submission.id)}
                    >
                      Reject
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </main>

      <section className="stats-panel unfair-page">
        <h2>Statistics</h2>
        <div className="stats-grid">
          <div className="stat-card">
            <strong>{places.length}</strong>
            <span>Approved places</span>
          </div>
          <div className="stat-card">
            <strong>{totalReviews}</strong>
            <span>Reported deleted reviews</span>
          </div>
          <div className="stat-card">
            <strong>{pendingSubmissions.length}</strong>
            <span>Pending moderation</span>
          </div>
        </div>
        <ul className="top-places">
          {topPlaces.map((place) => (
            <li key={place.id}>
              {place.name}: {place.deletedCount} deleted reviews
            </li>
          ))}
        </ul>
      </section>

      {dialogPlace && (
        <div
          className="place-dialog-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={`Details for ${dialogPlace.name}`}
        >
          <div className="place-dialog">
            <div className="place-dialog-header">
              <h3>{dialogPlace.name}</h3>
              <button type="button" className="place-dialog-close" onClick={closePlaceDialog}>
                Close
              </button>
            </div>
            <p>
              Google Maps rating:{" "}
              <strong>
                {dialogPlace.googleRating !== null
                  ? dialogPlace.googleRating.toFixed(RATING_DECIMAL_PLACES)
                  : "Not available"}
              </strong>
            </p>
            <p>
              Google reviews:{" "}
              <strong>
                {dialogPlace.googleReviewCount !== null
                  ? dialogPlace.googleReviewCount.toLocaleString()
                  : "Not available"}
              </strong>
            </p>
            <p>
              Deleted reviews: <strong>{dialogPlace.deletedCount}</strong>
            </p>
            {ratingLoading && <p className="place-dialog-meta">Loading rating…</p>}
            {ratingError && <p className="place-dialog-error">{ratingError}</p>}
          </div>
        </div>
      )}
    </>
  );
}
