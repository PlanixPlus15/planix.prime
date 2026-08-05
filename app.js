"use strict";

/* =========================================================
   PLANIX PRIME
   Archivo: app.js
   Cerebro principal de la plataforma
   ========================================================= */


/* =========================
   1. CONFIGURACIÓN
   ========================= */

const PLANIX_CONFIG = {
  configUrl: "data/config.json",
  searchWorkerUrl: "worker.js",
  searchMinimumCharacters: 2,
  searchLimit: 150,
  continueWatchingLimit: 20,
  toastDuration: 3000
};


/* =========================
   2. ESTADO DE LA APP
   ========================= */

const state = {
  config: null,
  catalog: [],
  sections: new Map(),

  selectedContent: null,
  featuredContent: null,

  activeSection: "inicio",

  favorites: new Set(),
  continueWatching: {},

  searchWorker: null,
  searchTimer: null,

  loadingSections: 0,
  loadedSections: 0
};


/* =========================
   3. ELEMENTOS DEL HTML
   ========================= */

const elements = {
  app: document.getElementById("app"),

  navigationButtons: document.querySelectorAll(
    ".nav-button, .mobile-nav-button"
  ),

  searchInput: document.getElementById("searchInput"),
  clearSearchButton: document.getElementById(
    "clearSearchButton"
  ),

  heroSection: document.getElementById("heroSection"),
  heroBackground: document.getElementById(
    "heroBackground"
  ),
  heroTitle: document.getElementById("heroTitle"),
  heroDescription: document.getElementById(
    "heroDescription"
  ),
  heroYear: document.getElementById("heroYear"),
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

  emptyState: document.getElementById("emptyState"),

  playerModal: document.getElementById("playerModal"),
  closePlayerButton: document.getElementById(
    "closePlayerButton"
  ),
  videoPlayer: document.getElementById("videoPlayer"),
  playerLoading: document.getElementById(
    "playerLoading"
  ),
  playerTitle: document.getElementById("playerTitle"),
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

  toast: document.getElementById("toast")
};


/* =========================
   4. INICIO
   ========================= */

document.addEventListener("DOMContentLoaded", initializeApp);

async function initializeApp() {
  try {
    restoreLocalData();
    registerEvents();
    initializeSearchWorker();

    updateLoading(
      "Cargando configuración de Planix Prime...",
      5
    );

    state.config = await fetchJSON(
      PLANIX_CONFIG.configUrl
    );

    configureCatalogCounter();
    await loadHomeSections();

    renderContinueWatching();

    updateLoading(
      "Planix Prime está listo",
      100
    );

    window.setTimeout(() => {
      elements.loadingSection.hidden = true;
    }, 500);
  } catch (error) {
    console.error("Error al iniciar Planix Prime:", error);

    updateLoading(
      "No se pudo cargar el catálogo. Revisa los archivos de GitHub.",
      100
    );

    showToast(
      "No se pudo iniciar Planix Prime."
    );
  }
}


/* =========================
   5. CARGAR CONFIGURACIÓN
   ========================= */

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


/* =========================
   6. CARGAR SECCIONES
   ========================= */

async function loadHomeSections() {
  const sections = state.config?.sections || [];

  state.loadingSections = sections.length;
  state.loadedSections = 0;

  elements.catalogSections.innerHTML = "";

  for (const section of sections) {
    try {
      await loadCatalogSection(section);
    } catch (error) {
      console.error(
        `No se pudo cargar la sección ${section.title}:`,
        error
      );
    }

    state.loadedSections += 1;

    const percentage =
      10 +
      Math.round(
        (state.loadedSections /
          Math.max(state.loadingSections, 1)) *
          85
      );

    updateLoading(
      `Cargando ${section.title || "contenido"}...`,
      percentage
    );
  }

  if (!state.featuredContent && state.catalog.length) {
    setFeaturedContent(state.catalog[0]);
  }
}

async function loadCatalogSection(section) {
  if (!section.file) {
    return;
  }

  const content = await fetchJSON(section.file);

  if (!Array.isArray(content)) {
    return;
  }

  const normalizedContent = content
    .map(normalizeContent)
    .filter(Boolean);

  state.sections.set(
    section.id,
    normalizedContent
  );

  addToGlobalCatalog(normalizedContent);

  createCatalogSection(
    section,
    normalizedContent
  );

  if (
    section.featured === true &&
    normalizedContent.length &&
    !state.featuredContent
  ) {
    setFeaturedContent(normalizedContent[0]);
  }
}

function addToGlobalCatalog(items) {
  const knownIds = new Set(
    state.catalog.map(item => item.id)
  );

  for (const item of items) {
    if (!knownIds.has(item.id)) {
      state.catalog.push(item);
      knownIds.add(item.id);
    }
  }

  sendCatalogToWorker();
  configureCatalogCounter();
}


/* =========================
   7. NORMALIZAR CONTENIDO
   ========================= */

function normalizeContent(item) {
  if (!item || !item.url) {
    return null;
  }

  const title =
    item.title ||
    item.titulo ||
    item.name ||
    "Contenido sin título";

  const id =
    item.id ||
    createContentId(item.url);

  return {
    id,
    title,

    year:
      item.year ||
      item.anio ||
      item.año ||
      "",

    category:
      item.category ||
      item.categoria ||
      item.genre ||
      item.genero ||
      "Entretenimiento",

    type:
      item.type ||
      item.tipo ||
      "pelicula",

    format:
      item.format ||
      detectFormat(item.url),

    url: item.url,

    poster:
      item.poster ||
      item.portada ||
      item.logo ||
      "",

    background:
      item.background ||
      item.fondo ||
      item.backdrop ||
      "",

    description:
      item.description ||
      item.descripcion ||
      "Disponible en Planix Prime."
  };
}

function createContentId(url) {
  let hash = 0;

  for (let index = 0; index < url.length; index++) {
    hash =
      (hash << 5) -
      hash +
      url.charCodeAt(index);

    hash |= 0;
  }

  return `planix-${Math.abs(hash)}`;
}

function detectFormat(url) {
  const cleanUrl = String(url)
    .split("?")[0]
    .toLowerCase();

  const match = cleanUrl.match(/\.([a-z0-9]+)$/);

  return match
    ? match[1].toUpperCase()
    : "VIDEO";
}


/* =========================
   8. CREAR SECCIONES
   ========================= */

function createCatalogSection(section, items) {
  if (!items.length) {
    return;
  }

  const sectionElement =
    document.createElement("section");

  sectionElement.className = "catalog-section";
  sectionElement.dataset.sectionId = section.id;

  const heading =
    document.createElement("div");

  heading.className = "section-heading";

  const title =
    document.createElement("h2");

  title.textContent =
    section.title ||
    "Contenido";

  const counter =
    document.createElement("span");

  counter.textContent =
    `${items.length} títulos`;

  heading.append(title, counter);

  const row =
    document.createElement("div");

  row.className = "content-row";

  for (const item of items) {
    row.appendChild(
      createContentCard(item)
    );
  }

  sectionElement.append(
    heading,
    row
  );

  elements.catalogSections.appendChild(
    sectionElement
  );
}


/* =========================
   9. CREAR TARJETAS
   ========================= */

function createContentCard(
  content,
  options = {}
) {
  const card =
    document.createElement("button");

  card.type = "button";
  card.className = "content-card";
  card.dataset.contentId = content.id;

  if (options.continueWatching) {
    card.classList.add("continue-card");
  }

  const poster =
    document.createElement("div");

  poster.className = "card-poster";

  if (content.poster) {
    const image =
      document.createElement("img");

    image.className =
      "card-poster-image";

    image.src = content.poster;
    image.alt = content.title;
    image.loading = "lazy";

    image.addEventListener("error", () => {
      image.remove();
    });

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

  format.className = "card-format";
  format.textContent =
    content.format || "VIDEO";

  poster.appendChild(format);

  if (state.favorites.has(content.id)) {
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
      state.continueWatching[content.id];

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
          (progress.currentTime /
            progress.duration) *
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

  title.className = "card-title";
  title.textContent = content.title;

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

  card.addEventListener("click", () => {
    openInformation(content);
  });

  card.addEventListener("mouseenter", () => {
    setFeaturedContent(content);
  });

  card.addEventListener("focus", () => {
    setFeaturedContent(content);
  });

  return card;
}


/* =========================
   10. PORTADA DESTACADA
   ========================= */

function setFeaturedContent(content) {
  if (!content) {
    return;
  }

  state.featuredContent = content;

  elements.heroTitle.textContent =
    content.title;

  elements.heroDescription.textContent =
    content.description;

  elements.heroYear.textContent =
    content.year || "Catálogo";

  elements.heroCategory.textContent =
    content.category ||
    "Entretenimiento";

  if (content.background || content.poster) {
    const image =
      content.background ||
      content.poster;

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

  elements.heroPlayButton.disabled = false;
  elements.heroInfoButton.disabled = false;
  elements.heroFavoriteButton.disabled = false;

  updateFavoriteButtons(content);
}


/* =========================
   11. REPRODUCTOR
   ========================= */

function openPlayer(content) {
  if (!content?.url) {
    showToast(
      "Este contenido no tiene una URL válida."
    );

    return;
  }

  state.selectedContent = content;

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
    content.description;

  elements.playerLoading.hidden = false;

  elements.videoPlayer.src = content.url;

  const savedProgress =
    state.continueWatching[content.id];

  const restoreProgress = () => {
    if (
      savedProgress &&
      savedProgress.currentTime > 0 &&
      savedProgress.currentTime <
        elements.videoPlayer.duration - 15
    ) {
      elements.videoPlayer.currentTime =
        savedProgress.currentTime;
    }
  };

  elements.videoPlayer.addEventListener(
    "loadedmetadata",
    restoreProgress,
    {
      once: true
    }
  );

  elements.playerModal.hidden = false;

  document.body.classList.add(
    "modal-open"
  );

  updateFavoriteButtons(content);

  elements.videoPlayer
    .play()
    .catch(() => {
      elements.playerLoading.hidden = true;
    });
}

function closePlayer() {
  saveCurrentProgress();

  elements.videoPlayer.pause();
  elements.videoPlayer.removeAttribute("src");
  elements.videoPlayer.load();

  elements.playerModal.hidden = true;

  document.body.classList.remove(
    "modal-open"
  );
}

function saveCurrentProgress() {
  const content =
    state.selectedContent;

  const player =
    elements.videoPlayer;

  if (
    !content ||
    !Number.isFinite(player.currentTime) ||
    !Number.isFinite(player.duration) ||
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
  } else if (player.currentTime > 10) {
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


/* =========================
   12. INFORMACIÓN
   ========================= */

function openInformation(content) {
  state.selectedContent = content;

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
    content.description;

  const background =
    content.background ||
    content.poster;

  elements.informationBackground.style.backgroundImage =
    background
      ? `url("${background}")`
      : "";

  elements.informationModal.hidden = false;

  document.body.classList.add(
    "modal-open"
  );

  updateFavoriteButtons(content);
}

function closeInformation() {
  elements.informationModal.hidden = true;

  document.body.classList.remove(
    "modal-open"
  );
}


/* =========================
   13. FAVORITOS
   ========================= */

function toggleFavorite(content) {
  if (!content) {
    return;
  }

  if (state.favorites.has(content.id)) {
    state.favorites.delete(content.id);

    showToast(
      "Eliminado de Mi lista."
    );
  } else {
    state.favorites.add(content.id);

    showToast(
      "Agregado a Mi lista."
    );
  }

  localStorage.setItem(
    "planixFavorites",
    JSON.stringify(
      Array.from(state.favorites)
    )
  );

  updateFavoriteButtons(content);
  refreshVisibleCards();
}

function updateFavoriteButtons(content) {
  const isFavorite =
    state.favorites.has(content.id);

  const label = isFavorite
    ? "Quitar de Mi lista"
    : "Agregar a Mi lista";

  elements.heroFavoriteButton.textContent =
    isFavorite
      ? "♥ En mi lista"
      : "♡ Mi lista";

  elements.playerFavoriteButton.textContent =
    label;

  elements.informationFavoriteButton.textContent =
    label;
}

function refreshVisibleCards() {
  document
    .querySelectorAll(".content-card")
    .forEach(card => {
      const content =
        findContentById(
          card.dataset.contentId
        );

      if (!content) {
        return;
      }

      const favorite =
        card.querySelector(
          ".card-favorite"
        );

      const isFavorite =
        state.favorites.has(content.id);

      if (isFavorite && !favorite) {
        const newFavorite =
          document.createElement("span");

        newFavorite.className =
          "card-favorite";

        newFavorite.textContent = "♥";

        card
          .querySelector(".card-poster")
          ?.appendChild(newFavorite);
      }

      if (!isFavorite && favorite) {
        favorite.remove();
      }
    });
}


/* =========================
   14. CONTINUAR VIENDO
   ========================= */

function renderContinueWatching() {
  const items = Object.values(
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


/* =========================
   15. BÚSQUEDA
   ========================= */

function initializeSearchWorker() {
  if (!("Worker" in window)) {
    console.warn(
      "Este navegador no admite Web Workers."
    );

    return;
  }

  state.searchWorker = new Worker(
    PLANIX_CONFIG.searchWorkerUrl
  );

  state.searchWorker.addEventListener(
    "message",
    handleWorkerMessage
  );

  state.searchWorker.addEventListener(
    "error",
    error => {
      console.error(
        "Error del buscador:",
        error
      );
    }
  );
}

function sendCatalogToWorker() {
  if (!state.searchWorker) {
    return;
  }

  state.searchWorker.postMessage({
    type: "SET_CATALOG",
    catalog: state.catalog
  });
}

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

  if (state.searchWorker) {
    state.searchWorker.postMessage({
      type: "SEARCH",
      query,
      limit:
        PLANIX_CONFIG.searchLimit
    });

    return;
  }

  const normalizedQuery =
    normalizeText(query);

  const results =
    state.catalog
      .filter(content =>
        normalizeText(
          content.title
        ).includes(normalizedQuery)
      )
      .slice(
        0,
        PLANIX_CONFIG.searchLimit
      );

  renderSearchResults(results);
}

function handleWorkerMessage(event) {
  const message = event.data;

  if (
    message?.type ===
    "SEARCH_RESULTS"
  ) {
    renderSearchResults(
      message.results || []
    );
  }
}

function renderSearchResults(results) {
  elements.searchResultsGrid.innerHTML =
    "";

  elements.searchResultsSection.hidden =
    false;

  elements.searchResultCounter.textContent =
    `${results.length} resultados`;

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

  elements.emptyState.hidden = true;
}

function clearSearch() {
  elements.searchInput.value = "";
  elements.clearSearchButton.hidden = true;

  hideSearchResults();

  elements.searchInput.focus();
}

function normalizeText(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .toLowerCase()
    .trim();
}


/* =========================
   16. NAVEGACIÓN
   ========================= */

function changeSection(sectionId) {
  state.activeSection = sectionId;

  elements.navigationButtons.forEach(
    button => {
      button.classList.toggle(
        "active",
        button.dataset.section === sectionId
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

  const matchingSection =
    document.querySelector(
      `[data-section-id="${sectionId}"]`
    );

  if (matchingSection) {
    matchingSection.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  } else {
    showToast(
      "Esta sección se agregará próximamente."
    );
  }
}

function showFavorites() {
  const favorites =
    state.catalog.filter(content =>
      state.favorites.has(content.id)
    );

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
    behavior: "smooth",
    block: "start"
  });
}


/* =========================
   17. DATOS LOCALES
   ========================= */

function restoreLocalData() {
  try {
    const savedFavorites =
      JSON.parse(
        localStorage.getItem(
          "planixFavorites"
        ) || "[]"
      );

    state.favorites =
      new Set(savedFavorites);

    state.continueWatching =
      JSON.parse(
        localStorage.getItem(
          "planixContinueWatching"
        ) || "{}"
      );
  } catch (error) {
    console.warn(
      "No se pudieron recuperar los datos guardados.",
      error
    );

    state.favorites = new Set();
    state.continueWatching = {};
  }
}


/* =========================
   18. EVENTOS
   ========================= */

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
      if (state.selectedContent) {
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
        if (!elements.playerModal.hidden) {
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


/* =========================
   19. AYUDANTES
   ========================= */

function findContentById(id) {
  return state.catalog.find(
    content => content.id === id
  );
}

function configureCatalogCounter() {
  const configuredTotal =
    Number(
      state.config?.total || 0
    );

  const currentTotal =
    state.catalog.length;

  const total =
    configuredTotal || currentTotal;

  elements.catalogCounter.textContent =
    total
      ? `${total.toLocaleString("es-ES")} títulos`
      : "Catálogo";
}

function updateLoading(message, percentage) {
  elements.loadingMessage.textContent =
    message;

  elements.loadingProgressBar.style.width =
    `${Math.max(
      0,
      Math.min(100, percentage)
    )}%`;
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");

  clearTimeout(showToast.timer);

  showToast.timer =
    window.setTimeout(() => {
      elements.toast.classList.remove(
        "show"
      );
    }, PLANIX_CONFIG.toastDuration);
}

function debounce(callback, delay) {
  let timer;

  return (...argumentsList) => {
    clearTimeout(timer);

    timer = window.setTimeout(() => {
      callback(...argumentsList);
    }, delay);
  };
      }
