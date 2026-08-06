"use strict";

const PLANIX_CONFIG = {
  configUrl: "data/config.json",
  workerUrl: "worker.js?v=40",
  searchMinimumCharacters: 2,
  searchLimit: 150,
  categoryPageSize: 100,
  continueWatchingLimit: 20,
  toastDuration: 3000
};

const state = {
  config: null,
  manifest: null,
  worker: null,
  catalogReady: false,
  selectedContent: null,
  featuredContent: null,
  activeSection: "inicio",
  favorites: new Set(),
  continueWatching: {},
  categoryResults: new Map(),
  searchTimer: null,
  downloadedParts: 0,
  processedParts: 0,
  totalParts: 0,

  fullCategory: {
    id: "",
    title: "",
    offset: 0,
    total: 0,
    loading: false
  },

  players: {
    hls: null,
    shaka: null,
    mpegts: null
  }
};

const elements = {
  navigationButtons: document.querySelectorAll(".nav-button, .mobile-nav-button"),
  searchInput: document.getElementById("searchInput"),
  clearSearchButton: document.getElementById("clearSearchButton"),

  heroBackground: document.getElementById("heroBackground"),
  heroTitle: document.getElementById("heroTitle"),
  heroDescription: document.getElementById("heroDescription"),
  heroYear: document.getElementById("heroYear"),
  heroCategory: document.getElementById("heroCategory"),
  catalogCounter: document.getElementById("catalogCounter"),
  heroPlayButton: document.getElementById("heroPlayButton"),
  heroInfoButton: document.getElementById("heroInfoButton"),
  heroFavoriteButton: document.getElementById("heroFavoriteButton"),

  loadingSection: document.getElementById("loadingSection"),
  loadingMessage: document.getElementById("loadingMessage"),
  loadingProgressBar: document.getElementById("loadingProgressBar"),

  searchResultsSection: document.getElementById("searchResultsSection"),
  searchResultCounter: document.getElementById("searchResultCounter"),
  searchResultsGrid: document.getElementById("searchResultsGrid"),

  fullCategorySection: document.getElementById("fullCategorySection"),
  fullCategoryTitle: document.getElementById("fullCategoryTitle"),
  fullCategoryCounter: document.getElementById("fullCategoryCounter"),
  fullCategoryGrid: document.getElementById("fullCategoryGrid"),
  backToHomeButton: document.getElementById("backToHomeButton"),
  loadMoreCategoryButton: document.getElementById("loadMoreCategoryButton"),

  continueWatchingSection: document.getElementById("continueWatchingSection"),
  continueWatchingRow: document.getElementById("continueWatchingRow"),
  catalogSections: document.getElementById("catalogSections"),
  emptyState: document.getElementById("emptyState"),

  playerModal: document.getElementById("playerModal"),
  closePlayerButton: document.getElementById("closePlayerButton"),
  videoPlayer: document.getElementById("videoPlayer"),
  playerLoading: document.getElementById("playerLoading"),
  playerLoadingText: document.getElementById("playerLoadingText"),
  playerError: document.getElementById("playerError"),
  playerErrorTitle: document.getElementById("playerErrorTitle"),
  playerErrorMessage: document.getElementById("playerErrorMessage"),
  retryPlayerButton: document.getElementById("retryPlayerButton"),
  playerTitle: document.getElementById("playerTitle"),
  playerMetadata: document.getElementById("playerMetadata"),
  playerDescription: document.getElementById("playerDescription"),
  playerFavoriteButton: document.getElementById("playerFavoriteButton"),

  informationModal: document.getElementById("informationModal"),
  closeInformationButton: document.getElementById("closeInformationButton"),
  informationBackground: document.getElementById("informationBackground"),
  informationTitle: document.getElementById("informationTitle"),
  informationMetadata: document.getElementById("informationMetadata"),
  informationDescription: document.getElementById("informationDescription"),
  informationPlayButton: document.getElementById("informationPlayButton"),
  informationFavoriteButton: document.getElementById("informationFavoriteButton"),

  toast: document.getElementById("toast")
};

document.addEventListener("DOMContentLoaded", initializeApp);

async function initializeApp() {
  try {
    restoreLocalData();
    registerEvents();
    initializeWorker();

    updateLoading("Cargando configuraciÃ³n...", 3);
    state.config = await fetchJSON(PLANIX_CONFIG.configUrl);

    updateLoading("Buscando catÃ¡logo...", 7);
    state.manifest = await fetchJSON(state.config.catalogManifest);

    const parts = Array.isArray(state.manifest.parts)
      ? state.manifest.parts
      : [];

    if (!parts.length) {
      throw new Error("catalog/index.json no contiene partes.");
    }

    state.totalParts = parts.length;

    state.worker.postMessage({ type: "RESET_CATALOG" });
    await downloadCatalogParts(parts);
  } catch (error) {
    console.error("Error al iniciar Planix Prime:", error);
    updateLoading("No se pudo cargar el catÃ¡logo.", 100);
    showToast("Revisa catalog/index.json y el archivo de pelÃ­culas.");
  }
}

async function downloadCatalogParts(parts) {
  state.downloadedParts = 0;
  state.processedParts = 0;

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    const fileUrl = typeof part === "string" ? part : part.file;

    if (!fileUrl) continue;

    updateLoading(
      `Descargando parte ${index + 1} de ${parts.length}...`,
      10 + Math.round((index / Math.max(parts.length, 1)) * 70)
    );

    const response = await fetch(fileUrl, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`No se pudo descargar ${fileUrl}. Estado ${response.status}`);
    }

    const text = await response.text();
    state.downloadedParts += 1;

    state.worker.postMessage({
      type: "PARSE_PART",
      text,
      partNumber: index + 1,
      totalParts: parts.length
    });
  }

  updateLoading("Organizando el catÃ¡logo...", 90);
  state.worker.postMessage({ type: "FINISH_CATALOG" });
}

function initializeWorker() {
  if (!("Worker" in window)) {
    throw new Error("Este navegador no admite Web Workers.");
  }

  state.worker = new Worker(PLANIX_CONFIG.workerUrl);
  state.worker.addEventListener("message", handleWorkerMessage);
  state.worker.addEventListener("error", error => {
    console.error("Error en worker.js:", error);
    showToast("OcurriÃ³ un error procesando el catÃ¡logo.");
  });
}

function handleWorkerMessage(event) {
  const message = event.data;
  if (!message?.type) return;

  switch (message.type) {
    case "PART_PROCESSED":
      handlePartProcessed(message);
      break;

    case "CATALOG_READY":
      handleCatalogReady(message);
      break;

    case "CATEGORY_RESULTS":
      handleCategoryResults(message);
      break;

    case "SEARCH_RESULTS":
      renderSearchResults(message.results || [], message.total || 0);
      break;
  }
}

function handlePartProcessed(message) {
  state.processedParts += 1;

  const percentage =
    15 +
    Math.round(
      (state.processedParts / Math.max(state.totalParts, 1)) * 70
    );

  updateLoading(
    `Procesando ${Number(message.catalogTotal || 0).toLocaleString("es-ES")} tÃ­tulos...`,
    Math.min(percentage, 88)
  );
}

function handleCatalogReady(message) {
  state.catalogReady = true;

  elements.catalogCounter.textContent =
    `${Number(message.total || 0).toLocaleString("es-ES")} tÃ­tulos`;

  if (message.featured) setFeaturedContent(message.featured);

  elements.catalogSections.innerHTML = "";
  requestHomeCategories();
  renderContinueWatching();

  updateLoading("Planix Prime estÃ¡ listo", 100);

  window.setTimeout(() => {
    elements.loadingSection.hidden = true;
  }, 500);
}

function requestHomeCategories() {
  const sections = Array.isArray(state.config?.sections)
    ? state.config.sections
    : [];

  const limits = state.config?.homeLimits || {};

  for (const section of sections) {
    state.worker.postMessage({
      type: "GET_CATEGORY",
      category: section.id,
      limit: Number(limits[section.id] || 80),
      offset: 0
    });
  }
}

function handleCategoryResults(message) {
  const category = message.category;
  const items = Array.isArray(message.items) ? message.items : [];

  if (state.fullCategory.id === category && state.fullCategory.loading) {
    appendFullCategoryResults(items, message.total || 0, message.offset || 0);
    return;
  }

  state.categoryResults.set(category, items);

  const sectionConfig = state.config.sections.find(
    section => section.id === category
  );

  if (!sectionConfig || !items.length) return;

  createCatalogSection(sectionConfig, items, message.total || items.length);
}

function createCatalogSection(section, items, total) {
  const existing = document.querySelector(
    `[data-section-id="${section.id}"]`
  );
  if (existing) existing.remove();

  const sectionElement = document.createElement("section");
  sectionElement.className = "catalog-section";
  sectionElement.dataset.sectionId = section.id;

  const heading = document.createElement("div");
  heading.className = "section-heading section-heading-actions";

  const titleGroup = document.createElement("div");
  const title = document.createElement("h2");
  title.textContent = section.title || "Contenido";

  const counter = document.createElement("span");
  counter.textContent = `${Number(total).toLocaleString("es-ES")} tÃ­tulos`;

  titleGroup.append(title, counter);

  const viewAllButton = document.createElement("button");
  viewAllButton.type = "button";
  viewAllButton.className = "view-all-button";
  viewAllButton.textContent = "Ver todo";
  viewAllButton.addEventListener("click", () => {
    openFullCategory(section.id, section.title || "Contenido");
  });

  heading.append(titleGroup, viewAllButton);

  const row = document.createElement("div");
  row.className = "content-row";

  for (const content of items) {
    row.appendChild(createContentCard(content));
  }
    sectionElement.append(heading, row);
  elements.catalogSections.appendChild(sectionElement);
}

function openFullCategory(categoryId, title) {
  if (!state.catalogReady) return;

  state.fullCategory = {
    id: categoryId,
    title,
    offset: 0,
    total: 0,
    loading: true
  };

  elements.fullCategoryTitle.textContent = title;
  elements.fullCategoryCounter.textContent = "Cargando...";
  elements.fullCategoryGrid.innerHTML = "";
  elements.loadMoreCategoryButton.hidden = true;

  elements.catalogSections.hidden = true;
  elements.continueWatchingSection.hidden = true;
  elements.searchResultsSection.hidden = true;
  elements.fullCategorySection.hidden = false;

  window.scrollTo({ top: 0, behavior: "smooth" });

  requestFullCategoryPage();
}

function requestFullCategoryPage() {
  if (!state.fullCategory.id || state.fullCategory.loading === false) return;

  state.worker.postMessage({
    type: "GET_CATEGORY",
    category: state.fullCategory.id,
    limit: PLANIX_CONFIG.categoryPageSize,
    offset: state.fullCategory.offset
  });
}

function appendFullCategoryResults(items, total, offset) {
  for (const content of items) {
    elements.fullCategoryGrid.appendChild(createContentCard(content));
  }

  state.fullCategory.total = Number(total || 0);
  state.fullCategory.offset = offset + items.length;
  state.fullCategory.loading = false;

  elements.fullCategoryCounter.textContent =
    `${state.fullCategory.total.toLocaleString("es-ES")} tÃ­tulos`;

  elements.loadMoreCategoryButton.hidden =
    state.fullCategory.offset >= state.fullCategory.total;
}

function closeFullCategory() {
  state.fullCategory = {
    id: "",
    title: "",
    offset: 0,
    total: 0,
    loading: false
  };

  elements.fullCategorySection.hidden = true;
  elements.catalogSections.hidden = false;
  renderContinueWatching();

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function loadMoreFullCategory() {
  if (
    !state.fullCategory.id ||
    state.fullCategory.offset >= state.fullCategory.total ||
    state.fullCategory.loading
  ) {
    return;
  }

  state.fullCategory.loading = true;
  elements.loadMoreCategoryButton.disabled = true;
  elements.loadMoreCategoryButton.textContent = "Cargando...";

  state.worker.postMessage({
    type: "GET_CATEGORY",
    category: state.fullCategory.id,
    limit: PLANIX_CONFIG.categoryPageSize,
    offset: state.fullCategory.offset
  });

  window.setTimeout(() => {
    elements.loadMoreCategoryButton.disabled = false;
    elements.loadMoreCategoryButton.textContent = "Mostrar mÃ¡s";
  }, 500);
}

function createContentCard(content, options = {}) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "content-card";
  card.dataset.contentId = content.id;

  if (options.continueWatching) {
    card.classList.add("continue-card");
  }

  const poster = document.createElement("div");
  poster.className = "card-poster";

  if (content.poster) {
    const image = document.createElement("img");
    image.className = "card-poster-image";
    image.src = content.poster;
    image.alt = content.title;
    image.loading = "lazy";
    image.addEventListener("error", () => image.remove());
    poster.appendChild(image);
  }

  const fallback = document.createElement("div");
  fallback.className = "card-poster-fallback";
  fallback.textContent = content.title;
  poster.appendChild(fallback);

  const format = document.createElement("span");
  format.className = "card-format";
  format.textContent = content.format || "VIDEO";
  poster.appendChild(format);

  if (state.favorites.has(content.id)) {
    const favorite = document.createElement("span");
    favorite.className = "card-favorite";
    favorite.textContent = "â™¥";
    poster.appendChild(favorite);
  }

  const overlay = document.createElement("div");
  overlay.className = "card-play-overlay";

  const playIcon = document.createElement("span");
  playIcon.className = "card-play-icon";
  playIcon.textContent = "â–¶";

  overlay.appendChild(playIcon);
  poster.appendChild(overlay);

  if (options.continueWatching) {
    const progress = state.continueWatching[content.id];

    if (progress && progress.duration > 0) {
      const progressContainer = document.createElement("div");
      progressContainer.className = "card-progress";

      const progressValue = document.createElement("div");
      progressValue.className = "card-progress-value";
      progressValue.style.width =
        `${Math.min(100, (progress.currentTime / progress.duration) * 100)}%`;

      progressContainer.appendChild(progressValue);
      poster.appendChild(progressContainer);
    }
  }

  const title = document.createElement("div");
  title.className = "card-title";
  title.textContent = content.title;

  const metadata = document.createElement("div");
  metadata.className = "card-metadata";
  metadata.textContent = [content.year, content.category]
    .filter(Boolean)
    .join(" Â· ");

  card.append(poster, title, metadata);

  card.addEventListener("click", () => openInformation(content));
  card.addEventListener("mouseenter", () => setFeaturedContent(content));
  card.addEventListener("focus", () => setFeaturedContent(content));

  return card;
}

function setFeaturedContent(content) {
  if (!content) return;

  state.featuredContent = content;
  elements.heroTitle.textContent = content.title;
  elements.heroDescription.textContent =
    content.description || "Disponible en Planix Prime.";
  elements.heroYear.textContent = content.year || "CatÃ¡logo";
  elements.heroCategory.textContent = content.category || "PelÃ­culas";

  const image = content.background || content.poster || "";

  if (image) {
    elements.heroBackground.style.backgroundImage = `url("${image}")`;
    elements.heroBackground.classList.add("visible");
  } else {
    elements.heroBackground.style.backgroundImage = "";
    elements.heroBackground.classList.remove("visible");
  }

  elements.heroPlayButton.disabled = false;
  elements.heroInfoButton.disabled = false;
  elements.heroFavoriteButton.disabled = false;

  updateFavoriteButtons(content);
}

/* =========================================================
   REPRODUCTOR MULTIFORMATO
   ========================================================= */

async function openPlayer(content) {
  if (!content?.url) {
    showToast("Este contenido no tiene una URL vÃ¡lida.");
    return;
  }

  state.selectedContent = content;
  elements.playerTitle.textContent = content.title;
  elements.playerMetadata.textContent = [
    content.year,
    content.category,
    content.format
  ].filter(Boolean).join(" Â· ");
  elements.playerDescription.textContent =
    content.description || "Disponible en Planix Prime.";

  elements.playerModal.hidden = false;
  document.body.classList.add("modal-open");

  hidePlayerError();
  showPlayerLoading("Preparando reproducciÃ³n...");
  updateFavoriteButtons(content);

  try {
    await loadMedia(content);
  } catch (error) {
    console.error("Error de reproducciÃ³n:", error);
    showPlayerErrorFor(content, error);
  }
}

async function loadMedia(content) {
  await destroyActivePlayers();

  const url = content.url;
  const format = detectPlaybackFormat(content);
  const video = elements.videoPlayer;

  video.removeAttribute("src");
  video.load();

  const savedProgress = state.continueWatching[content.id];

  const restoreProgress = () => {
    if (
      savedProgress &&
      savedProgress.currentTime > 0 &&
      Number.isFinite(video.duration) &&
      savedProgress.currentTime < video.duration - 15
    ) {
      video.currentTime = savedProgress.currentTime;
    }
  };

  video.addEventListener("loadedmetadata", restoreProgress, { once: true });

  if (format === "m3u8") {
    await playHls(url);
    return;
  }

  if (format === "mpd") {
    await playDash(url);
    return;
  }

  if (format === "ts" || format === "flv") {
    await playMpegTs(url, format);
    return;
  }

  await playNative(url);
}

function detectPlaybackFormat(content) {
  const url = String(content.url || "").split("?")[0].toLowerCase();
  const stated = String(content.format || "").toLowerCase();

  if (url.endsWith(".m3u8") || stated === "m3u8") return "m3u8";
  if (url.endsWith(".mpd") || stated === "mpd") return "mpd";
  if (url.endsWith(".ts") || stated === "ts") return "ts";
  if (url.endsWith(".flv") || stated === "flv") return "flv";
  if (url.endsWith(".mkv") || stated === "mkv") return "mkv";
  if (url.endsWith(".avi") || stated === "avi") return "avi";
  if (url.endsWith(".webm") || stated === "webm") return "webm";
  return "native";
}

async function playNative(url) {
  const video = elements.videoPlayer;
  video.src = url;

  await new Promise((resolve, reject) => {
    const onReady = () => {
      cleanup();
      resolve();
    };

    const onError = () => {
      cleanup();
      reject(new Error("NATIVE_MEDIA_ERROR"));
    };

