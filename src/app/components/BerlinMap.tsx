"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import { CircleMarker, MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";

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

type OSMPlace = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  amenity: string;
};

export type BerlinMapProps = {
  places: Place[];
  osmPlaces: OSMPlace[];
  selectedPlaceId: number | null;
  isMapPickMode: boolean;
  mapSelection: { lat: number; lng: number } | null;
  mapSelectionLoading: boolean;
  flyToPlaceId: number | null;
  onReportedPlaceClick: (place: Place) => void;
  onOsmPlaceClick: (place: OSMPlace) => void;
  onMapClick: (lat: number, lng: number) => void;
};

const BERLIN_CENTER: [number, number] = [52.52, 13.405];
const BERLIN_BOUNDS: [[number, number], [number, number]] = [
  [52.3383, 13.0883],
  [52.6755, 13.7612],
];
const MAP_MIN_ZOOM = 11;
const MAP_MAX_ZOOM = 19;
const MAP_INITIAL_ZOOM = 12;

function MapClickHandler({
  onMapClick,
}: {
  onMapClick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(event) {
      const { lat, lng } = event.latlng;
      onMapClick(lat, lng);
    },
  });
  return null;
}

function MapCursorController({ isMapPickMode }: { isMapPickMode: boolean }) {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    container.style.cursor = isMapPickMode ? "crosshair" : "";
  }, [isMapPickMode, map]);
  return null;
}

function MapFlyTo({
  places,
  flyToPlaceId,
}: {
  places: Place[];
  flyToPlaceId: number | null;
}) {
  const map = useMap();
  const prevIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (flyToPlaceId === null || flyToPlaceId === prevIdRef.current) {
      return;
    }
    prevIdRef.current = flyToPlaceId;
    const place = places.find((p) => p.id === flyToPlaceId);
    if (place) {
      map.flyTo([place.lat, place.lng], Math.max(map.getZoom(), 15), {
        duration: 0.8,
      });
    }
  }, [flyToPlaceId, places, map]);

  return null;
}

export default function BerlinMap({
  places,
  osmPlaces,
  selectedPlaceId,
  isMapPickMode,
  mapSelection,
  mapSelectionLoading,
  flyToPlaceId,
  onReportedPlaceClick,
  onOsmPlaceClick,
  onMapClick,
}: BerlinMapProps) {
  return (
    <MapContainer
      center={BERLIN_CENTER}
      zoom={MAP_INITIAL_ZOOM}
      minZoom={MAP_MIN_ZOOM}
      maxZoom={MAP_MAX_ZOOM}
      maxBounds={BERLIN_BOUNDS}
      maxBoundsViscosity={0.8}
      style={{ width: "100%", height: "100%" }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />

      <MapClickHandler onMapClick={onMapClick} />
      <MapCursorController isMapPickMode={isMapPickMode} />
      <MapFlyTo places={places} flyToPlaceId={flyToPlaceId} />

      {osmPlaces.map((place) => (
        <CircleMarker
          key={place.id}
          center={[place.lat, place.lng]}
          radius={5}
          pathOptions={{
            color: "#fff",
            fillColor: "#6b7280",
            fillOpacity: 0.55,
            weight: 1,
          }}
          eventHandlers={{
            click(event) {
              event.originalEvent.stopPropagation();
              onOsmPlaceClick(place);
            },
          }}
        />
      ))}

      {places.map((place) => (
        <CircleMarker
          key={place.id}
          center={[place.lat, place.lng]}
          radius={9}
          pathOptions={{
            color: "#fff",
            fillColor: place.id === selectedPlaceId ? "#111827" : "#dc2626",
            fillOpacity: 1,
            weight: 2,
          }}
          eventHandlers={{
            click(event) {
              event.originalEvent.stopPropagation();
              onReportedPlaceClick(place);
            },
          }}
        />
      ))}

      {mapSelection && (
        <CircleMarker
          center={[mapSelection.lat, mapSelection.lng]}
          radius={8}
          pathOptions={{
            color: "#0f172a",
            fillColor: "rgb(15,23,42)",
            fillOpacity: 0.15,
            weight: 2,
            dashArray: mapSelectionLoading ? "4 4" : undefined,
          }}
        />
      )}
    </MapContainer>
  );
}
