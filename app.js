"use strict";

/* =========================================================
   PLANIX PRIME 2.0
   Archivo: app.js
   Carga automática del catálogo dividido
   ========================================================= */


/* =========================================================
   CONFIGURACIÓN GENERAL
   ========================================================= */

const PLANIX_CONFIG = {
  configUrl: "data/config.json",
  workerUrl: "worker.js",

  searchMinimumCharacters: 2,
  searchLimit: 150,

  continueWatchingLimit: 20,
  toastDuration: 3000
};


/* =========================================================
   ESTADO DE LA APLICACIÓN
   ========================================================= */

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
  totalParts: 0
};


/* =========================================================
   ELEMENTOS DEL HTML
   ========================================================= */

const elements = {
  navigationButtons: document.querySelectorAll(
    ".nav-button, .mobile-nav-button"
  ),

  searchInput: document.getElementById(
    "searchInput"
  ),

  clearSearchButton: document.getElementById(
    "clearSearchButton"
  ),

  heroBackground: document.getElementById(
    "heroBackground"
  ),

  heroTitle: document.getElementById(
    "heroTitle"
  ),

  heroDescription: document.getElementById(
    "heroDescription"
  ),

  heroYear: document.getElementById(
    "heroYear"
  ),

  heroCategory: document.getElementById(
    "heroCategory"
  ),

  catalogCounter: document.getElementById(
    "catalogCounter"
  ),

  heroPlayButton: document.getElementById(
    "heroPlayButton"
  ),

  heroInfoButton: document.getElementById(
    "heroInfoButton"
  ),

  heroFavoriteButton: document.getElementById(
    "heroFavoriteButton"
  ),

  loadingSection: document.getElementById(
    "loadingSection"
  ),

  loadingMessage: document.getElementById(
    "loadingMessage"
  ),

  loadingProgressBar: document.getElementById(
    "loadingProgressBar"
  ),

  searchResultsSection: document.getElementById(
    "searchResultsSection"
  ),

  searchResultCounter: document.getElementById(
    "searchResultCounter"
  ),

  searchResultsGrid: document.getElementById(
    "searchResultsGrid"
  ),

  continueWatchingSection: document.getElementById(
    "continueWatchingSection"
  ),

  continueWatchingRow: document.getElementById(
    "continueWatchingRow"
  ),

  catalogSections: document.getElementById(
    "catalogSections"
  ),

  emptyState: document.getElementById(
    "emptyState"
  ),

  playerModal: document.getElementById(
    "playerModal"
  ),

  closePlayerButton: document.getElementById(
    "closePlayerButton"
  ),

  videoPlayer: document.getElementById(
    "videoPlayer"
  ),

  playerLoading: document.getElementById(
    "playerLoading"
  ),

  playerTitle: document.getElementById(
    "playerTitle"
  ),

  playerMetadata: document.getElementById(
    "playerMetadata"
  ),

  playerDescription: document.getElementById(
    "playerDescription"
  ),

  playerFavoriteButton: document.getElementById(
    "playerFavoriteButton"
  ),

  informationModal: document.getElementById(
    "informationModal"
  ),

  closeInformationButton: document.getElementById(
    "closeInformationButton"
  ),

  informationBackground: document.getElementById(
    "informationBackground"
  ),

  informationTitle: document.getElementById(
    "informationTitle"
  ),

  informationMetadata: document.getElementById(
    "informationMetadata"
  ),

  informationDescription: document.getElementById(
    "informationDescription"
  ),

  informationPlayButton: document.getElementById(
    "informationPlayButton"
  ),

  informationFavoriteButton: document.getElementById(
    "informationFavoriteButton"
  ),

  toast: document.getElementById(
    "toast"
  )
};


/* =========================================================
   INICIO
   ========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  initializeApp
);

async function initializeApp() {
  try {
    restoreLocalData();
    registerEvents();
    initializeWorker();

    updateLoading(
      "Cargando configuración...",
      3
    );

    state.config = await fetchJSON(
      PLANIX_CONFIG.configUrl
    );

    updateLoading(
      "Buscando catálogo...",
      7
    );

    state.manifest = await fetchJSON(
      state.config.catalogManifest
    );

    const parts =
      Array.isArray(state.manifest.parts)
        ? state.manifest.parts
        : [];

    if (!parts.length) {
      throw new Error(
        "catalog/index.json no contiene partes."
      );
    }

    state.totalParts = parts.length;

    state.worker.postMessage({
      type: "RESET_CATALOG"
    });

    await downloadCatalogParts(parts);
  } catch (error) {
    console.error(
      "Error al iniciar Planix Prime:",
      error
    );

    updateLoading(
      "No se pudo cargar el catálogo.",
      100
    );

    showToast(
      "Revisa catalog/index.json y los archivos TXT."
    );
  }
}


/* =========================================================
   DESCARGAR LAS PARTES
   ========================================================= */

async function downloadCatalogParts(parts) {
  state.downloadedParts = 0;
  state.processedParts = 0;

  for (
    let index = 0;
    index < parts.length;
    index += 1
  ) {
    const part = parts[index];

    const fileUrl =
      typeof part === "string"
        ? part
        : part.file;

    if (!fileUrl) {
      continue;
    }

    updateLoading(
      `Descargando parte ${index + 1} de ${parts.length}...`,
      calculateDownloadProgress(index, parts.length)
    );

    const response = await fetch(fileUrl, {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(
        `No se pudo descargar ${fileUrl}. Estado ${response.status}`
      );
    }

    const text =
      await response.text();

    state.downloadedParts += 1;

    state.worker.postMessage({
      type: "PARSE_PART",

      text,

      partNumber: index + 1,

      totalParts: parts.length
    });
  }

  updateLoading(
    "Terminando de organizar el catálogo...",
    90
  );

  state.worker.postMessage({
    type: "FINISH_CATALOG"
  });
}

function calculateDownloadProgress(
  currentIndex,
  total
) {
  const progress =
    10 +
    Math.round(
      (currentIndex /
        Math.max(total, 1)) *
        70
    );

  return Math.min(
    progress,
    80
  );
}


/* =========================================================
   WORKER
   ========================================================= */

function initializeWorker() {
  if (!("Worker" in window)) {
    throw new Error(
      "Este navegador no admite Web Workers."
    );
  }

  state.worker = new Worker(
    PLANIX_CONFIG.workerUrl
  );

  state.worker.addEventListener(
    "message",
    handleWorkerMessage
  );

  state.worker.addEventListener(
    "error",
    error => {
      console.error(
        "Error en worker.js:",
        error
      );

      showToast(
        "Ocurrió un error procesando el catálogo."
      );
    }
  );
}

function handleWorkerMessage(event) {
  const message = event.data;

  if (!message?.type) {
    return;
  }

  switch (message.type) {
    case "CATALOG_RESET":
      break;

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
      renderSearchResults(
        message.results || [],
        message.total || 0
      );
      break;

    default:
      console.log(
        "Mensaje del worker:",
        message
      );
  }
}

function handlePartProcessed(message) {
  state.processedParts += 1;

  const percentage =
    15 +
    Math.round(
      (state.processedParts /
        Math.max(state.totalParts, 1)) *
        70
    );

  updateLoading(
    `Procesando parte ${message.partNumber} de ${message.totalParts} · ${Number(
      message.catalogTotal || 0
    ).toLocaleString("es-ES")} títulos`,
    Math.min(percentage, 88)
  );
}


/* =========================================================
   CATÁLOGO LISTO
   ========================================================= */

function handleCatalogReady(message) {
  state.catalogReady = true;

  elements.catalogCounter.textContent =
    `${Number(
      message.total || 0
    ).toLocaleString("es-ES")} títulos`;

  if (message.featured) {
    setFeaturedContent(
      message.featured
    );
  }

  elements.catalogSections.innerHTML = "";

  requestHomeCategories();

  renderContinueWatching();

  updateLoading(
    "Planix Prime está listo",
    100
  );

  window.setTimeout(() => {
    elements.loadingSection.hidden = true;
  }, 500);
}


/* =========================================================
   PEDIR CATEGORÍAS PRINCIPALES
   ========================================================= */

function requestHomeCategories() {
  const sections =
    Array.isArray(state.config?.sections)
      ? state.config.sections
      : [];

  const limits =
    state.config?.homeLimits || {};

  for (const section of sections) {
    const limit =
      Number(
        limits[section.id] || 80
      );

    state.worker.postMessage({
      type: "GET_CATEGORY",

      category: section.id,

      limit,

      offset: 0
    });
  }
}


/* =========================================================
   RECIBIR CATEGORÍAS
   ========================================================= */

function handleCategoryResults(message) {
  const category =
    message.category;

  const items =
    Array.isArray(message.items)
      ? message.items
      : [];

  state.categoryResults.set(
    category,
    items
  );

  const sectionConfig =
    state.config.sections.find(
      section =>
        section.id === category
    );

  if (!sectionConfig || !items.length) {
    return;
  }

  createCatalogSection(
    sectionConfig,
    items,
    message.total || items.length
  );
}


/* =========================================================
   CREAR FILAS
   ========================================================= */

function createCatalogSection(
  section,
  items,
  total
) {
  const existingSection =
    document.querySelector(
      `[data-section-id="${section.id}"]`
    );

  if (existingSection) {
    existingSection.remove();
  }

  const sectionElement =
    document.createElement("section");

  sectionElement.className =
    "catalog-section";

  sectionElement.dataset.sectionId =
    section.id;

  const heading =
    document.createElement("div");

  heading.className =
    "section-heading";

  const title =
    document.createElement("h2");

  title.textContent =
    section.title ||
    "Contenido";

  const counter =
    document.createElement("span");

  counter.textContent =
    `${Number(total).toLocaleString("es-ES")} títulos`;

  const row =
    document.createElement("div");

  row.className =
    "content-row";

  for (const content of items) {
    row.appendChild(
      createContentCard(content)
    );
  }

  heading.append(
    title,
    counter
  );

  sectionElement.append(
    heading,
    row
  );

  elements.catalogSections.appendChild(
    sectionElement
  );
}


/* =========================================================
   CREAR TARJETAS
   ========================================================= */

function createContentCard(
  content,
  options = {}
) {
  const card =
    document.createElement("button");

  card.type = "button";
  card.className =
    "content-card";

  card.dataset.contentId =
    content.id;

  if (options.continueWatching) {
    card.classList.add(
      "continue-card"
    );
  }

  const poster =
    document.createElement("div");

  poster.className =
    "card-poster";

  if (content.poster) {
    const image =
      document.createElement("img");

    image.className =
      "card-poster-image";

    image.src = content.poster;
    image.alt = content.title;
    image.loading = "lazy";

    image.addEventListener(
      "error",
      () => {
        image.remove();
      }
    );

    poster.appendChild(image);
  }

  const fallback =
    document.createElement("div");

  fallback.className =
    "card-poster-fallback";

  fallback.textContent =
    content.title;

  poster.appendChild(fallback);

  const format =
    document.createElement("span");

  format.className =
    "card-format";

  format.textContent =
    content.format ||
    "VIDEO";

  poster.appendChild(format);

  if (
    state.favorites.has(
      content.id
    )
  ) {
    const favorite =
      document.createElement("span");

    favorite.className =
      "card-favorite";

    favorite.textContent = "♥";

    poster.appendChild(favorite);
  }

  const overlay =
    document.createElement("div");

  overlay.className =
    "card-play-overlay";

  const playIcon =
    document.createElement("span");

  playIcon.className =
    "card-play-icon";

  playIcon.textContent = "▶";

  overlay.appendChild(playIcon);
  poster.appendChild(overlay);

  if (options.continueWatching) {
    const progress =
      state.continueWatching[
        content.id
      ];

    if (
      progress &&
      progress.duration > 0
    ) {
      const progressContainer =
        document.createElement("div");

      progressContainer.className =
        "card-progress";

      const progressValue =
        document.createElement("div");

      progressValue.className =
        "card-progress-value";

      const percentage =
        Math.min(
          100,
          (
            progress.currentTime /
            progress.duration
          ) *
            100
        );

      progressValue.style.width =
        `${percentage}%`;

      progressContainer.appendChild(
        progressValue
      );

      poster.appendChild(
        progressContainer
      );
    }
  }

  const title =
    document.createElement("div");

  title.className =
    "card-title";

  title.textContent =
    content.title;

  const metadata =
    document.createElement("div");

  metadata.className =
    "card-metadata";

  metadata.textContent = [
    content.year,
    content.category
  ]
    .filter(Boolean)
    .join(" · ");

  card.append(
    poster,
    title,
    metadata
  );

  card.addEventListener(
    "click",
    () => {
      openInformation(content);
    }
  );

  card.addEventListener(
    "mouseenter",
    () => {
      setFeaturedContent(content);
    }
  );

  card.addEventListener(
    "focus",
    () => {
      setFeaturedContent(content);
    }
  );

  return card;
}


/* =========================================================
   PORTADA DESTACADA
   ========================================================= */

function setFeaturedContent(content) {
  if (!content) {
    return;
  }

  state.featuredContent =
    content;

  elements.heroTitle.textContent =
    content.title;

  elements.heroDescription.textContent =
    content.description ||
    "Disponible en Planix Prime.";

  elements.heroYear.textContent =
    content.year ||
    "Catálogo";

  elements.heroCategory.textContent =
    content.category ||
    "Entretenimiento";

  const image =
    content.background ||
    content.poster ||
    "";

  if (image) {
    elements.heroBackground.style.backgroundImage =
      `url("${image}")`;

    elements.heroBackground.classList.add(
      "visible"
    );
  } else {
    elements.heroBackground.style.backgroundImage =
      "";

    elements.heroBackground.classList.remove(
      "visible"
    );
  }

  elements.heroPlayButton.disabled =
    false;

  elements.heroInfoButton.disabled =
    false;

  elements.heroFavoriteButton.disabled =
    false;

  updateFavoriteButtons(content);
}


/* =========================================================
   BUSCADOR
   ========================================================= */

function handleSearchInput() {
  const query =
    elements.searchInput.value.trim();

  elements.clearSearchButton.hidden =
    query.length === 0;

  clearTimeout(state.searchTimer);

  state.searchTimer =
    window.setTimeout(() => {
      performSearch(query);
    }, 280);
}

function performSearch(query) {
  if (
    query.length <
    PLANIX_CONFIG.searchMinimumCharacters
  ) {
    hideSearchResults();
    return;
  }

  if (!state.catalogReady) {
    showToast(
      "Espera a que termine de cargar el catálogo."
    );

    return;
  }

  state.worker.postMessage({
    type: "SEARCH",

    query,

    limit:
      PLANIX_CONFIG.searchLimit
  });
}

function renderSearchResults(
  results,
  total
) {
  elements.searchResultsGrid.innerHTML =
    "";

  elements.searchResultsSection.hidden =
    false;

  elements.searchResultCounter.textContent =
    `${Number(total).toLocaleString("es-ES")} resultados`;

  elements.emptyState.hidden =
    results.length > 0;

  for (const content of results) {
    elements.searchResultsGrid.appendChild(
      createContentCard(content)
    );
  }

  elements.searchResultsSection.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

function hideSearchResults() {
  elements.searchResultsSection.hidden =
    true;

  elements.searchResultsGrid.innerHTML =
    "";

  elements.emptyState.hidden =
    true;
}

function clearSearch() {
  elements.searchInput.value = "";

  elements.clearSearchButton.hidden =
    true;

  hideSearchResults();

  elements.searchInput.focus();
}


/* =========================================================
   REPRODUCTOR
   ========================================================= */

function openPlayer(content) {
  if (!content?.url) {
    showToast(
      "Este contenido no tiene una URL válida."
    );

    return;
  }

  state.selectedContent =
    content;

  elements.playerTitle.textContent =
    content.title;

  elements.playerMetadata.textContent = [
    content.year,
    content.category,
    content.format
  ]
    .filter(Boolean)
    .join(" · ");

  elements.playerDescription.textContent =
    content.description ||
    "Disponible en Planix Prime.";

  elements.playerLoading.hidden =
    false;

  elements.videoPlayer.src =
    content.url;

  const savedProgress =
    state.continueWatching[
      content.id
    ];

  elements.videoPlayer.addEventListener(
    "loadedmetadata",
    () => {
      if (
        savedProgress &&
        savedProgress.currentTime > 0 &&
        savedProgress.currentTime <
          elements.videoPlayer.duration - 15
      ) {
        elements.videoPlayer.currentTime =
          savedProgress.currentTime;
      }
    },
    {
      once: true
    }
  );

  elements.playerModal.hidden =
    false;

  document.body.classList.add(
    "modal-open"
  );

  updateFavoriteButtons(content);

  elements.videoPlayer
    .play()
    .catch(() => {
      elements.playerLoading.hidden =
        true;
    });
}

function closePlayer() {
  saveCurrentProgress();

  elements.videoPlayer.pause();
  elements.videoPlayer.removeAttribute(
    "src"
  );
  elements.videoPlayer.load();

  elements.playerModal.hidden =
    true;

  document.body.classList.remove(
    "modal-open"
  );
}


/* =========================================================
   INFORMACIÓN
   ========================================================= */

function openInformation(content) {
  state.selectedContent =
    content;

  elements.informationTitle.textContent =
    content.title;

  elements.informationMetadata.textContent = [
    content.year,
    content.category,
    content.format
  ]
    .filter(Boolean)
    .join(" · ");

  elements.informationDescription.textContent =
    content.description ||
    "Disponible en Planix Prime.";

  const background =
    content.background ||
    content.poster ||
    "";

  elements.informationBackground.style.backgroundImage =
    background
      ? `url("${background}")`
      : "";

  elements.informationModal.hidden =
    false;

  document.body.classList.add(
    "modal-open"
  );

  updateFavoriteButtons(content);
}

function closeInformation() {
  elements.informationModal.hidden =
    true;

  document.body.classList.remove(
    "modal-open"
  );
}


/* =========================================================
   FAVORITOS
   ========================================================= */

function toggleFavorite(content) {
  if (!content) {
    return;
  }

  if (
    state.favorites.has(
      content.id
    )
  ) {
    state.favorites.delete(
      content.id
    );

    showToast(
      "Eliminado de Mi lista."
    );
  } else {
    state.favorites.add(
      content.id
    );

    showToast(
      "Agregado a Mi lista."
    );
  }

  localStorage.setItem(
    "planixFavorites",
    JSON.stringify(
      Array.from(
        state.favorites
      )
    )
  );

  updateFavoriteButtons(content);
  refreshVisibleCards();
}

function updateFavoriteButtons(content) {
  if (!content) {
    return;
  }

  const isFavorite =
    state.favorites.has(
      content.id
    );

  elements.heroFavoriteButton.textContent =
    isFavorite
      ? "♥ En mi lista"
      : "♡ Mi lista";

  elements.playerFavoriteButton.textContent =
    isFavorite
      ? "Quitar de Mi lista"
      : "Agregar a Mi lista";

  elements.informationFavoriteButton.textContent =
    isFavorite
      ? "Quitar de Mi lista"
      : "Agregar a Mi lista";
}

function refreshVisibleCards() {
  document
    .querySelectorAll(
      ".content-card"
    )
    .forEach(card => {
      const id =
        card.dataset.contentId;

      const poster =
        card.querySelector(
          ".card-poster"
        );

      const existingFavorite =
        card.querySelector(
          ".card-favorite"
        );

      const isFavorite =
        state.favorites.has(id);

      if (
        isFavorite &&
        !existingFavorite
      ) {
        const favorite =
          document.createElement(
            "span"
          );

        favorite.className =
          "card-favorite";

        favorite.textContent =
          "♥";

        poster?.appendChild(
          favorite
        );
      }

      if (
        !isFavorite &&
        existingFavorite
      ) {
        existingFavorite.remove();
      }
    });
}


/* =========================================================
   CONTINUAR VIENDO
   ========================================================= */

function saveCurrentProgress() {
  const content =
    state.selectedContent;

  const player =
    elements.videoPlayer;

  if (
    !content ||
    !Number.isFinite(
      player.currentTime
    ) ||
    !Number.isFinite(
      player.duration
    ) ||
    player.duration <= 0
  ) {
    return;
  }

  if (
    player.currentTime >=
    player.duration - 30
  ) {
    delete state.continueWatching[
      content.id
    ];
  } else if (
    player.currentTime > 10
  ) {
    state.continueWatching[
      content.id
    ] = {
      content,

      currentTime:
        player.currentTime,

      duration:
        player.duration,

      updatedAt:
        Date.now()
    };
  }

  localStorage.setItem(
    "planixContinueWatching",
    JSON.stringify(
      state.continueWatching
    )
  );

  renderContinueWatching();
}

function renderContinueWatching() {
  const items =
    Object.values(
      state.continueWatching
    )
      .sort(
        (first, second) =>
          second.updatedAt -
          first.updatedAt
      )
      .slice(
        0,
        PLANIX_CONFIG.continueWatchingLimit
      );

  elements.continueWatchingRow.innerHTML =
    "";

  if (!items.length) {
    elements.continueWatchingSection.hidden =
      true;

    return;
  }

  elements.continueWatchingSection.hidden =
    false;

  for (const progress of items) {
    if (!progress.content) {
      continue;
    }

    elements.continueWatchingRow.appendChild(
      createContentCard(
        progress.content,
        {
          continueWatching: true
        }
      )
    );
  }
}


/* =========================================================
   NAVEGACIÓN
   ========================================================= */

function changeSection(sectionId) {
  state.activeSection =
    sectionId;

  elements.navigationButtons.forEach(
    button => {
      button.classList.toggle(
        "active",
        button.dataset.section ===
          sectionId
      );
    }
  );

  if (sectionId === "inicio") {
    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });

    return;
  }

  if (sectionId === "favoritos") {
    showFavorites();
    return;
  }

  const section =
    document.querySelector(
      `[data-section-id="${sectionId}"]`
    );

  if (section) {
    section.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  } else {
    showToast(
      "Esta sección todavía no tiene contenido."
    );
  }
}

function showFavorites() {
  const favorites = [];

  document
    .querySelectorAll(
      ".content-card"
    )
    .forEach(card => {
      const id =
        card.dataset.contentId;

      if (
        !state.favorites.has(id)
      ) {
        return;
      }

      for (
        const items of
        state.categoryResults.values()
      ) {
        const content =
          items.find(
            item =>
              item.id === id
          );

        if (
          content &&
          !favorites.some(
            item =>
              item.id === content.id
          )
        ) {
          favorites.push(content);
        }
      }
    });

  elements.searchResultsSection.hidden =
    false;

  elements.searchResultsGrid.innerHTML =
    "";

  elements.searchResultCounter.textContent =
    `${favorites.length} favoritos`;

  elements.emptyState.hidden =
    favorites.length > 0;

  for (const content of favorites) {
    elements.searchResultsGrid.appendChild(
      createContentCard(content)
    );
  }

  elements.searchResultsSection.scrollIntoView({
    behavior: "smooth"
  });
}


/* =========================================================
   DATOS GUARDADOS
   ========================================================= */

function restoreLocalData() {
  try {
    const savedFavorites =
      JSON.parse(
        localStorage.getItem(
          "planixFavorites"
        ) || "[]"
      );

    state.favorites =
      new Set(
        savedFavorites
      );

    state.continueWatching =
      JSON.parse(
        localStorage.getItem(
          "planixContinueWatching"
        ) || "{}"
      );
  } catch (error) {
    console.warn(
      "No se pudieron restaurar los datos locales.",
      error
    );

    state.favorites =
      new Set();

    state.continueWatching =
      {};
  }
}


/* =========================================================
   EVENTOS
   ========================================================= */

function registerEvents() {
  elements.navigationButtons.forEach(
    button => {
      button.addEventListener(
        "click",
        () => {
          changeSection(
            button.dataset.section
          );
        }
      );
    }
  );

  elements.searchInput.addEventListener(
    "input",
    handleSearchInput
  );

  elements.clearSearchButton.addEventListener(
    "click",
    clearSearch
  );

  elements.heroPlayButton.addEventListener(
    "click",
    () => {
      openPlayer(
        state.featuredContent
      );
    }
  );

  elements.heroInfoButton.addEventListener(
    "click",
    () => {
      openInformation(
        state.featuredContent
      );
    }
  );

  elements.heroFavoriteButton.addEventListener(
    "click",
    () => {
      toggleFavorite(
        state.featuredContent
      );
    }
  );

  elements.closePlayerButton.addEventListener(
    "click",
    closePlayer
  );

  elements.closeInformationButton.addEventListener(
    "click",
    closeInformation
  );

  elements.informationPlayButton.addEventListener(
    "click",
    () => {
      const content =
        state.selectedContent;

      closeInformation();
      openPlayer(content);
    }
  );

  elements.playerFavoriteButton.addEventListener(
    "click",
    () => {
      toggleFavorite(
        state.selectedContent
      );
    }
  );

  elements.informationFavoriteButton.addEventListener(
    "click",
    () => {
      toggleFavorite(
        state.selectedContent
      );
    }
  );

  elements.videoPlayer.addEventListener(
    "waiting",
    () => {
      elements.playerLoading.hidden =
        false;
    }
  );

  elements.videoPlayer.addEventListener(
    "playing",
    () => {
      elements.playerLoading.hidden =
        true;
    }
  );

  elements.videoPlayer.addEventListener(
    "pause",
    saveCurrentProgress
  );

  elements.videoPlayer.addEventListener(
    "timeupdate",
    debounce(
      saveCurrentProgress,
      5000
    )
  );

  elements.videoPlayer.addEventListener(
    "ended",
    () => {
      if (
        state.selectedContent
      ) {
        delete state.continueWatching[
          state.selectedContent.id
        ];

        localStorage.setItem(
          "planixContinueWatching",
          JSON.stringify(
            state.continueWatching
          )
        );

        renderContinueWatching();
      }
    }
  );

  elements.videoPlayer.addEventListener(
    "error",
    () => {
      elements.playerLoading.hidden =
        true;

      showToast(
        "El navegador no pudo reproducir este archivo."
      );
    }
  );

  elements.playerModal.addEventListener(
    "click",
    event => {
      if (
        event.target.classList.contains(
          "modal-backdrop"
        )
      ) {
        closePlayer();
      }
    }
  );

  elements.informationModal.addEventListener(
    "click",
    event => {
      if (
        event.target.classList.contains(
          "modal-backdrop"
        )
      ) {
        closeInformation();
      }
    }
  );

  document.addEventListener(
    "keydown",
    event => {
      if (event.key === "Escape") {
        if (
          !elements.playerModal.hidden
        ) {
          closePlayer();
        }

        if (
          !elements.informationModal.hidden
        ) {
          closeInformation();
        }
      }
    }
  );
}


/* =========================================================
   AYUDANTES
   ========================================================= */

async function fetchJSON(url) {
  const response = await fetch(url, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(
      `No se pudo cargar ${url}. Estado ${response.status}`
    );
  }

  return response.json();
}

function updateLoading(
  message,
  percentage
) {
  elements.loadingMessage.textContent =
    message;

  elements.loadingProgressBar.style.width =
    `${Math.max(
      0,
      Math.min(
        100,
        percentage
      )
    )}%`;
}

function showToast(message) {
  elements.toast.textContent =
    message;

  elements.toast.classList.add(
    "show"
  );

  clearTimeout(
    showToast.timer
  );

  showToast.timer =
    window.setTimeout(() => {
      elements.toast.classList.remove(
        "show"
      );
    }, PLANIX_CONFIG.toastDuration);
}

function debounce(
  callback,
  delay
) {
  let timer;

  return (...argumentsList) => {
    clearTimeout(timer);

    timer =
      window.setTimeout(() => {
        callback(
          ...argumentsList
        );
      }, delay);
  };
}
