// --- GLOBALNO STANJE APLIKACIJE ---
let config = null;
let timelineIndex = -1; // Kreće od -1 (Splash ekran)
let isTransitioning = false;
let globalAudio = null;
let ssAudio = null;
let videoElement = null;
let petalsInterval = null;

// Tajmeri za galerije
let finalAutoplayTimer = null;
let ramAutoplayTimer = null;
const albumIndices = {};
const isAlbumActive = {};

// Globalne reference za audio intervale
let globalFadeInterval = null;
let videoFadeInterval = null;

// Trenutno otvoreni album u Zoom režimu
let activeZoomAlbumId = null;

// --- UNIVERZALNI RESET (MODULARNI ČISTAČ) ---
function resetStage() {
    const vidOverlay = document.getElementById("fullscreen-video-overlay");
    if (vidOverlay) { vidOverlay.classList.remove("active"); vidOverlay.style.display = "none"; }

    document.getElementById("skip-catcher").style.display = "none";
    const zones = ["loader", "global-barrier", "main-content", "main-bg", "main-overlay", "epilogue-screen"];
    zones.forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.style.display = "none"; el.classList.remove("visible"); }
    });

    document.querySelectorAll(".page").forEach(p => {
        p.classList.remove("active");
        p.style.display = "none";
    });
}

// --- INICIJALIZACIJA I DOHVATANJE JSON-A ---
// --- INICIJALIZACIJA I DOHVATANJE JSON-A (LIVE SERVER EDITION) ---
window.addEventListener("DOMContentLoaded", () => {
    globalAudio = document.getElementById("global-audio");
    ssAudio = document.getElementById("ss-audio");
    videoElement = document.getElementById("p-vid");

    // Menjamo putanju da gađa Cloudflare funkciju umesto statičkog fajla
    fetch('/get_config?subdomain=canvas&nocache=' + Date.now())
        .then(response => {
            if (!response.ok) throw new Error("Server je vratio grešku: " + response.status);
            return response.json();
        })
        .then(jsonData => {
            config = jsonData;
            applyGlobalSettings();
            setupAppLaunch();
            setupZoomArrows();
        })
        .catch(err => console.error("Greška pri učitavanju konfiguracije sa live servera:", err));

    if (videoElement) {
        videoElement.addEventListener("ended", () => {
            if (!isTransitioning) {
                console.log("Videoended okidač aktiviran.");
                nextStep();
            }
        });
    }
});

function applyGlobalSettings() {
    const settings = config.config.globalSettings;
    const root = document.documentElement.style;

    // 1. Mapiranje modularnih boja
    root.setProperty('--primary-color', settings.primaryColor);
    root.setProperty('--secondary-color', settings.secondaryColor || settings.primaryColor);
    root.setProperty('--text-color', settings.textColor);
    root.setProperty('--meta-color', settings.metaColor || '#a0acb8');
    root.setProperty('--bg-color', settings.backgroundColor);
    root.setProperty('--container-bg', settings.containerBg || '#1c2a39');

    // 2. Mapiranje fontova
    root.setProperty('--font-header', `'${settings.fontHeader}', serif`);
    root.setProperty('--font-body', `'${settings.fontBody}', sans-serif`);
    if (settings.fontQuote) {
        root.setProperty('--font-quote', `'${settings.fontQuote}', serif`);
    }

    // 3. Punjenje uvodnih tekstova
    document.getElementById("loader-title").innerText = settings.projectName;
    document.getElementById("loader-subtitle").innerText = settings.projectSubtitle;

    // 4. Multimedija i ambijent
    if (ssAudio && settings.screensaverMusic) ssAudio.src = settings.screensaverMusic;

    const loaderAudio = document.getElementById("loader-audio");
    if (loaderAudio && settings.loaderMusic) loaderAudio.src = settings.loaderMusic;

    const mainBg = document.getElementById("main-bg");
    if (mainBg && settings.mainBackgroundImage) {
        mainBg.style.backgroundImage = `url('${settings.mainBackgroundImage}')`;
    }

    // 5. Poruke upozorenja
    if (config.config.hasWarningMessage) {
        document.getElementById("warning-title").innerText = config.loader.warningTitle;
        if (document.getElementById("warning-final-line")) {
            document.getElementById("warning-final-line").innerText = config.loader.warningFinalLine || '';
        }

        const slotsContainer = document.getElementById("warning-text-slots");
        if (slotsContainer) {
            slotsContainer.innerHTML = "";
            config.loader.warningTexts.forEach(txt => {
                const p = document.createElement("p");
                p.innerText = txt;
                slotsContainer.appendChild(p);
            });
        }
    }

    initSelectionScreensaver(settings.screensaverTimeout || 60);
}

// --- BIOMERIČKI SELECTION SCREENSAVER ENGINE ---
let ssIdleTimer = null;
let isScreensaverActive = false;

function initSelectionScreensaver(timeoutInSeconds) {
    const timeoutMs = timeoutInSeconds * 1000;
    const ssLayer = document.getElementById("screensaver-layer");

    function resetIdleTimer() {
        if (isScreensaverActive) {
            isScreensaverActive = false;
            if (ssLayer) {
                ssLayer.style.transition = "opacity 1000ms ease-out";
                ssLayer.classList.remove("active");
                setTimeout(() => { if (!isScreensaverActive) ssLayer.style.display = "none"; }, 1000);
            }
            if (ssAudio) ssAudio.pause();
            if (globalAudio && timelineIndex !== -1) globalAudio.play().catch(() => { });
        }

        clearTimeout(ssIdleTimer);
        if (timelineIndex > -1) ssIdleTimer = setTimeout(activateScreensaver, timeoutMs);
    }

    function activateScreensaver() {
        if (isTransitioning || isScreensaverActive) return;
        isScreensaverActive = true;

        if (ssLayer) {
            ssLayer.style.display = "flex";
            setTimeout(() => { ssLayer.classList.add("active"); }, 50);
        }

        if (globalAudio) globalAudio.pause();

        if (ssAudio && config.config.globalSettings.screensaverMusic) {
            ssAudio.currentTime = 0;
            ssAudio.volume = 0.4;
            ssAudio.loop = true;
            ssAudio.play().catch(() => { });
        }
    }

    window.onmousemove = resetIdleTimer;
    window.onmousedown = resetIdleTimer;
    window.onclick = resetIdleTimer;
    window.onkeydown = resetIdleTimer;
    window.ontouchstart = resetIdleTimer;

    clearTimeout(ssIdleTimer);
    if (timelineIndex > -1) ssIdleTimer = setTimeout(activateScreensaver, timeoutMs);
}

function getModuleRegistry() {
    return {
        "video": renderVideo,
        "chapter": renderChapter,
        "gate": renderGate,
        "finale": renderFinale
    };
}

// --- UPRAVLJANJE TOKOM ---
function setupAppLaunch() {
    const ldr = document.getElementById("loader");
    if (!ldr) return;

    ldr.style.cursor = "pointer";
    ldr.onclick = (e) => {
        const warningBox = document.getElementById("warning-box");
        const isWarningVisible = warningBox && (warningBox.style.display === "block" || warningBox.classList.contains("active"));

        if (config.config.hasWarningMessage && isWarningVisible) {
            startAdventure(e);
            return;
        }

        requestFullscreen();

        if (globalAudio) {
            globalAudio.src = config.config.globalSettings.loaderMusic || config.config.globalSettings.screensaverMusic;
            globalAudio.volume = 0.5;
            globalAudio.loop = true;
            globalAudio.play().catch(err => console.error(err));
        }

        const promptPrompt = document.getElementById("click-to-begin-prompt");
        if (promptPrompt) promptPrompt.style.display = "none";

        if (config.config.hasWarningMessage) {
            const ldrHr = document.getElementById("loader-hr");
            if (ldrHr) ldrHr.style.display = "block";
            if (warningBox) warningBox.style.display = "block";
        } else {
            ldr.style.transition = "opacity 2000ms ease-out";
            ldr.style.opacity = "0";
            fadeOutAudio('global', 2000);
            setTimeout(() => {
                ldr.style.display = "none";
                nextStep();
            }, 2000);
        }
    };
    renderScene();
}

function startAdventure(event) {
    if (event) event.stopPropagation();
    const ldr = document.getElementById("loader");
    if (!ldr) return;

    fadeOutAudio('global', 2000);
    ldr.style.transition = "opacity 2000ms ease-out";
    ldr.style.opacity = "0";

    setTimeout(() => {
        ldr.style.display = "none";
        nextStep();
    }, 2000);
}

function nextStep() {
    if (isTransitioning) return;
    isTransitioning = true;

    if (videoElement && !videoElement.paused) videoElement.pause();

    const mask = document.getElementById("fade-overlay");
    mask.classList.add("active");

    fadeOutAudio('global', 2000);
    fadeOutAudio('video', 2000);
    clearInterval(ramAutoplayTimer);
    ramAutoplayTimer = null;
    stopFinalAutoplay();

    setTimeout(() => {
        if (videoElement) {
            videoElement.src = "";
            try { videoElement.load(); } catch (e) { }
        }

        timelineIndex++;
        window.scrollTo(0, 0);
        renderScene();

        mask.classList.remove("active");
        isTransitioning = false;
    }, 2000);
}

function prevStep() {
    if (isTransitioning || timelineIndex <= 0) return;
    isTransitioning = true;

    if (videoElement && !videoElement.paused) videoElement.pause();

    const mask = document.getElementById("fade-overlay");
    mask.classList.add("active");

    fadeOutAudio('global', 2000);
    fadeOutAudio('video', 2000);
    clearInterval(ramAutoplayTimer);
    ramAutoplayTimer = null;
    stopFinalAutoplay();

    setTimeout(() => {
        if (videoElement) {
            videoElement.src = "";
            try { videoElement.load(); } catch (e) { }
        }

        timelineIndex--;
        if (timelineIndex < 0) timelineIndex = 0;

        window.scrollTo(0, 0);
        renderScene();
        mask.classList.remove("active");
        isTransitioning = false;
    }, 2000);
}

function renderScene() {
    if (timelineIndex === -1 || timelineIndex >= config.timeline.length) return;

    resetStage();
    let block = config.timeline[timelineIndex];

    // CENTRALIZOVANO URPAVLJANJE EFEKTIMA (Nema više hardkodovanja u modulima!)
    stopParticles();
    if (block.sceneEffect && block.sceneEffect !== 'none') {
        config.config.loaderAnimationType = block.sceneEffect;
        startParticles();
    }

    playCorrectMusic();

    const registry = getModuleRegistry();
    if (registry[block.type]) {
        registry[block.type](block);
    } else {
        console.error("KRITIČNA GREŠKA: Nema registra za tip:", block.type);
    }
}

function renderVideo(block) {
    document.getElementById("skip-catcher").style.display = "block";

    const vOverlay = document.getElementById("fullscreen-video-overlay");
    vOverlay.style.display = "block";
    vOverlay.classList.add("active");

    videoElement.src = block.url;
    videoElement.currentTime = 0;
    videoElement.volume = 0;

    videoElement.play()
        .then(() => fadeInAudio('video', 2000))
        .catch((e) => {
            if (videoElement.src.includes(block.url) && !isTransitioning) {
                nextStep();
            }
        });
}

function renderGate(block) {
    document.documentElement.style.overflow = "hidden";
    const gateZone = document.getElementById("global-barrier");

    document.getElementById("global-gate-hint").innerText = block.hint || "Unesite lozinku za nastavak";

    const input = document.getElementById("global-gate-input");
    input.value = "";
    input.placeholder = block.placeholder || "Tvoja reč...";

    document.getElementById("global-gate-btn").innerText = block.buttonText || "Potvrdi";
    document.getElementById("global-gate-err").classList.remove("show");

    gateZone.style.display = "flex";
    setTimeout(() => gateZone.classList.add("visible"), 50);
    setTimeout(() => input.focus(), 100);
}

function renderChapter(block) {
    document.documentElement.style.overflow = "auto";

    const mainContent = document.getElementById("main-content");
    mainContent.innerHTML = "";
    mainContent.style.display = "block";
    document.getElementById("main-bg").style.display = "block";
    document.getElementById("main-overlay").style.display = "block";

    const page = document.createElement("div");
    page.className = "page active";
    page.style.display = "block";

    page.innerHTML = `
        <div class="letter-header">${block.title || ''}</div>
        <div class="chapter-subtitle">${block.subtitle || ''}</div>
        ${block.paragraphs.map(p => `<p>${p}</p>`).join('')}
    `;

    if (block.galleryImages && block.galleryImages.length > 0) {
        const albumId = `album-${timelineIndex}`;
        albumIndices[albumId] = 0;
        isAlbumActive[albumId] = false;

        const frame = document.createElement("div");
        frame.className = "autoplay-album-frame";
        frame.id = albumId;
        frame.setAttribute("onclick", `handleAlbumClick('${albumId}')`);

        const imgA = document.createElement("img");
        imgA.id = `${albumId}-a`;
        imgA.src = block.galleryImages[0];
        imgA.className = "autoplay-slide active";

        const imgB = document.createElement("img");
        imgB.id = `${albumId}-b`;
        imgB.src = "";
        imgB.className = "autoplay-slide";

        frame.appendChild(imgA);
        frame.appendChild(imgB);
        page.appendChild(frame);
    }

    const flexWrapper = document.createElement("div");
    flexWrapper.className = "final-nav-flex-wrapper";

    if (timelineIndex > 0) {
        const backBtn = document.createElement("button");
        backBtn.className = "inner-back-btn";
        backBtn.setAttribute("onclick", "prevStep()");
        backBtn.innerHTML = "‹";
        flexWrapper.appendChild(backBtn);
    }

    const nextBtn = document.createElement("button");
    nextBtn.className = "next-page-btn-gold";
    nextBtn.innerText = block.nextButtonText || "Next";
    nextBtn.setAttribute("onclick", "nextStep()");
    flexWrapper.appendChild(nextBtn);

    page.appendChild(flexWrapper);
    mainContent.appendChild(page);
}

function checkGlobalGate() {
    const inputEl = document.getElementById("global-gate-input");
    if (!inputEl) return;

    const val = inputEl.value.toLowerCase().trim();
    const currentBlock = config.timeline[timelineIndex];

    if (!currentBlock || currentBlock.type !== "gate") return;

    // Master ključ za testiranje na lokaciji (Dorćol)
    if (val === "33") {
        nextStep();
        return;
    }

    let lozinke = Array.isArray(currentBlock.answers) ? currentBlock.answers : [currentBlock.answers];
    const isPrimaryMatch = lozinke.some(ans => ans.toLowerCase().trim() === val);

    if (isPrimaryMatch) {
        nextStep();
        return;
    }

    showError("global-gate-err", currentBlock.errorMessage || "Pokušaj ponovo.");
}

document.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        const activeGate = document.getElementById("global-barrier");
        if (activeGate && (activeGate.style.display === "flex" || activeGate.classList.contains("visible"))) {
            checkGlobalGate();
        }
    }
});

function playCorrectMusic() {
    if (!globalAudio || !config) return;
    let track = "";

    if (timelineIndex === -1) {
        track = config.config.globalSettings.loaderMusic || config.config.globalSettings.screensaverMusic;
    } else {
        let currentBlock = config.timeline[timelineIndex];
        track = currentBlock.bgMusicUrl || "";
    }

    if (!track || track.trim() === "") {
        globalAudio.pause();
        return;
    }

    if (globalAudio.src && globalAudio.src.includes(encodeURIComponent(track))) {
        if (globalAudio.paused) globalAudio.play().catch(() => { });
        return;
    }

    globalAudio.src = track;
    globalAudio.volume = 0.5;
    globalAudio.loop = true;
    globalAudio.play().catch(() => { });
}

function fadeOutAudio(type, duration) {
    const el = (type === 'global') ? globalAudio : videoElement;
    let intervalRef = (type === 'global') ? globalFadeInterval : videoFadeInterval;

    if (!el || el.paused || el.volume === 0) return;

    clearInterval(intervalRef);
    const startVolume = el.volume;
    const intervalTime = 50;
    const steps = duration / intervalTime;
    const volumeStep = startVolume / steps;

    intervalRef = setInterval(() => {
        if (!el) { clearInterval(intervalRef); return; }
        if (el.volume > volumeStep) {
            el.volume -= volumeStep;
        } else {
            el.volume = 0; el.pause(); clearInterval(intervalRef);
        }
    }, intervalTime);

    if (type === 'global') globalFadeInterval = intervalRef;
    else videoFadeInterval = intervalRef;
}

function fadeInAudio(type, duration) {
    const el = (type === 'global') ? globalAudio : videoElement;
    let intervalRef = (type === 'global') ? globalFadeInterval : videoFadeInterval;

    if (!el || el.paused) return;

    clearInterval(intervalRef);
    el.volume = 0;
    const targetVolume = (type === 'global') ? 0.5 : 1.0;
    const intervalTime = 50;
    const steps = duration / intervalTime;
    const volumeStep = targetVolume / steps;

    intervalRef = setInterval(() => {
        if (!el || el.paused) { clearInterval(intervalRef); return; }
        if (el.volume + volumeStep < targetVolume) {
            el.volume += volumeStep;
        } else {
            el.volume = targetVolume; clearInterval(intervalRef);
        }
    }, intervalTime);

    if (type === 'global') globalFadeInterval = intervalRef;
    else videoFadeInterval = intervalRef;
}

function handleAlbumClick(albumId) {
    const blockIndex = parseInt(albumId.split("-")[1]);
    const images = config.timeline[blockIndex].galleryImages;

    if (!isAlbumActive[albumId]) {
        isAlbumActive[albumId] = true;
        let nextIndex = 1 % images.length;
        albumIndices[albumId] = nextIndex;
        updateAlbumDom(albumId, images[nextIndex]);

        clearInterval(ramAutoplayTimer);
        ramAutoplayTimer = setInterval(() => {
            let idx = albumIndices[albumId] || 0;
            let nextSlideIndex = (idx + 1) % images.length;

            if (nextSlideIndex === 0) {
                clearInterval(ramAutoplayTimer);
                ramAutoplayTimer = null;
                isAlbumActive[albumId] = false;
            }

            albumIndices[albumId] = nextSlideIndex;
            updateAlbumDom(albumId, images[nextSlideIndex]);
        }, 3000);

    } else {
        clearInterval(ramAutoplayTimer);
        ramAutoplayTimer = null;
        openZoomOverlay(albumId, images);
    }
}

function updateAlbumDom(albumId, src) {
    const slideA = document.getElementById(`${albumId}-a`);
    const slideB = document.getElementById(`${albumId}-b`);
    if (!slideA || !slideB) return;

    if (slideA.classList.contains("active")) {
        slideB.src = src; slideA.classList.remove("active"); slideB.classList.add("active");
    } else {
        slideA.src = src; slideB.classList.remove("active"); slideA.classList.add("active");
    }
}

function openZoomOverlay(albumId, images) {
    activeZoomAlbumId = albumId;
    const overlay = document.getElementById("image-zoom-overlay");
    const zoomedImg = document.getElementById("zoomed-img");
    let idx = albumIndices[albumId] || 0;

    if (!zoomedImg || !overlay) return;

    overlay.style.transition = "none";
    zoomedImg.style.transition = "none";
    overlay.style.display = "flex";
    overlay.style.pointerEvents = "auto";
    overlay.style.opacity = "0";
    zoomedImg.style.opacity = "0";
    zoomedImg.style.transform = "scale(0.95) rotate(-0.5deg)";

    zoomedImg.src = images[idx];

    setTimeout(() => {
        overlay.style.transition = "opacity 600ms ease-in-out";
        zoomedImg.style.transition = "transform 600ms ease-in-out, opacity 600ms ease-in-out";
        overlay.style.opacity = "1";
        overlay.classList.add("active");
        zoomedImg.style.opacity = "1";
        zoomedImg.style.transform = "scale(1) rotate(0deg)";
    }, 50);

    clearInterval(finalAutoplayTimer);
    finalAutoplayTimer = setInterval(() => { zoomNextSlide(albumId); }, 7700);
}

function zoomNextSlide(albumId) {
    const zoomedImg = document.getElementById("zoomed-img");
    const blockIndex = parseInt(albumId.split("-")[1]);
    const images = config.timeline[blockIndex].galleryImages;
    if (!zoomedImg) return;

    zoomedImg.style.transition = "none";
    requestAnimationFrame(() => {
        zoomedImg.style.transition = "opacity 800ms ease-in-out";
        zoomedImg.style.opacity = "0";
    });

    setTimeout(() => {
        let currentIndex = albumIndices[albumId] || 0;
        let nextIndex = (currentIndex + 1) % images.length;

        if (nextIndex === 0) { closeImageZoom(); return; }

        albumIndices[albumId] = nextIndex;
        zoomedImg.style.transition = "none";

        zoomedImg.onload = function () {
            setTimeout(() => {
                zoomedImg.style.transition = "opacity 1200ms ease-out";
                zoomedImg.style.opacity = "1";
                zoomedImg.onload = null;
            }, 300);
        };
        zoomedImg.src = images[nextIndex];
    }, 1400);
}

function zoomManualNavigate(direction) {
    if (!activeZoomAlbumId) return;

    const zoomedImg = document.getElementById("zoomed-img");
    const blockIndex = parseInt(activeZoomAlbumId.split("-")[1]);
    const images = config.timeline[blockIndex].galleryImages;
    if (!zoomedImg) return;

    clearInterval(finalAutoplayTimer);
    zoomedImg.style.transition = "none";
    requestAnimationFrame(() => {
        zoomedImg.style.transition = "opacity 800ms ease-in-out";
        zoomedImg.style.opacity = "0";
    });

    setTimeout(() => {
        let currentIndex = albumIndices[activeZoomAlbumId] || 0;
        let nextIndex = (currentIndex + direction + images.length) % images.length;

        albumIndices[activeZoomAlbumId] = nextIndex;
        zoomedImg.style.transition = "none";

        zoomedImg.onload = function () {
            setTimeout(() => {
                zoomedImg.style.transition = "opacity 1200ms ease-out";
                zoomedImg.style.opacity = "1";
                zoomedImg.onload = null;
                finalAutoplayTimer = setInterval(() => { zoomNextSlide(activeZoomAlbumId); }, 7700);
            }, 300);
        };
        zoomedImg.src = images[nextIndex];
    }, 1400);
}

function closeImageZoom() {
    const overlay = document.getElementById("image-zoom-overlay");
    const zoomedImg = document.getElementById("zoomed-img");

    clearInterval(finalAutoplayTimer); finalAutoplayTimer = null;
    clearInterval(ramAutoplayTimer); ramAutoplayTimer = null;

    if (overlay) {
        overlay.classList.remove("active");
        overlay.style.pointerEvents = "none";
        overlay.style.transition = "opacity 1000ms ease-in-out";
        overlay.style.opacity = "0";
    }

    if (zoomedImg) {
        zoomedImg.style.transition = "transform 1000ms ease-in-out, opacity 1000ms ease-in-out";
        zoomedImg.style.opacity = "0";
        zoomedImg.style.transform = "scale(0.95) rotate(-0.5deg)";
    }

    document.documentElement.style.overflow = "auto";

    setTimeout(() => {
        if (overlay) overlay.style.display = "none";
        if (activeZoomAlbumId) {
            albumIndices[activeZoomAlbumId] = 0;
            isAlbumActive[activeZoomAlbumId] = false;

            const slideA = document.getElementById(activeZoomAlbumId + "-a");
            const slideB = document.getElementById(activeZoomAlbumId + "-b");

            if (slideA && slideB) {
                slideA.classList.remove("active"); slideB.classList.remove("active");
                setTimeout(() => {
                    const blockIndex = parseInt(activeZoomAlbumId.split("-")[1]);
                    slideA.src = config.timeline[blockIndex].galleryImages[0];
                    slideB.src = "";
                    slideA.classList.add("active");
                    activeZoomAlbumId = null;
                }, 400);
            }
        }
    }, 1050);
}

function setupZoomArrows() {
    const overlay = document.getElementById("image-zoom-overlay");
    const zoomedImg = document.getElementById("zoomed-img");
    if (!overlay) return;

    if (!document.getElementById("zoom-arrow-l")) {
        const arrowL = document.createElement("button");
        arrowL.id = "zoom-arrow-l"; arrowL.className = "zoom-global-arrow arrow-left"; arrowL.innerHTML = "‹";
        arrowL.setAttribute("onclick", "event.stopPropagation(); zoomManualNavigate(-1)");
        overlay.appendChild(arrowL);
    }

    if (!document.getElementById("zoom-arrow-r")) {
        const arrowR = document.createElement("button");
        arrowR.id = "zoom-arrow-r"; arrowR.className = "zoom-global-arrow arrow-right"; arrowR.innerHTML = "›";
        arrowR.setAttribute("onclick", "event.stopPropagation(); zoomManualNavigate(1)");
        overlay.appendChild(arrowR);
    }

    overlay.onclick = () => { closeImageZoom(); };
    if (zoomedImg) zoomedImg.onclick = (e) => { e.stopPropagation(); closeImageZoom(); };
}

function stopFinalAutoplay() { clearInterval(finalAutoplayTimer); finalAutoplayTimer = null; }

// --- ČESTICE ---
function startParticles() {
    if (petalsInterval || config.config.loaderAnimationType === "none") return;
    petalsInterval = setInterval(createParticle, 750);
}

function stopParticles() {
    clearInterval(petalsInterval); petalsInterval = null;
    const container = document.getElementById('particles-container');
    if (container) container.innerHTML = "";
}

function createParticle() {
    const container = document.getElementById('particles-container');
    if (!container) return;

    const p = document.createElement('div');
    p.className = `particle ${config.config.loaderAnimationType}`;

    const type = config.config.loaderAnimationType;
    if (type === "rose-petals") {
        p.style.background = "linear-gradient(135deg, #b81d24, #6d0a0f)";
        p.style.borderRadius = "150% 0 150% 150%";
    } else if (type === "confetti") {
        const colors = ["#cca462", "#ff4d4d", "#4da6ff", "#ffff4d", "#4dff4d"];
        p.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    } else if (type === "snow") {
        p.style.backgroundColor = "#ffffff"; p.style.borderRadius = "50%";
    }

    const size = Math.random() * 10 + 6 + 'px';
    p.style.width = size; p.style.height = size;
    p.style.left = Math.random() * 100 + 'vw';
    p.style.animationDuration = Math.random() * 3 + 4 + 's';

    container.appendChild(p);
    setTimeout(() => p.remove(), 6000);
}

function renderFinale(block) {
    resetStage();
    const barrier = document.getElementById("global-barrier");
    if (barrier) barrier.remove();

    const mainContent = document.getElementById("main-content");
    mainContent.innerHTML = "";
    mainContent.style.display = "block";
    document.getElementById("main-bg").style.display = "block";
    document.getElementById("main-overlay").style.display = "block";
    document.documentElement.style.overflow = "auto";

    const fPage = document.createElement("div");
    fPage.id = "ch-finale";
    fPage.className = `page active`;
    fPage.style.display = "block";
    fPage.innerHTML = `
        <div class="gold-corner corner-tl"></div><div class="gold-corner corner-tr"></div>
        <div class="gold-corner corner-bl"></div><div class="gold-corner corner-br"></div>
        <div id="final-love-msg">${block.finalLoveMessage || 'Kraj priče'}</div>
        <div id="final-signature">${block.finalSignature || ''}</div>
        <div class="rose-gommage-wrapper robot-final-container" id="final-reset-btn" tabindex="0">
            <img src="${block.endIconType || 'images/rose.png'}" alt="Icon" class="rose-icon final-rose-pulse" style="object-fit: contain; border: none;">
            <span class="${config.config.textEffectType === 'laser-red' ? 'laser-red' : 'laser-gold'}">${block.endIconLabel || 'Restartuj'}</span>
        </div>
    `;
    mainContent.appendChild(fPage);

    document.getElementById("final-reset-btn").onclick = function () { executeEpilogue(block); };

    setTimeout(() => { document.getElementById("final-love-msg").style.opacity = "1"; }, 500);
    setTimeout(() => { document.getElementById("final-signature").style.opacity = "1"; }, 1500);
    setTimeout(() => {
        const rbtn = document.getElementById("final-reset-btn");
        if (rbtn) { rbtn.style.opacity = "1"; rbtn.classList.add("active"); }
    }, 2500);
}

// --- POMOĆNI SISTEMSKI ALATI ---
function requestFullscreen() {
    const docEl = document.documentElement;
    if (docEl.requestFullscreen) docEl.requestFullscreen().catch(() => { });
}

function showError(id, msg) {
    const err = document.getElementById(id);
    if (err) {
        err.innerText = msg; err.classList.add("show");
        setTimeout(() => err.classList.remove("show"), 3000);
    }
}

document.getElementById("skip-catcher").onclick = (e) => {
    e.stopPropagation();
    if (!window.skipClicks) window.skipClicks = 0;
    window.skipClicks++;
    if (window.skipClicks === 3) { window.skipClicks = 0; nextStep(); }
};

window.executeEpilogue = function (block) {
    console.log("Epilog pokrenut!");
    document.getElementById("stage").style.display = "none";
    const epi = document.getElementById("epilogue-screen");
    const artSlot = document.getElementById("art-quote-slot");
    const paintLbl = document.getElementById("paint-label");

    if (!epi) return;

    epi.style.display = "flex";
    setTimeout(() => epi.classList.add("visible"), 50);

    if (globalAudio) {
        globalAudio.src = block.epilogueMusic;
        globalAudio.loop = false;
        globalAudio.volume = 1;
        globalAudio.play().catch(e => console.error("Audio error:", e));
    }

    artSlot.innerText = block.epilogueQuote;
    artSlot.style.opacity = "0";
    paintLbl.innerText = block.epilogueFinalLabel;
    paintLbl.style.opacity = "0";

    setTimeout(() => artSlot.style.opacity = "1", 1500);
    setTimeout(() => artSlot.style.opacity = "0", 12000);
    setTimeout(() => paintLbl.style.opacity = "1", 14000);

    setTimeout(() => {
        paintLbl.style.opacity = "0";
        const mask = document.getElementById("fade-overlay");
        mask.style.zIndex = "100050";
        mask.classList.add("active");
        setTimeout(() => { localStorage.clear(); location.reload(); }, 3000);
    }, 22000);
};