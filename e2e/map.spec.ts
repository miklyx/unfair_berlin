import { test, expect, Page } from "@playwright/test";
import { writeFileSync } from "fs";
import { join } from "path";
import os from "os";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROOF_FILE = join(os.tmpdir(), "unfair-berlin-test-proof.png");
// 1×1 transparent PNG – valid file accepted by the proof file input
writeFileSync(
  PROOF_FILE,
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  ),
);

/**
 * Intercept all backend API calls so the tests are deterministic and do not
 * depend on external services (Nominatim, Google, SQLite, etc.).
 */
async function mockApis(page: Page) {
  await page.route("/api/reverse-geocode**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ address: "Musterstraße 1, 10115 Berlin" }),
    }),
  );
  await page.route("/api/osm-places**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ places: [] }),
    }),
  );
  await page.route("/api/google-rating**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ rating: 4.2, reviewCount: 150 }),
    }),
  );
  await page.route("/api/notes**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ notes: [] }),
    }),
  );
}

/** Navigate to the app and wait for the map section to be visible. */
async function loadApp(page: Page) {
  await mockApis(page);
  await page.goto("/");
  await expect(page.locator(".map")).toBeVisible();
}

/**
 * Submit a new place via the sidebar form and approve it from the moderation
 * queue, so the pin appears on the map.
 */
async function submitAndApprovePlace(
  page: Page,
  opts: { name: string; address: string; lat: string; lng: string },
) {
  // Open the collapsible "Submit a place" form
  const formToggle = page.getByRole("button", { name: /Submit a place/ });
  if ((await page.locator("#submit-place-panel").isVisible()) === false) {
    await formToggle.click();
    await expect(page.locator("#submit-place-panel")).toBeVisible();
  }

  // Fill required fields
  await page.locator("#name").fill(opts.name);
  await page.locator("#address").fill(opts.address);
  await page.locator("#lat").fill(opts.lat);
  await page.locator("#lng").fill(opts.lng);
  await page.locator("#deletedCount").fill("2");
  await page.locator("#proof").setInputFiles(PROOF_FILE);

  // Submit → goes to moderation queue
  await page.getByRole("button", { name: "Submit for moderation" }).click();
  await expect(page.locator(".form-feedback.success")).toContainText(
    "Submission sent to moderation queue",
  );

  // Approve the pending submission
  await page.getByRole("button", { name: "Approve" }).first().click();

  // Pin should now be visible on the map
  await expect(
    page.getByRole("button", { name: new RegExp(opts.name) }),
  ).toBeVisible();
}

/** Click the + zoom button n times. */
async function zoomIn(page: Page, times = 1) {
  const btn = page.getByRole("button", { name: "Zoom in" });
  for (let i = 0; i < times; i++) {
    await btn.click();
  }
}

/** Click the − zoom button n times. */
async function zoomOut(page: Page, times = 1) {
  const btn = page.getByRole("button", { name: "Zoom out" });
  for (let i = 0; i < times; i++) {
    await btn.click();
  }
}

/**
 * Drag the pin-layer by (dx, dy) pixels using low-level mouse events.
 * A drag of at least MAP_DRAG_THRESHOLD_PIXELS (6 px) is required to register
 * as a real pan (otherwise the app treats it as a click).
 */
async function dragMap(page: Page, dx: number, dy: number) {
  const pinLayer = page.locator(".pin-layer");
  const box = await pinLayer.boundingBox();
  if (!box) throw new Error("pin-layer not found");

  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Move in small steps so the drag threshold is exceeded
  await page.mouse.move(startX + dx, startY + dy, { steps: 20 });
  await page.mouse.up();
}

// ---------------------------------------------------------------------------
// 1. App loads without errors
// ---------------------------------------------------------------------------

test("1 – app loads without JavaScript console errors", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => consoleErrors.push(err.message));

  await loadApp(page);

  // Core layout elements must be present
  await expect(page.locator(".map")).toBeVisible();
  await expect(page.locator(".details-panel")).toBeVisible();
  await expect(page.locator(".stats-panel")).toBeVisible();
  await expect(page.locator("#osm-frame")).toBeVisible();

  expect(consoleErrors, "No JS errors on load").toHaveLength(0);
});

// ---------------------------------------------------------------------------
// 2. Initial view – map centred on Berlin
// ---------------------------------------------------------------------------

test("2 – initial map is centred on Berlin with pre-loaded place pins", async ({
  page,
}) => {
  await loadApp(page);

  // OSM iframe URL must encode the full Berlin bounding box at zoom step 0
  const frameSrc = await page.locator("#osm-frame").getAttribute("src");
  expect(frameSrc).toContain("13.0883");
  expect(frameSrc).toContain("52.3383");
  expect(frameSrc).toContain("13.7612");
  expect(frameSrc).toContain("52.6755");

  // The two seed places must appear as pins inside the pin-layer
  await expect(
    page.getByRole("button", { name: /Cafe Sonnenhof/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Restaurant Lindenblick/ }),
  ).toBeVisible();
});

// ---------------------------------------------------------------------------
// 3. Pan map vertically – no artificial restrictions
// ---------------------------------------------------------------------------

test("3 – map can be panned vertically without getting stuck", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));

  await loadApp(page);

  // Panning only works when there is room to move, so zoom in first
  await zoomIn(page, 2);

  const iframeSrcBefore = await page.locator("#osm-frame").getAttribute("src");

  // Pan upward (negative dy = mouse moves up)
  await dragMap(page, 0, -120);
  const srcAfterUp = await page.locator("#osm-frame").getAttribute("src");
  expect(srcAfterUp, "iframe src changes after panning up").not.toBe(
    iframeSrcBefore,
  );

  // Pan downward
  await dragMap(page, 0, 120);
  const srcAfterDown = await page.locator("#osm-frame").getAttribute("src");
  expect(srcAfterDown, "iframe src changes after panning down").not.toBe(
    srcAfterUp,
  );

  expect(errors, "No JS errors during vertical panning").toHaveLength(0);
});

// ---------------------------------------------------------------------------
// 4. Zoom in/out – buttons work, limits are respected
// ---------------------------------------------------------------------------

test("4 – zoom in and zoom out via buttons with correct limit behaviour", async ({
  page,
}) => {
  await loadApp(page);

  const zoomInBtn = page.getByRole("button", { name: "Zoom in" });
  const zoomOutBtn = page.getByRole("button", { name: "Zoom out" });

  // At zoom step 0 (minimum): zoom-out must be disabled, zoom-in enabled
  await expect(zoomInBtn).toBeEnabled();
  await expect(zoomOutBtn).toBeDisabled();

  const initialSrc = await page.locator("#osm-frame").getAttribute("src");

  // Zoom in to maximum (MAP_MAX_ZOOM_STEP = 5)
  await zoomIn(page, 5);
  await expect(zoomInBtn).toBeDisabled();
  await expect(zoomOutBtn).toBeEnabled();

  const zoomedInSrc = await page.locator("#osm-frame").getAttribute("src");
  expect(zoomedInSrc, "iframe src must change after zooming in").not.toBe(
    initialSrc,
  );

  // Zoom back out to minimum
  await zoomOut(page, 5);
  await expect(zoomOutBtn).toBeDisabled();
  await expect(zoomInBtn).toBeEnabled();

  const finalSrc = await page.locator("#osm-frame").getAttribute("src");
  expect(finalSrc, "iframe src must return to original after zoom out").toBe(
    initialSrc,
  );
});

// ---------------------------------------------------------------------------
// 5. Click a place pin – dialog opens showing the address
// ---------------------------------------------------------------------------

test("5 – clicking a place pin opens the detail dialog with the address", async ({
  page,
}) => {
  await loadApp(page);

  const cafeSonnenhofPin = page.getByRole("button", {
    name: /Cafe Sonnenhof/,
  });
  await cafeSonnenhofPin.click();

  const dialog = page.locator(".place-dialog-backdrop");
  await expect(dialog).toBeVisible();

  // Dialog must show the place name
  await expect(dialog.locator("h3")).toContainText("Cafe Sonnenhof");

  // Dialog must show the address
  await expect(dialog).toContainText("Rykestraße 12, Berlin");
});

// ---------------------------------------------------------------------------
// 6. Click outside the dialog – dialog closes
// ---------------------------------------------------------------------------

test("6 – clicking outside the place dialog closes it", async ({ page }) => {
  await loadApp(page);

  // Open dialog
  await page.getByRole("button", { name: /Cafe Sonnenhof/ }).click();
  await expect(page.locator(".place-dialog-backdrop")).toBeVisible();

  // Click the very top-left corner of the backdrop (outside .place-dialog)
  await page
    .locator(".place-dialog-backdrop")
    .click({ position: { x: 5, y: 5 } });

  await expect(page.locator(".place-dialog-backdrop")).not.toBeVisible();
});

// ---------------------------------------------------------------------------
// 7. "Add place" button in dialog opens the submission form pre-filled
// ---------------------------------------------------------------------------

test("7 – Add place button in dialog opens the form pre-filled with place data", async ({
  page,
}) => {
  await loadApp(page);

  // Open dialog for the seed place
  await page.getByRole("button", { name: /Cafe Sonnenhof/ }).click();
  await expect(page.locator(".place-dialog-backdrop")).toBeVisible();

  // Click the "Add place" button inside the dialog
  await page.getByRole("button", { name: "Add place" }).click();

  // Dialog must close
  await expect(page.locator(".place-dialog-backdrop")).not.toBeVisible();

  // Submission form must now be open
  await expect(page.locator("#submit-place-panel")).toBeVisible();

  // Form must be pre-filled with the place's name and address
  await expect(page.locator("#name")).toHaveValue("Cafe Sonnenhof");
  await expect(page.locator("#address")).toHaveValue("Rykestraße 12, Berlin");

  // Lat/lng fields must contain valid numbers
  const lat = await page.locator("#lat").inputValue();
  const lng = await page.locator("#lng").inputValue();
  expect(Number.isFinite(parseFloat(lat))).toBe(true);
  expect(Number.isFinite(parseFloat(lng))).toBe(true);
});

// ---------------------------------------------------------------------------
// 8. After submitting a place it stays visible on the map as a pin
// ---------------------------------------------------------------------------

test("8 – newly approved place appears as a pin on the map and stays there", async ({
  page,
}) => {
  await loadApp(page);

  await submitAndApprovePlace(page, {
    name: "Testlokal Mitte",
    address: "Unter den Linden 5, Berlin",
    lat: "52.5170",
    lng: "13.3890",
  });

  // Pin must remain visible
  const newPin = page.getByRole("button", { name: /Testlokal Mitte/ });
  await expect(newPin).toBeVisible();

  // Reload the moderation queue section to confirm the submission was removed
  await expect(
    page.locator(".moderation-list").getByText("Testlokal Mitte"),
  ).not.toBeVisible();
});

// ---------------------------------------------------------------------------
// 9. After panning the map the pin moves together with the map
// ---------------------------------------------------------------------------

test("9 – pin moves together with the map when panning left/right", async ({
  page,
}) => {
  await loadApp(page);

  await submitAndApprovePlace(page, {
    name: "Testcafé Prenzlauer",
    address: "Schönhauser Allee 10, Berlin",
    lat: "52.5380",
    lng: "13.4120",
  });

  const newPin = page.getByRole("button", { name: /Testcafé Prenzlauer/ });

  // Zoom in so panning is not clamped to a single point
  await zoomIn(page, 2);

  const boxBefore = await newPin.boundingBox();
  expect(boxBefore, "Pin must be visible before pan").not.toBeNull();

  // Pan the map left by 150 px → pin should move left in the viewport
  await dragMap(page, -150, 0);

  const boxAfter = await newPin.boundingBox();
  expect(boxAfter, "Pin must still be visible after pan").not.toBeNull();

  expect(
    Math.abs(boxAfter!.x - boxBefore!.x),
    "Pin x-coordinate must change after horizontal pan",
  ).toBeGreaterThan(10);

  // Verify the pin's geographic identity (label) is unchanged
  await expect(newPin).toBeVisible();
});

// ---------------------------------------------------------------------------
// 10. After zooming the pin stays precisely on its geographic address
// ---------------------------------------------------------------------------

test("10 – pin stays on its geographic address after zoom in and zoom out", async ({
  page,
}) => {
  await loadApp(page);

  await submitAndApprovePlace(page, {
    name: "Galerie am Hackeschen",
    address: "Rosenthaler Straße 40, Berlin",
    lat: "52.5245",
    lng: "13.4009",
  });

  const newPin = page.getByRole("button", {
    name: /Galerie am Hackeschen/,
  });

  // Record position at initial zoom
  const boxAtZoom0 = await newPin.boundingBox();
  expect(boxAtZoom0).not.toBeNull();

  // Zoom in 3 levels – pin should shift position (map re-rendered)
  await zoomIn(page, 3);
  const boxAtZoom3 = await newPin.boundingBox();
  expect(boxAtZoom3, "Pin visible after zoom in").not.toBeNull();

  expect(
    boxAtZoom3!.x !== boxAtZoom0!.x || boxAtZoom3!.y !== boxAtZoom0!.y,
    "Pin position must change after zoom (map re-rendered)",
  ).toBe(true);

  // Zoom back out – pin must return to original position
  await zoomOut(page, 3);
  const boxAtZoom0Again = await newPin.boundingBox();
  expect(boxAtZoom0Again, "Pin visible after zoom out").not.toBeNull();

  expect(
    Math.abs(boxAtZoom0Again!.x - boxAtZoom0!.x),
    "Pin x must return to original after zoom out",
  ).toBeLessThan(2);
  expect(
    Math.abs(boxAtZoom0Again!.y - boxAtZoom0!.y),
    "Pin y must return to original after zoom out",
  ).toBeLessThan(2);
});

// ---------------------------------------------------------------------------
// 11. Stability – repeat add/pan/zoom cycle without errors or drift
// ---------------------------------------------------------------------------

test("11 – add/pan/zoom cycle can be repeated without console errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  await loadApp(page);

  for (let i = 1; i <= 3; i++) {
    await submitAndApprovePlace(page, {
      name: `Stabilitätstest ${i}`,
      address: `Teststraße ${i}, Berlin`,
      lat: `52.${5100 + i * 10}`,
      lng: `13.${3900 + i * 10}`,
    });

    // Zoom in
    await zoomIn(page, 2);

    // Pan left and right
    await dragMap(page, -100, 0);
    await dragMap(page, 100, 0);

    // Zoom out
    await zoomOut(page, 2);

    // The newly added pin must still be visible after the map operations
    await expect(
      page.getByRole("button", { name: new RegExp(`Stabilitätstest ${i}`) }),
    ).toBeVisible();
  }

  expect(errors, "No JS errors during repeated add/pan/zoom cycle").toHaveLength(
    0,
  );
});
