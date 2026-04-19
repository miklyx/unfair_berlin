const places = [
  {
    id: 1,
    name: "Cafe Sonnenhof",
    address: "Rykestraße 12, Berlin",
    lat: 52.5409,
    lng: 13.4233,
    deletedCount: 8,
    platform: "Google Maps",
    notes: "Multiple users reported review removals after legal threat emails."
  },
  {
    id: 2,
    name: "Restaurant Lindenblick",
    address: "Kottbusser Damm 44, Berlin",
    lat: 52.4935,
    lng: 13.4236,
    deletedCount: 5,
    platform: "Tripadvisor",
    notes: "Users shared screenshots of platform notices confirming deletion."
  }
];

const pendingSubmissions = [];
const markerById = new Map();
let placeIdCounter =
  places.length > 0 ? places.reduce((maxId, place) => Math.max(maxId, place.id), 0) + 1 : 1;
let selectedPlaceId = null;

const berlinBounds = {
  minLng: 13.0883,
  maxLng: 13.7612,
  minLat: 52.3383,
  maxLat: 52.6755
};

const selectedPlaceElement = document.getElementById("selected-place");
const moderationListElement = document.getElementById("moderation-list");
const totalPlacesElement = document.getElementById("total-places");
const totalReviewsElement = document.getElementById("total-reviews");
const pendingCountElement = document.getElementById("pending-count");
const topPlacesElement = document.getElementById("top-places");
const pinLayer = document.getElementById("pin-layer");
const formFeedbackElement = document.getElementById("form-feedback");

function isWithinBerlinBounds(lat, lng) {
  return (
    lat >= berlinBounds.minLat &&
    lat <= berlinBounds.maxLat &&
    lng >= berlinBounds.minLng &&
    lng <= berlinBounds.maxLng
  );
}

function setFormFeedback(message, type) {
  formFeedbackElement.textContent = message;
  formFeedbackElement.className = "form-feedback";
  if (type) {
    formFeedbackElement.classList.add(type);
  }
}

function setSelectedPlace(place) {
  selectedPlaceId = place.id;
  selectedPlaceElement.textContent = "";
  const name = document.createElement("strong");
  name.textContent = place.name;
  selectedPlaceElement.appendChild(name);
  selectedPlaceElement.appendChild(document.createElement("br"));
  selectedPlaceElement.append(`${place.address}`);
  selectedPlaceElement.appendChild(document.createElement("br"));
  selectedPlaceElement.append(`Deleted reviews: `);
  const count = document.createElement("strong");
  count.textContent = String(place.deletedCount);
  selectedPlaceElement.appendChild(count);
  selectedPlaceElement.appendChild(document.createElement("br"));
  selectedPlaceElement.append(`Platform: ${place.platform}`);
  if (place.notes) {
    selectedPlaceElement.appendChild(document.createElement("br"));
    selectedPlaceElement.append(`Notes: ${place.notes}`);
  }
  refreshMarkerSelection();
}

function addPlaceMarker(place) {
  if (!isWithinBerlinBounds(place.lat, place.lng)) {
    return;
  }
  const lngRatio =
    (place.lng - berlinBounds.minLng) / (berlinBounds.maxLng - berlinBounds.minLng);
  const latRatio =
    (berlinBounds.maxLat - place.lat) / (berlinBounds.maxLat - berlinBounds.minLat);
  const marker = document.createElement("button");
  marker.type = "button";
  marker.className = "map-pin";
  marker.style.left = `${lngRatio * 100}%`;
  marker.style.top = `${latRatio * 100}%`;
  marker.title = `${place.name} — ${place.deletedCount} deleted reviews`;
  marker.setAttribute("aria-label", marker.title);
  marker.addEventListener("click", () => setSelectedPlace(place));
  pinLayer.appendChild(marker);
  markerById.set(place.id, marker);
}

function refreshMarkerSelection() {
  markerById.forEach((marker, placeId) => {
    marker.classList.toggle("selected", placeId === selectedPlaceId);
  });
}

function updateStats() {
  totalPlacesElement.textContent = String(places.length);
  totalReviewsElement.textContent = String(
    places.reduce((sum, place) => sum + place.deletedCount, 0)
  );
  pendingCountElement.textContent = String(pendingSubmissions.length);

  const topPlaces = [...places]
    .sort((a, b) => b.deletedCount - a.deletedCount)
    .slice(0, 5);
  topPlacesElement.innerHTML = "";
  topPlaces.forEach((place) => {
    const item = document.createElement("li");
    item.textContent = `${place.name}: ${place.deletedCount} deleted reviews`;
    topPlacesElement.appendChild(item);
  });
}

function renderModerationQueue() {
  moderationListElement.innerHTML = "";
  if (!pendingSubmissions.length) {
    const empty = document.createElement("li");
    empty.textContent = "No pending submissions.";
    moderationListElement.appendChild(empty);
    return;
  }

  pendingSubmissions.forEach((submission) => {
    const item = document.createElement("li");
    item.className = "moderation-item";
    const name = document.createElement("strong");
    name.textContent = submission.name;
    item.appendChild(name);
    item.appendChild(document.createElement("br"));
    item.append(`${submission.address}`);
    item.appendChild(document.createElement("br"));
    item.append(`${submission.deletedCount} deleted reviews on ${submission.platform}`);
    item.appendChild(document.createElement("br"));
    item.append(`Proof: ${submission.proofName}`);

    const actions = document.createElement("div");
    actions.className = "moderation-actions";

    const approveButton = document.createElement("button");
    approveButton.type = "button";
    approveButton.textContent = "Approve";
    approveButton.addEventListener("click", () => approveSubmission(submission.id));

    const rejectButton = document.createElement("button");
    rejectButton.type = "button";
    rejectButton.className = "reject-btn";
    rejectButton.textContent = "Reject";
    rejectButton.addEventListener("click", () => rejectSubmission(submission.id));

    actions.appendChild(approveButton);
    actions.appendChild(rejectButton);
    item.appendChild(actions);
    moderationListElement.appendChild(item);
  });
}

function approveSubmission(submissionId) {
  const index = pendingSubmissions.findIndex((s) => s.id === submissionId);
  if (index === -1) {
    return;
  }

  const [submission] = pendingSubmissions.splice(index, 1);
  const place = {
    id: submission.id,
    name: submission.name,
    address: submission.address,
    lat: submission.lat,
    lng: submission.lng,
    deletedCount: submission.deletedCount,
    platform: submission.platform,
    notes: submission.notes
  };
  places.push(place);
  addPlaceMarker(place);
  setSelectedPlace(place);
  renderModerationQueue();
  updateStats();
}

function rejectSubmission(submissionId) {
  const index = pendingSubmissions.findIndex((s) => s.id === submissionId);
  if (index === -1) {
    return;
  }

  pendingSubmissions.splice(index, 1);
  renderModerationQueue();
  updateStats();
}

document.getElementById("place-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const proofInput = document.getElementById("proof");
  const proofFile = proofInput.files && proofInput.files[0];
  if (!proofFile) {
    setFormFeedback("Please upload a proof screenshot or moderation letter.", "error");
    return;
  }

  const submission = {
    id: placeIdCounter++,
    name: document.getElementById("name").value.trim(),
    address: document.getElementById("address").value.trim(),
    lat: Number.parseFloat(document.getElementById("lat").value),
    lng: Number.parseFloat(document.getElementById("lng").value),
    deletedCount: Number.parseInt(document.getElementById("deletedCount").value, 10),
    platform: document.getElementById("platform").value,
    notes: document.getElementById("notes").value.trim(),
    proofName: proofFile.name
  };

  if (!submission.name || !submission.address) {
    setFormFeedback("Place name and address are required.", "error");
    return;
  }

  if (!Number.isFinite(submission.lat) || !Number.isFinite(submission.lng)) {
    setFormFeedback("Latitude and longitude must be valid numbers.", "error");
    return;
  }

  if (!isWithinBerlinBounds(submission.lat, submission.lng)) {
    setFormFeedback("Coordinates must be within Berlin city bounds.", "error");
    return;
  }

  if (!Number.isFinite(submission.deletedCount) || submission.deletedCount < 1) {
    setFormFeedback("Deleted reviews count must be at least 1.", "error");
    return;
  }

  pendingSubmissions.push(submission);
  form.reset();
  setFormFeedback("Submission sent to moderation queue.", "success");
  renderModerationQueue();
  updateStats();
});

places.forEach(addPlaceMarker);
renderModerationQueue();
updateStats();

if (places.length > 0) {
  setSelectedPlace(places[0]);
}
