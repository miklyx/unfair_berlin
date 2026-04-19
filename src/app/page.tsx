"use client";

import { ChangeEvent, FormEvent, MouseEvent, useEffect, useMemo, useState } from "react";

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

type OSMPlace = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  amenity: string;
};

type FormValues = {
  name: string;
  address: string;
  lat: string;
  lng: string;
  deletedCount: string;
  platform: string;
  notes: string;
};

type Coordinates = { lat: number; lng: number };

type FeedbackType = "success" | "error" | null;
const RATING_DECIMAL_PLACES = 1;
const COORDINATE_DECIMAL_PLACES = 6;
const initialFormValues: FormValues = {
  name: "",
  address: "",
  lat: "",
  lng: "",
  deletedCount: "1",
  platform: "Google Maps",
  notes: "",
};

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

function getMarkerPosition(coords: Coordinates) {
  const lngRatio =
    (coords.lng - berlinBounds.minLng) / (berlinBounds.maxLng - berlinBounds.minLng);
  const latRatio =
    (berlinBounds.maxLat - coords.lat) / (berlinBounds.maxLat - berlinBounds.minLat);

  return {
    left: `${lngRatio * 100}%`,
    top: `${latRatio * 100}%`,
  };
}

export default function Home() {
  const [places, setPlaces] = useState<Place[]>(initialPlaces);
  const [pendingSubmissions, setPendingSubmissions] = useState<Submission[]>([]);
  const [formValues, setFormValues] = useState<FormValues>(initialFormValues);
  const [osmPlaces, setOsmPlaces] = useState<OSMPlace[]>([]);
  const [osmError, setOsmError] = useState("");
  const [mapSelection, setMapSelection] = useState<{ lat: number; lng: number } | null>(null);
  const [mapSelectionLoading, setMapSelectionLoading] = useState(false);
  const [selectedPlaceId, setSelectedPlaceId] = useState<number | null>(initialPlaces[0]?.id ?? null);
  const [placeIdCounter, setPlaceIdCounter] = useState(
    initialPlaces.reduce((maxId, place) => Math.max(maxId, place.id), 0) + 1,
  );
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackType, setFeedbackType] = useState<FeedbackType>(null);
  const [isSubmissionFormOpen, setIsSubmissionFormOpen] = useState(false);
  const [isMapPickMode, setIsMapPickMode] = useState(false);
  const [dialogPlaceId, setDialogPlaceId] = useState<number | null>(null);
  const [ratingLoadingPlaceId, setRatingLoadingPlaceId] = useState<number | null>(null);
  const [ratingErrorState, setRatingErrorState] = useState<{ placeId: number | null; message: string }>({
    placeId: null,
    message: "",
  });

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

  useEffect(() => {
    let aborted = false;

    const loadOsmPlaces = async () => {
      try {
        const response = await fetch("/api/osm-places");
        if (!response.ok) {
          throw new Error(`Failed to load OSM places (HTTP ${response.status})`);
        }

        const payload = (await response.json()) as { places?: OSMPlace[] };
        if (!aborted) {
          setOsmPlaces(Array.isArray(payload.places) ? payload.places : []);
          setOsmError("");
        }
      } catch (error) {
        if (!aborted) {
          setOsmError(error instanceof Error ? error.message : "Could not load OSM places.");
        }
      }
    };

    void loadOsmPlaces();

    return () => {
      aborted = true;
    };
  }, []);

  const handleFormFieldChange = (
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = event.currentTarget;
    setFormValues((currentValues) => ({
      ...currentValues,
      [name]: value,
    }));
  };

  const prefillAddressFromCoordinates = async (lat: number, lng: number) => {
    setMapSelection({ lat, lng });
    setMapSelectionLoading(true);
    setFormValues((currentValues) => ({
      ...currentValues,
      lat: lat.toFixed(COORDINATE_DECIMAL_PLACES),
      lng: lng.toFixed(COORDINATE_DECIMAL_PLACES),
    }));

    try {
      const response = await fetch(
        `/api/reverse-geocode?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`,
      );
      if (!response.ok) {
        throw new Error(`Failed to resolve address (HTTP ${response.status})`);
      }

      const payload = (await response.json()) as { address?: string };
      setFormValues((currentValues) => ({
        ...currentValues,
        address: payload.address?.trim() || currentValues.address,
      }));
      setFeedbackType("success");
      setFeedbackMessage("Coordinates and address were filled from map click.");
    } catch (error) {
      setFeedbackType("error");
      setFeedbackMessage(
        error instanceof Error
          ? `${error.message} Coordinates were filled; please complete address manually.`
          : "Could not resolve address. Coordinates were filled.",
      );
    } finally {
      setMapSelectionLoading(false);
    }
  };

  const handleMapClick = (event: MouseEvent<HTMLDivElement>) => {
    // Ignore clicks on map pins; only bare-map clicks should prefill coordinates.
    if (event.target !== event.currentTarget) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return;
    }

    const xRatio = (event.clientX - rect.left) / rect.width;
    const yRatio = (event.clientY - rect.top) / rect.height;
    const lng = berlinBounds.minLng + xRatio * (berlinBounds.maxLng - berlinBounds.minLng);
    const lat = berlinBounds.maxLat - yRatio * (berlinBounds.maxLat - berlinBounds.minLat);

    setIsMapPickMode(false);
    void prefillAddressFromCoordinates(lat, lng);
  };

  const handleOsmPlaceClick = (place: OSMPlace) => {
    setMapSelection({ lat: place.lat, lng: place.lng });
    setFormValues((currentValues) => ({
      ...currentValues,
      name: place.name,
      address: place.address,
      lat: place.lat.toFixed(COORDINATE_DECIMAL_PLACES),
      lng: place.lng.toFixed(COORDINATE_DECIMAL_PLACES),
    }));
    setFeedbackType("success");
    setFeedbackMessage("OSM place copied to the submission form.");
  };

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
    setRatingLoadingPlaceId(null);
    setRatingErrorState({ placeId: null, message: "" });
  };

  const openPlaceDialog = async (place: Place) => {
    setSelectedPlaceId(place.id);
    setDialogPlaceId(place.id);
    setRatingErrorState({ placeId: null, message: "" });

    if (place.googleRating !== null && place.googleReviewCount !== null) {
      return;
    }

    setRatingLoadingPlaceId(place.id);

    try {
      const response = await fetch(
        `/api/google-rating?name=${encodeURIComponent(place.name)}&address=${encodeURIComponent(place.address)}`,
      );
      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(errorPayload?.error ?? `Failed to load rating (HTTP ${response.status})`);
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
    } catch (error) {
      setRatingErrorState({
        placeId: place.id,
        message: error instanceof Error ? error.message : "Could not load Google Maps rating.",
      });
    } finally {
      setRatingLoadingPlaceId(null);
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

    const name = formValues.name.trim();
    const address = formValues.address.trim();
    const lat = Number.parseFloat(formValues.lat);
    const lng = Number.parseFloat(formValues.lng);
    const deletedCount = Number.parseInt(formValues.deletedCount, 10);
    const platform = formValues.platform;
    const notes = formValues.notes.trim();

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
    setFormValues(initialFormValues);
    setMapSelection(null);
    setIsMapPickMode(false);
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
          <div
            className={`pin-layer${isMapPickMode ? " picking" : ""}`}
            aria-label="Place pins"
            onClick={handleMapClick}
          >
            {osmPlaces
              .filter((place) => isWithinBerlinBounds(place.lat, place.lng))
              .map((place) => {
                const osmMarkerPosition = getMarkerPosition(place);
                const title = `${place.name} (${place.amenity})`;

                return (
                  <button
                    key={place.id}
                    type="button"
                    className="map-pin map-pin-muted"
                    style={osmMarkerPosition}
                    title={title}
                    aria-label={title}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleOsmPlaceClick(place);
                    }}
                  />
                );
              })}
            {places
              .filter((place) => isWithinBerlinBounds(place.lat, place.lng))
              .map((place) => {
                const placeMarkerPosition = getMarkerPosition(place);
                const title = `${place.name} — ${place.deletedCount} deleted reviews`;

                return (
                  <button
                    key={place.id}
                    type="button"
                    className={`map-pin${selectedPlaceId === place.id ? " selected" : ""}`}
                    style={placeMarkerPosition}
                    title={title}
                    aria-label={title}
                    onClick={(event) => {
                      event.stopPropagation();
                      openPlaceDialog(place);
                    }}
                  />
                );
              })}
            {mapSelection && (
              <span
                className={`map-selection-pin${mapSelectionLoading ? " loading" : ""}`}
                style={getMarkerPosition(mapSelection)}
                aria-label="Selected coordinates"
              />
            )}
          </div>
        </section>

        <aside className="details-panel">
          <h1>Unfair Berlin</h1>
          <p className="intro">Community map of Berlin places reported for deleting fair negative reviews.</p>
          <p className="map-hint">
            Use &quot;Pick on map&quot; in the form to choose coordinates, or click muted OSM places (cafes, restaurants,
            bars, pubs, nightclubs).
          </p>
          {osmError && <p className="form-feedback error">{osmError}</p>}

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

          <section className="panel-block collapsible-panel">
            <button
              type="button"
              className={`panel-toggle${isSubmissionFormOpen ? " open" : ""}`}
              aria-expanded={isSubmissionFormOpen}
              aria-controls="submit-place-panel"
              onClick={() => {
                setIsSubmissionFormOpen((current) => !current);
                setIsMapPickMode(false);
              }}
            >
              <span className="panel-toggle-icon" aria-hidden="true">
                ▸
              </span>
              Submit a place
              <span className="sr-only">
                {isSubmissionFormOpen ? " (expanded)" : " (collapsed)"}
              </span>
            </button>
            {isSubmissionFormOpen && (
              <form id="submit-place-panel" onSubmit={handleSubmit}>
                <button
                  type="button"
                  className={`map-pick-button${isMapPickMode ? " active" : ""}`}
                  onClick={() => setIsMapPickMode((current) => !current)}
                >
                  {isMapPickMode ? "Cancel map pick" : "Pick on map"}
                </button>
              <label>
                Place name
                <input id="name" name="name" value={formValues.name} onChange={handleFormFieldChange} required />
              </label>
              <label>
                Address
                <input
                  id="address"
                  name="address"
                  value={formValues.address}
                  onChange={handleFormFieldChange}
                  required
                />
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
                    value={formValues.lat}
                    onChange={handleFormFieldChange}
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
                    value={formValues.lng}
                    onChange={handleFormFieldChange}
                    required
                  />
                </label>
              </div>
              <label>
                Deleted reviews count
                <input
                  id="deletedCount"
                  name="deletedCount"
                  type="number"
                  min={1}
                  value={formValues.deletedCount}
                  onChange={handleFormFieldChange}
                  required
                />
              </label>
              <label>
                Platform
                <select
                  id="platform"
                  name="platform"
                  value={formValues.platform}
                  onChange={handleFormFieldChange}
                  required
                >
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
                <textarea id="notes" name="notes" rows={2} value={formValues.notes} onChange={handleFormFieldChange} />
              </label>
              <button type="submit">Submit for moderation</button>
              <p className={`form-feedback${feedbackType ? ` ${feedbackType}` : ""}`} aria-live="polite">
                {feedbackMessage}
              </p>
              </form>
            )}
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
            {ratingLoadingPlaceId === dialogPlace.id && <p className="place-dialog-meta">Loading rating…</p>}
            {ratingErrorState.placeId === dialogPlace.id && ratingErrorState.message && (
              <p className="place-dialog-error">{ratingErrorState.message}</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
