"use client";

import { ChangeEvent, FormEvent, MouseEvent, WheelEvent, useEffect, useMemo, useRef, useState } from "react";

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
type MapBounds = {
  minLng: number;
  maxLng: number;
  minLat: number;
  maxLat: number;
};
type MapClickInfo = {
  title: string;
  lat: number;
  lng: number;
  address: string;
  loading: boolean;
  error: string;
};

type FeedbackType = "success" | "error" | null;
const RATING_DECIMAL_PLACES = 1;
const COORDINATE_DECIMAL_PLACES = 6;
const MAP_DRAG_THRESHOLD_PIXELS = 6;
const MAP_MIN_ZOOM_STEP = 0;
const MAP_MAX_ZOOM_STEP = 5;
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

const berlinBounds: MapBounds = {
  minLng: 13.0883,
  maxLng: 13.7612,
  minLat: 52.3383,
  maxLat: 52.6755,
};

function isWithinBounds(lat: number, lng: number, bounds: MapBounds) {
  return (
    lat >= bounds.minLat &&
    lat <= bounds.maxLat &&
    lng >= bounds.minLng &&
    lng <= bounds.maxLng
  );
}

function isWithinBerlinBounds(lat: number, lng: number) {
  return isWithinBounds(lat, lng, berlinBounds);
}

function latToMercatorY(lat: number) {
  const boundedLat = Math.min(Math.max(lat, -85.05112878), 85.05112878);
  const latRadians = (boundedLat * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + latRadians / 2));
}

function mercatorYToLat(mercatorY: number) {
  return (Math.atan(Math.sinh(mercatorY)) * 180) / Math.PI;
}

const berlinMercatorBounds = {
  minY: latToMercatorY(berlinBounds.minLat),
  maxY: latToMercatorY(berlinBounds.maxLat),
};

function getMarkerPosition(coords: Coordinates, bounds: MapBounds) {
  const minY = latToMercatorY(bounds.minLat);
  const maxY = latToMercatorY(bounds.maxLat);
  const coordsY = latToMercatorY(coords.lat);
  const lngRatio =
    (coords.lng - bounds.minLng) / (bounds.maxLng - bounds.minLng);
  const latRatio = (maxY - coordsY) / (maxY - minY);

  return {
    left: `${lngRatio * 100}%`,
    top: `${latRatio * 100}%`,
  };
}

function getMapSpanForZoomStep(zoomStep: number) {
  const lngSpan = (berlinBounds.maxLng - berlinBounds.minLng) / 2 ** zoomStep;
  const ySpan = (berlinMercatorBounds.maxY - berlinMercatorBounds.minY) / 2 ** zoomStep;

  return {
    lngSpan,
    ySpan,
  };
}

function getMapBoundsForViewport(center: Coordinates, zoomStep: number): MapBounds {
  const { lngSpan, ySpan } = getMapSpanForZoomStep(zoomStep);
  const centerY = latToMercatorY(center.lat);
  const minY = centerY - ySpan / 2;
  const maxY = centerY + ySpan / 2;

  return {
    minLng: center.lng - lngSpan / 2,
    maxLng: center.lng + lngSpan / 2,
    minLat: mercatorYToLat(minY),
    maxLat: mercatorYToLat(maxY),
  };
}

function clampMapCenter(center: Coordinates, zoomStep: number) {
  const { lngSpan, ySpan } = getMapSpanForZoomStep(zoomStep);
  const minCenterLng = berlinBounds.minLng + lngSpan / 2;
  const maxCenterLng = berlinBounds.maxLng - lngSpan / 2;
  const minCenterY = berlinMercatorBounds.minY + ySpan / 2;
  const maxCenterY = berlinMercatorBounds.maxY - ySpan / 2;
  const centerY = latToMercatorY(center.lat);
  const clampedCenterY = Math.min(Math.max(centerY, minCenterY), maxCenterY);

  return {
    lng: Math.min(Math.max(center.lng, minCenterLng), maxCenterLng),
    lat: mercatorYToLat(clampedCenterY),
  };
}

function formatCoordinates(lat: number, lng: number) {
  return `${lat.toFixed(COORDINATE_DECIMAL_PLACES)}, ${lng.toFixed(COORDINATE_DECIMAL_PLACES)}`;
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
  const [mapZoomStep, setMapZoomStep] = useState(MAP_MIN_ZOOM_STEP);
  const [mapCenter, setMapCenter] = useState<Coordinates>({
    lat: (berlinBounds.minLat + berlinBounds.maxLat) / 2,
    lng: (berlinBounds.minLng + berlinBounds.maxLng) / 2,
  });
  const [isDraggingMap, setIsDraggingMap] = useState(false);
  const [mapClickInfo, setMapClickInfo] = useState<MapClickInfo | null>(null);
  const [dialogPlaceId, setDialogPlaceId] = useState<number | null>(null);
  const [ratingLoadingPlaceId, setRatingLoadingPlaceId] = useState<number | null>(null);
  const [ratingErrorState, setRatingErrorState] = useState<{ placeId: number | null; message: string }>({
    placeId: null,
    message: "",
  });
  const mapRef = useRef<HTMLElement | null>(null);
  const mapDragStateRef = useRef<{ startX: number; startY: number; startCenter: Coordinates } | null>(null);
  const didMapDragRef = useRef(false);
  const mapClickRequestRef = useRef(0);

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
  const mapBounds = useMemo(() => getMapBoundsForViewport(mapCenter, mapZoomStep), [mapCenter, mapZoomStep]);
  const mapEmbedUrl = useMemo(
    () =>
      `https://www.openstreetmap.org/export/embed.html?bbox=${mapBounds.minLng}%2C${mapBounds.minLat}%2C${mapBounds.maxLng}%2C${mapBounds.maxLat}&amp;layer=mapnik`,
    [mapBounds],
  );

  const mapBoundsRef = useRef(mapBounds);
  const mapZoomStepRef = useRef(mapZoomStep);

  useEffect(() => {
    mapBoundsRef.current = mapBounds;
    mapZoomStepRef.current = mapZoomStep;
  }, [mapBounds, mapZoomStep]);

  const zoomInMap = () => {
    setMapZoomStep((currentStep) => {
      const nextStep = Math.min(currentStep + 1, MAP_MAX_ZOOM_STEP);
      setMapCenter((currentCenter) => clampMapCenter(currentCenter, nextStep));
      return nextStep;
    });
  };

  const zoomOutMap = () => {
    setMapZoomStep((currentStep) => {
      const nextStep = Math.max(currentStep - 1, MAP_MIN_ZOOM_STEP);
      setMapCenter((currentCenter) => clampMapCenter(currentCenter, nextStep));
      return nextStep;
    });
  };

  const handleMapWheel = (event: WheelEvent<HTMLElement>) => {
    if (!event.ctrlKey && !event.shiftKey) {
      return;
    }

    event.preventDefault();
    if (event.deltaY < 0) {
      zoomInMap();
      return;
    }

    zoomOutMap();
  };

  useEffect(() => {
    const mapElement = mapRef.current;
    if (!mapElement) {
      return;
    }

    const wheelHandler = handleMapWheel as unknown as EventListener;
    mapElement.addEventListener("wheel", wheelHandler, { passive: false });

    return () => {
      mapElement.removeEventListener("wheel", wheelHandler);
    };
  }, []);

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

  const resolveAddressFromCoordinates = async (lat: number, lng: number) => {
    const response = await fetch(
      `/api/reverse-geocode?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`,
    );
    if (!response.ok) {
      throw new Error(`Failed to resolve address (HTTP ${response.status})`);
    }

    const payload = (await response.json()) as { address?: string };
    return payload.address?.trim() || "";
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
      const address = await resolveAddressFromCoordinates(lat, lng);
      setFormValues((currentValues) => ({
        ...currentValues,
        address: address || currentValues.address,
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

  const showPlaceClickInfo = (title: string, lat: number, lng: number, address: string) => {
    setMapClickInfo({
      title,
      lat,
      lng,
      address,
      loading: false,
      error: "",
    });
  };

  const resolveMapClickInfo = async (lat: number, lng: number) => {
    const requestId = ++mapClickRequestRef.current;

    setMapClickInfo({
      title: "Map point",
      lat,
      lng,
      address: "",
      loading: true,
      error: "",
    });

    try {
      const address = await resolveAddressFromCoordinates(lat, lng);
      if (mapClickRequestRef.current !== requestId) {
        return;
      }

      setMapClickInfo({
        title: "Map point",
        lat,
        lng,
        address: address || "Address unavailable",
        loading: false,
        error: "",
      });
    } catch (error) {
      if (mapClickRequestRef.current !== requestId) {
        return;
      }

      setMapClickInfo({
        title: "Map point",
        lat,
        lng,
        address: "",
        loading: false,
        error: error instanceof Error ? error.message : "Could not resolve clicked location.",
      });
    }
  };

  const handleMapMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (isMapPickMode || event.button !== 0) {
      return;
    }

    event.preventDefault();
    didMapDragRef.current = false;
    mapDragStateRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startCenter: mapCenter,
    };
    setIsDraggingMap(true);
  };

  const handleMapClick = (event: MouseEvent<HTMLDivElement>) => {
    if (didMapDragRef.current) {
      didMapDragRef.current = false;
      return;
    }

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
    const lng = mapBounds.minLng + xRatio * (mapBounds.maxLng - mapBounds.minLng);
    const minY = latToMercatorY(mapBounds.minLat);
    const maxY = latToMercatorY(mapBounds.maxLat);
    const lat = mercatorYToLat(maxY - yRatio * (maxY - minY));

    if (isMapPickMode) {
      setIsMapPickMode(false);
      void prefillAddressFromCoordinates(lat, lng);
    }

    void resolveMapClickInfo(lat, lng);
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
    showPlaceClickInfo(place.name, place.lat, place.lng, place.address);
    setFeedbackType("success");
    setFeedbackMessage("OSM place copied to the submission form.");
  };

  const handleReportedPlaceClick = (place: Place) => {
    showPlaceClickInfo(place.name, place.lat, place.lng, place.address);
    void openPlaceDialog(place).catch(() => {
      setFeedbackType("error");
      setFeedbackMessage("Could not open place details.");
    });
  };

  useEffect(() => {
    if (!isDraggingMap) {
      return;
    }

    const handleMouseMove = (event: globalThis.MouseEvent) => {
      const dragState = mapDragStateRef.current;
      const mapRect = mapRef.current?.getBoundingClientRect();
      if (!dragState || !mapRect?.width || !mapRect.height) {
        return;
      }

      const deltaX = event.clientX - dragState.startX;
      const deltaY = event.clientY - dragState.startY;
      if (Math.abs(deltaX) > MAP_DRAG_THRESHOLD_PIXELS || Math.abs(deltaY) > MAP_DRAG_THRESHOLD_PIXELS) {
        didMapDragRef.current = true;
      }

      const currentBounds = mapBoundsRef.current;
      const lngPerPixel = (currentBounds.maxLng - currentBounds.minLng) / mapRect.width;
      const minY = latToMercatorY(currentBounds.minLat);
      const maxY = latToMercatorY(currentBounds.maxLat);
      const yPerPixel = (maxY - minY) / mapRect.height;
      const startCenterY = latToMercatorY(dragState.startCenter.lat);

      setMapCenter(
        clampMapCenter(
          {
            lng: dragState.startCenter.lng - deltaX * lngPerPixel,
            lat: mercatorYToLat(startCenterY + deltaY * yPerPixel),
          },
          mapZoomStepRef.current,
        ),
      );
    };

    const stopDragging = () => {
      mapDragStateRef.current = null;
      setIsDraggingMap(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", stopDragging);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", stopDragging);
    };
  }, [isDraggingMap]);

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
        <section
          ref={mapRef}
          className="map"
          aria-label="Map of unfair places"
          aria-describedby="map-zoom-instructions"
        >
          <iframe
            id="osm-frame"
            title="OpenStreetMap Berlin"
            src={mapEmbedUrl}
          />
          <div
            className={`pin-layer${isMapPickMode ? " picking" : ""}${isDraggingMap ? " dragging" : ""}`}
            aria-label="Place pins"
            onClick={handleMapClick}
            onMouseDown={handleMapMouseDown}
          />
          <div className="map-zoom-controls" aria-label="Map zoom controls">
            <button type="button" onClick={zoomInMap} aria-label="Zoom in" disabled={mapZoomStep >= MAP_MAX_ZOOM_STEP}>
              +
            </button>
            <button
              type="button"
              onClick={zoomOutMap}
              aria-label="Zoom out"
              disabled={mapZoomStep <= MAP_MIN_ZOOM_STEP}
            >
              -
            </button>
          </div>
          <p id="map-zoom-instructions" className="sr-only">
            Hold left mouse button and drag to move the map. Hold Ctrl or Shift and use mouse wheel to zoom the map, or
            use the plus and minus zoom buttons.
          </p>
        </section>

        <aside className="details-panel">
          <h1>Unfair Berlin</h1>
          <p className="intro">Community map of Berlin places reported for deleting fair negative reviews.</p>
          <p className="map-hint">
            Use &quot;Pick on map&quot; in the form to choose coordinates, or click muted OSM places (cafes, restaurants,
            bars, pubs, nightclubs). Hold left mouse button and drag to move the map. Hold Ctrl or Shift and use mouse
            wheel to zoom, or use the +/− buttons.
          </p>
          {osmError && <p className="form-feedback error">{osmError}</p>}

          <section className="panel-block">
            <h2>Last map click</h2>
            {!mapClickInfo && <p className="selected-place">Click map or pin to see address and coordinates.</p>}
            {mapClickInfo && (
              <div className="selected-place">
                <strong>{mapClickInfo.title}</strong>
                <br />
                {formatCoordinates(mapClickInfo.lat, mapClickInfo.lng)}
                <br />
                {mapClickInfo.loading && "Resolving address..."}
                {!mapClickInfo.loading && mapClickInfo.error && `Address lookup error: ${mapClickInfo.error}`}
                {!mapClickInfo.loading && !mapClickInfo.error && mapClickInfo.address}
              </div>
            )}
          </section>

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
