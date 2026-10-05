/**
 * Portfolio Robin Wattier - Core Script
 * Expérience interactive, grille responsive fluide et lightbox tactile
 */

(function () {
  'use strict';

  // --- State Variables ---
  let galleryItems = [];
  let lightboxIndex = 0;
  let isLightboxOpen = false;

  // Touch & Drag state for Lightbox
  let touchStartX = 0;
  let touchStartY = 0;
  let isMouseDown = false;
  let dragStartX = 0;
  let dragDeltaX = 0;

  // DOM Elements
  const gridEl = document.getElementById('projects-grid');
  const lightboxEl = document.getElementById('lightbox');
  const lbMediaEl = document.getElementById('lb-media');
  const lbCounterEl = document.getElementById('lb-counter');
  const burgerBtn = document.getElementById('burger-btn');
  const mobileMenu = document.getElementById('mobile-menu');
  const scrollTopBtn = document.getElementById('scroll-top');

  // --- Shuffle Utility ---
  function shuffleArray(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  // --- IntersectionObserver for Scroll Reveal ---
  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          observer.unobserve(entry.target);
        }
      });
    },
    {
      root: null,
      threshold: 0.05,
      rootMargin: '0px 0px 40px 0px',
    }
  );

  function observeItems() {
    const items = document.querySelectorAll(
      '.item:not(.revealed), .studio-section:not(.revealed), .timeline-item:not(.revealed), .flow-step:not(.revealed)'
    );
    items.forEach((item) => revealObserver.observe(item));
  }

  // --- Build Grid ---
  function buildGrid(items) {
    if (!gridEl) return;
    gridEl.innerHTML = '';

    galleryItems = items;

    if (!items || items.length === 0) {
      gridEl.innerHTML =
        '<p style="color:var(--fg-muted);font-size:13px;padding:40px 0;grid-column:1/-1;text-align:center;">Aucun projet trouvé.</p>';
      return;
    }

    const fragment = document.createDocumentFragment();

    items.forEach((item, index) => {
      const card = document.createElement('div');
      card.className = 'item';
      if (item.size === 'small' || item.small) {
        card.classList.add('item-small');
      }
      card.setAttribute('data-index', index);
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', `Voir le projet ${item.title || index + 1}`);

      // Aspect ratio reservation to eliminate Cumulative Layout Shift (CLS)
      if (item.w && item.h) {
        card.style.aspectRatio = `${item.w} / ${item.h}`;
      }

      const mediaWrap = document.createElement('div');
      mediaWrap.className = 'item-media-wrap';

      const isVideo = item.type === 'video' || (item.src && item.src.endsWith('.mp4'));
      const isCarousel = item.type === 'carousel' || (Array.isArray(item.slides) && item.slides.length > 1);

      if (isCarousel) {
        card.classList.add('is-carousel');

        const track = document.createElement('div');
        track.className = 'carousel-track';

        const slideImgs = [];
        item.slides.forEach((slideSrc, sIdx) => {
          const sImg = document.createElement('img');
          sImg.src = slideSrc;
          sImg.alt = `${item.title || 'Carrousel'} - Diapositive ${sIdx + 1}`;
          sImg.className = sIdx === 0 ? 'carousel-slide active' : 'carousel-slide';
          sImg.loading = sIdx === 0 ? 'eager' : 'lazy';
          sImg.decoding = 'async';
          sImg.draggable = false;
          sImg.onerror = function () {
            if (item.fallbackSrc && sImg.src !== item.fallbackSrc) {
              sImg.src = item.fallbackSrc;
            }
          };
          track.appendChild(sImg);
          slideImgs.push(sImg);
        });
        mediaWrap.appendChild(track);

        // Matchbox-style Pill Indicators
        const indicatorsWrap = document.createElement('div');
        indicatorsWrap.className = 'carousel-indicators';
        indicatorsWrap.setAttribute('aria-hidden', 'true');

        const dots = [];
        item.slides.forEach((_, sIdx) => {
          const dot = document.createElement('span');
          dot.className = sIdx === 0 ? 'carousel-dot active' : 'carousel-dot';
          indicatorsWrap.appendChild(dot);
          dots.push(dot);
        });
        mediaWrap.appendChild(indicatorsWrap);

        // Instagram multi-post badge
        const badge = document.createElement('div');
        badge.className = 'carousel-badge';
        badge.setAttribute('aria-hidden', 'true');
        badge.title = 'Carrousel Instagram (survoler pour défiler)';
        badge.innerHTML = `<svg viewBox="0 0 24 24"><rect x="3" y="3" width="13" height="13" rx="2.5"></rect><path d="M8 21h11a2 2 0 0 0 2-2V8"></path></svg>`;
        mediaWrap.appendChild(badge);

        // Hover auto-advance (Matchbox style)
        let currentSlide = 0;
        let carouselInterval = null;

        const setSlide = (idx) => {
          currentSlide = idx;
          slideImgs.forEach((img, i) => img.classList.toggle('active', i === idx));
          dots.forEach((dot, i) => dot.classList.toggle('active', i === idx));
        };

        const startCarousel = () => {
          card.classList.add('is-hovered');
          clearInterval(carouselInterval);
          carouselInterval = setInterval(() => {
            const nextIdx = (currentSlide + 1) % item.slides.length;
            setSlide(nextIdx);
          }, 1100);
        };

        const stopCarousel = () => {
          card.classList.remove('is-hovered');
          clearInterval(carouselInterval);
          setSlide(0);
        };

        card.addEventListener('mouseenter', startCarousel);
        card.addEventListener('mouseleave', stopCarousel);
        card.addEventListener('pointerleave', stopCarousel);
        card.addEventListener('blur', stopCarousel);
        card.addEventListener('reset-hover', stopCarousel);
      } else if (isVideo) {
        if (item.poster) {
          const posterImg = document.createElement('img');
          posterImg.src = item.poster;
          posterImg.alt = item.title || `Miniature ${index + 1}`;
          posterImg.className = 'item-poster-img';
          posterImg.loading = 'lazy';
          posterImg.decoding = 'async';
          posterImg.draggable = false;
          posterImg.onerror = function () {
            if (item.fallbackSrc && posterImg.src !== item.fallbackSrc) {
              posterImg.src = item.fallbackSrc;
            }
          };
          mediaWrap.appendChild(posterImg);
        }

        const video = document.createElement('video');
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.preload = 'metadata';

        if (item.poster) {
          video.className = 'item-hover-video';
          video.poster = item.poster;
        }

        const source = document.createElement('source');
        source.src = item.src;
        const ext = item.src.split('.').pop().toLowerCase();
        source.type = ext === 'webm' ? 'video/webm' : 'video/mp4';

        // Graceful fallback to remote host if local file fails
        source.onerror = function () {
          if (item.fallbackSrc && source.src !== item.fallbackSrc) {
            source.src = item.fallbackSrc;
            video.load();
          }
        };

        video.appendChild(source);
        mediaWrap.appendChild(video);

        // Hover Play / Pause Interaction (Desktop & Touch Safety)
        const initialTime = typeof item.startTime === 'number' ? item.startTime : 0;
        const endTime = typeof item.endTime === 'number' ? item.endTime : 0;

        // Custom time bounds should not trigger native full-file loop
        if (endTime > initialTime) {
          video.loop = false;
          video.preload = 'auto';
        }

        if (initialTime > 0) {
          video.addEventListener('loadedmetadata', () => {
            try {
              video.currentTime = initialTime;
            } catch (e) {}
          });
        }

        let loopRafId = null;
        const checkBounds = () => {
          if (endTime > initialTime && video.currentTime >= endTime) {
            video.currentTime = initialTime;
          }
          if (!video.paused && !video.ended) {
            loopRafId = requestAnimationFrame(checkBounds);
          }
        };

        const startHover = () => {
          card.classList.add('is-hovered');
          if (endTime > initialTime) {
            if (video.currentTime < initialTime || video.currentTime >= endTime - 0.05) {
              try {
                video.currentTime = initialTime;
              } catch (e) {}
            }
          } else if (initialTime > 0 && video.currentTime < initialTime) {
            try {
              video.currentTime = initialTime;
            } catch (e) {}
          }

          const playPromise = video.play();
          if (playPromise !== undefined) {
            playPromise
              .then(() => {
                if (endTime > initialTime) {
                  cancelAnimationFrame(loopRafId);
                  loopRafId = requestAnimationFrame(checkBounds);
                }
              })
              .catch(() => {});
          }
        };

        const stopHover = () => {
          card.classList.remove('is-hovered');
          cancelAnimationFrame(loopRafId);
          video.pause();
          try {
            video.currentTime = initialTime;
          } catch (e) {}
        };

        if (initialTime > 0 && endTime > initialTime) {
          video.addEventListener('timeupdate', () => {
            if (video.currentTime >= endTime) {
              video.currentTime = initialTime;
            }
          });
        }

        card.addEventListener('mouseenter', startHover);
        card.addEventListener('mouseleave', stopHover);
        card.addEventListener('pointerleave', stopHover);
        card.addEventListener('blur', stopHover);

        // Add subtle video badge if featured, hasBadge, or youtube
        if (item.hasBadge || item.featured || item.type === 'youtube') {
          const badge = document.createElement('div');
          badge.className = 'video-badge';
          badge.setAttribute('aria-hidden', 'true');
          badge.innerHTML = `<svg viewBox="0 0 24 24"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>`;
          mediaWrap.appendChild(badge);
        }
      } else {
        const img = document.createElement('img');
        img.src = item.src;
        img.alt = item.title || `Création ${index + 1}`;
        img.loading = 'lazy';
        img.decoding = 'async';
        img.draggable = false;

        // Image fallback on error
        img.onerror = function () {
          if (item.fallbackSrc && img.src !== item.fallbackSrc) {
            img.src = item.fallbackSrc;
          }
        };

        mediaWrap.appendChild(img);

        // If it's a youtube project, add the video play badge
        if (item.type === 'youtube') {
          const badge = document.createElement('div');
          badge.className = 'video-badge';
          badge.setAttribute('aria-hidden', 'true');
          badge.innerHTML = `<svg viewBox="0 0 24 24"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>`;
          mediaWrap.appendChild(badge);
        }

        // If it's a PDF project, add a document badge and set pointer cursor
        if (item.type === 'pdf') {
          const badge = document.createElement('div');
          badge.className = 'pdf-badge';
          badge.setAttribute('aria-hidden', 'true');
          badge.title = 'Document PDF (cliquer pour ouvrir)';
          badge.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>`;
          mediaWrap.appendChild(badge);
          card.style.cursor = 'pointer';
        }

        // If it's an external link / website project, add an external link badge and pointer cursor
        if (item.type === 'link' || item.type === 'website') {
          const badge = document.createElement('div');
          badge.className = 'link-badge';
          badge.setAttribute('aria-hidden', 'true');
          badge.title = 'Lien externe (cliquer pour ouvrir)';
          badge.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`;
          mediaWrap.appendChild(badge);
          card.style.cursor = 'pointer';
        }
      }

      card.appendChild(mediaWrap);

      // Open PDF / External Link directly or Open Lightbox on Click or Enter
      card.addEventListener('click', () => {
        if (item.type === 'link' || item.type === 'website' || item.type === 'pdf' || (item.link && item.link.endsWith('.pdf'))) {
          const targetUrl = item.link || item.pdf || item.src;
          window.open(targetUrl, '_blank', 'noopener,noreferrer');
          return;
        }
        openLightbox(index);
      });
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (item.type === 'link' || item.type === 'website' || item.type === 'pdf' || (item.link && item.link.endsWith('.pdf'))) {
            const targetUrl = item.link || item.pdf || item.src;
            window.open(targetUrl, '_blank', 'noopener,noreferrer');
            return;
          }
          openLightbox(index);
        }
      });

      fragment.appendChild(card);
    });

    gridEl.appendChild(fragment);

    // Run animations & layout
    requestAnimationFrame(() => {
      runMasonry();
      observeItems();
    });
  }

  // --- Dynamic Masonry for Mobile (<= 560px) ---
  function runMasonry() {
    if (!gridEl) return;
    const items = Array.from(gridEl.querySelectorAll('.item'));
    if (!items.length) return;

    const isMobile = window.innerWidth <= 560;

    if (!isMobile) {
      // Desktop & Tablet rely on native CSS columns
      gridEl.style.height = '';
      items.forEach((item) => {
        item.style.position = '';
        item.style.top = '';
        item.style.left = '';
        item.style.width = '';
        item.style.margin = '';
      });
      return;
    }

    // Two-column alternating absolute layout for mobile
    const gap = 10;
    const cols = 2;
    const gridWidth = gridEl.clientWidth;
    const colWidth = (gridWidth - gap) / cols;
    const colHeights = [0, 0];

    items.forEach((item, idx) => {
      const dataItem = galleryItems[idx];
      const isSmall = item.classList.contains('item-small') || (dataItem && (dataItem.size === 'small' || dataItem.small));
      const itemWidth = isSmall ? Math.round(colWidth * 0.72) : colWidth;
      let calculatedHeight;

      if (dataItem && dataItem.w && dataItem.h) {
        calculatedHeight = itemWidth * (dataItem.h / dataItem.w);
      } else {
        calculatedHeight = item.offsetHeight || itemWidth;
      }

      // Pick the shortest column
      const targetCol = colHeights[0] <= colHeights[1] ? 0 : 1;

      item.style.position = 'absolute';
      item.style.width = `${itemWidth}px`;
      if (isSmall) {
        const offsetLeft = targetCol * (colWidth + gap) + Math.round((colWidth - itemWidth) / 2);
        item.style.left = `${offsetLeft}px`;
      } else {
        item.style.left = `${targetCol * (colWidth + gap)}px`;
      }
      item.style.top = `${colHeights[targetCol]}px`;
      item.style.margin = '0';

      colHeights[targetCol] += calculatedHeight + gap;
    });

    gridEl.style.height = `${Math.max(...colHeights)}px`;
  }

  // Window resize handler with debounce
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (window.innerWidth > 768) {
        closeMobileMenu();
      }
      runMasonry();
      observeItems();
    }, 60);
  });

  // --- Lightbox Implementation ---
  function openLightbox(index) {
    if (!galleryItems || galleryItems.length === 0) return;
    lightboxIndex = index;
    isLightboxOpen = true;

    // Reset all card hover states and pause all preview videos
    document.querySelectorAll('.item').forEach((c) => {
      c.classList.remove('is-hovered');
      const v = c.querySelector('video');
      if (v) {
        v.pause();
        try {
          v.currentTime = 0;
        } catch (e) {}
      }
    });

    renderLightboxMedia();

    if (lightboxEl) {
      lightboxEl.classList.add('open');
      lightboxEl.setAttribute('aria-hidden', 'false');
    }
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    isLightboxOpen = false;
    if (lightboxEl) {
      lightboxEl.classList.remove('open');
      lightboxEl.setAttribute('aria-hidden', 'true');
    }
    document.body.style.overflow = '';

    // Guarantee all cards revert to static thumbnails
    document.querySelectorAll('.item').forEach((c) => {
      c.classList.remove('is-hovered');
      c.dispatchEvent(new CustomEvent('reset-hover'));
      const v = c.querySelector('video');
      if (v) {
        v.pause();
        try {
          v.currentTime = 0;
        } catch (e) {}
      }
    });

    if (lbMediaEl) {
      const activeVideo = lbMediaEl.querySelector('video');
      if (activeVideo) activeVideo.pause();
      const iframe = lbMediaEl.querySelector('iframe');
      if (iframe) iframe.src = '';
      lbMediaEl.innerHTML = '';
    }
  }

  function lightboxNav(dir) {
    if (!galleryItems.length) return;
    lightboxIndex = (lightboxIndex + dir + galleryItems.length) % galleryItems.length;
    renderLightboxMedia();
  }

  function renderLightboxMedia() {
    if (!lbMediaEl || !galleryItems[lightboxIndex]) return;
    const item = galleryItems[lightboxIndex];

    lbMediaEl.classList.remove('lb-in');
    lbMediaEl.classList.add('lb-out');

    setTimeout(() => {
      lbMediaEl.innerHTML = '';

      if (item.type === 'carousel' || (Array.isArray(item.slides) && item.slides.length > 1)) {
        const carouselWrap = document.createElement('div');
        carouselWrap.className = 'lb-carousel-container';

        let activeSlideIdx = 0;
        const totalSlides = item.slides.length;

        const mainImg = document.createElement('img');
        mainImg.className = 'lb-carousel-img';
        mainImg.src = item.slides[0];
        mainImg.alt = `${item.title || 'Carrousel'} (1/${totalSlides})`;
        mainImg.draggable = false;
        carouselWrap.appendChild(mainImg);

        const controls = document.createElement('div');
        controls.className = 'lb-carousel-controls';

        const prevSlideBtn = document.createElement('button');
        prevSlideBtn.type = 'button';
        prevSlideBtn.className = 'lb-carousel-arrow';
        prevSlideBtn.setAttribute('aria-label', 'Diapositive précédente');
        prevSlideBtn.innerHTML = `<svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"></polyline></svg>`;

        const dotsContainer = document.createElement('div');
        dotsContainer.className = 'lb-carousel-dots';
        const dotsList = [];

        const subCounter = document.createElement('span');
        subCounter.className = 'lb-carousel-counter';
        subCounter.textContent = `1 / ${totalSlides}`;

        const updateSlide = (idx) => {
          activeSlideIdx = (idx + totalSlides) % totalSlides;
          mainImg.style.opacity = '0';
          setTimeout(() => {
            mainImg.src = item.slides[activeSlideIdx];
            mainImg.alt = `${item.title || 'Carrousel'} (${activeSlideIdx + 1}/${totalSlides})`;
            mainImg.style.opacity = '1';
          }, 100);
          dotsList.forEach((dot, i) => dot.classList.toggle('active', i === activeSlideIdx));
          subCounter.textContent = `${activeSlideIdx + 1} / ${totalSlides}`;
        };

        item.slides.forEach((_, i) => {
          const dot = document.createElement('button');
          dot.type = 'button';
          dot.className = i === 0 ? 'lb-carousel-dot active' : 'lb-carousel-dot';
          dot.setAttribute('aria-label', `Diapositive ${i + 1}`);
          dot.addEventListener('click', (e) => {
            e.stopPropagation();
            updateSlide(i);
          });
          dotsContainer.appendChild(dot);
          dotsList.push(dot);
        });

        prevSlideBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          updateSlide(activeSlideIdx - 1);
        });

        const nextSlideBtn = document.createElement('button');
        nextSlideBtn.type = 'button';
        nextSlideBtn.className = 'lb-carousel-arrow';
        nextSlideBtn.setAttribute('aria-label', 'Diapositive suivante');
        nextSlideBtn.innerHTML = `<svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"></polyline></svg>`;

        nextSlideBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          updateSlide(activeSlideIdx + 1);
        });

        // Click on left/right half of image to advance slide
        mainImg.addEventListener('click', (e) => {
          const rect = mainImg.getBoundingClientRect();
          if (e.clientX - rect.left > rect.width / 2) {
            updateSlide(activeSlideIdx + 1);
          } else {
            updateSlide(activeSlideIdx - 1);
          }
        });

        controls.appendChild(prevSlideBtn);
        controls.appendChild(dotsContainer);
        controls.appendChild(nextSlideBtn);
        controls.appendChild(subCounter);
        carouselWrap.appendChild(controls);

        lbMediaEl.appendChild(carouselWrap);
      } else if (item.type === 'youtube') {
        const wrap = document.createElement('div');
        wrap.className = 'lb-youtube-card';
        const ytUrl = item.link || (item.youtubeId ? `https://youtu.be/${item.youtubeId}` : 'https://www.youtube.com');
        wrap.setAttribute('role', 'region');
        wrap.setAttribute('aria-label', `Vidéo ${item.title || 'YouTube'}`);

        const thumb = document.createElement('img');
        thumb.src = item.poster || item.src;
        thumb.alt = item.title || 'Miniature YouTube';
        thumb.className = 'lb-yt-thumb';

        const overlay = document.createElement('div');
        overlay.className = 'lb-yt-overlay';

        const playBtn = document.createElement('button');
        playBtn.type = 'button';
        playBtn.className = 'lb-yt-play-btn';
        playBtn.setAttribute('aria-label', 'Lire la vidéo');
        playBtn.innerHTML = `
          <svg viewBox="0 0 68 48" class="lb-yt-play-svg">
            <path class="lb-yt-bg" d="M66.52,7.74c-0.78-2.93-2.49-5.41-5.42-6.19C55.79,.13,34,0,34,0S12.21,.13,6.9,1.55 C3.97,2.33,2.27,4.81,1.48,7.74C0.06,13.05,0,24,0,24s0.06,10.95,1.48,16.26c0.78,2.93,2.49,5.41,5.42,6.19 C12.21,47.87,34,48,34,48s21.79-0.13,27.1-1.55c2.93-0.78,4.64-3.26,5.42-6.19C67.94,34.95,68,24,68,24S67.94,13.05,66.52,7.74z"></path>
            <path d="M 45,24 27,14 27,34" fill="#ffffff"></path>
          </svg>
        `;

        const metaBar = document.createElement('div');
        metaBar.className = 'lb-yt-meta';

        const titleSpan = document.createElement('span');
        titleSpan.className = 'lb-yt-title';
        titleSpan.textContent = item.title || 'Vidéo YouTube';

        const hintLink = document.createElement('a');
        hintLink.className = 'lb-yt-hint';
        hintLink.href = ytUrl;
        hintLink.target = '_blank';
        hintLink.rel = 'noopener noreferrer';
        hintLink.textContent = 'Regarder sur YouTube ↗';
        hintLink.style.pointerEvents = 'auto';
        hintLink.addEventListener('click', (e) => {
          e.stopPropagation();
        });

        metaBar.appendChild(titleSpan);
        metaBar.appendChild(hintLink);

        const launchPlayer = () => {
          if (!item.youtubeId) {
            window.open(ytUrl, '_blank', 'noopener,noreferrer');
            return;
          }
          wrap.innerHTML = `
            <iframe 
              src="https://www.youtube-nocookie.com/embed/${item.youtubeId}?autoplay=1&rel=0&modestbranding=1" 
              title="${item.title || 'Vidéo YouTube'}" 
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
              allowfullscreen 
              style="position:absolute;inset:0;width:100%;height:100%;border:none;border-radius:14px;">
            </iframe>
          `;
          wrap.style.cursor = 'default';
        };

        wrap.addEventListener('click', (e) => {
          if (!e.target.closest('.lb-yt-hint') && !wrap.querySelector('iframe')) {
            launchPlayer();
          }
        });

        overlay.appendChild(playBtn);
        wrap.appendChild(thumb);
        wrap.appendChild(overlay);
        wrap.appendChild(metaBar);
        lbMediaEl.appendChild(wrap);
      } else if (item.type === 'pdf') {
        const wrap = document.createElement('div');
        wrap.className = 'lb-pdf-container';
        wrap.style.cssText = 'position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;max-width:90vw;max-height:85vh;';

        const img = document.createElement('img');
        img.src = item.src;
        img.alt = item.title || 'Document PDF';
        img.style.cssText = 'max-height:68vh;max-width:90vw;border-radius:14px;box-shadow:0 16px 40px rgba(0,0,0,0.35);object-fit:contain;cursor:pointer;';
        img.addEventListener('click', () => {
          window.open(item.link || item.src, '_blank', 'noopener,noreferrer');
        });

        const openBtn = document.createElement('a');
        openBtn.href = item.link || item.src;
        openBtn.target = '_blank';
        openBtn.rel = 'noopener noreferrer';
        openBtn.className = 'cta-pill';
        openBtn.style.cssText = 'display:inline-flex;align-items:center;gap:10px;padding:12px 24px;font-size:13px;font-weight:600;letter-spacing:-0.01em;text-decoration:none;border-radius:999px;background:#e11d48;color:#ffffff;box-shadow:0 6px 20px rgba(225,29,72,0.4);transition:transform 0.2s, background 0.2s;';
        openBtn.innerHTML = `<span>Ouvrir le Book PDF</span> <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`;

        wrap.appendChild(img);
        wrap.appendChild(openBtn);
        lbMediaEl.appendChild(wrap);
      } else if (item.type === 'link' || item.type === 'website') {
        const wrap = document.createElement('div');
        wrap.className = 'lb-link-container';
        wrap.style.cssText = 'position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;max-width:90vw;max-height:85vh;';

        const img = document.createElement('img');
        img.src = item.src;
        img.alt = item.title || 'Site Web';
        img.style.cssText = 'max-height:68vh;max-width:90vw;border-radius:14px;box-shadow:0 16px 40px rgba(0,0,0,0.35);object-fit:contain;cursor:pointer;';
        img.addEventListener('click', () => {
          window.open(item.link || item.src, '_blank', 'noopener,noreferrer');
        });

        const openBtn = document.createElement('a');
        openBtn.href = item.link || item.src;
        openBtn.target = '_blank';
        openBtn.rel = 'noopener noreferrer';
        openBtn.className = 'cta-pill';
        openBtn.style.cssText = 'display:inline-flex;align-items:center;gap:10px;padding:12px 24px;font-size:13px;font-weight:600;letter-spacing:-0.01em;text-decoration:none;border-radius:999px;background:#111111;color:#ffffff;box-shadow:0 6px 20px rgba(0,0,0,0.3);transition:transform 0.2s, background 0.2s;';
        const displayHost = (item.link || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
        openBtn.innerHTML = `<span>Visiter ${displayHost || 'le site web'}</span> <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`;

        wrap.appendChild(img);
        wrap.appendChild(openBtn);
        lbMediaEl.appendChild(wrap);
      } else if (item.type === 'video') {
        const video = document.createElement('video');
        video.autoplay = true;
        video.controls = true;
        video.loop = true;
        video.playsInline = true;

        const source = document.createElement('source');
        source.src = item.src;
        const ext = item.src.split('.').pop().toLowerCase();
        source.type = ext === 'webm' ? 'video/webm' : 'video/mp4';

        source.onerror = function () {
          if (item.fallbackSrc && source.src !== item.fallbackSrc) {
            source.src = item.fallbackSrc;
            video.load();
          }
        };

        video.appendChild(source);
        lbMediaEl.appendChild(video);
      } else {
        const img = document.createElement('img');
        img.src = item.src;
        img.alt = item.title || 'Projet';
        img.draggable = false;

        img.onerror = function () {
          if (item.fallbackSrc && img.src !== item.fallbackSrc) {
            img.src = item.fallbackSrc;
          }
        };

        lbMediaEl.appendChild(img);
      }

      if (lbCounterEl) {
        const currentStr = String(lightboxIndex + 1).padStart(2, '0');
        const totalStr = String(galleryItems.length).padStart(2, '0');
        lbCounterEl.textContent = `${currentStr} / ${totalStr}`;
      }

      const lbExtraEl = document.getElementById('lb-extra');
      if (lbExtraEl) {
        lbExtraEl.innerHTML = '';
        const isNamedProject = item.title && !/^\d+$/.test(item.title.trim());
        if (isNamedProject) {
          const sep = document.createElement('span');
          sep.className = 'lb-info-sep';
          sep.textContent = '·';
          sep.setAttribute('aria-hidden', 'true');

          const title = document.createElement('span');
          title.className = 'lb-info-title';
          title.textContent = item.title;

          lbExtraEl.appendChild(sep);
          lbExtraEl.appendChild(title);
        }

        if (item.link) {
          const link = document.createElement('a');
          link.href = item.link;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.className = 'lb-source-link';
          link.setAttribute('aria-label', 'Voir la publication originale');
          link.title = 'Voir la publication originale';
          link.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`;
          lbExtraEl.appendChild(link);
        }
      }

      lbMediaEl.classList.remove('lb-out');
      lbMediaEl.classList.add('lb-in');
    }, 120);
  }

  // Lightbox Gesture Controls (Touch & Drag)
  function initLightboxGestures() {
    if (!lightboxEl) return;

    // Mobile Touch Gestures
    lightboxEl.addEventListener(
      'touchstart',
      (e) => {
        if (!isLightboxOpen) return;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      },
      { passive: true }
    );

    lightboxEl.addEventListener(
      'touchend',
      (e) => {
        if (!isLightboxOpen) return;
        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;
        const diffX = touchStartX - touchEndX;
        const diffY = touchStartY - touchEndY;

        // Horizontal swipe for navigation
        if (Math.abs(diffX) > 45 && Math.abs(diffX) > Math.abs(diffY)) {
          lightboxNav(diffX > 0 ? 1 : -1);
        }
        // Vertical swipe down to close
        else if (diffY < -70 && Math.abs(diffY) > Math.abs(diffX)) {
          closeLightbox();
        }
      },
      { passive: true }
    );

    // Desktop Mouse Drag
    lightboxEl.addEventListener('mousedown', (e) => {
      if (!isLightboxOpen) return;
      if (e.target.closest('#lb-close, #lb-prev, #lb-next, video, .lb-youtube-card, .lb-carousel-container, a, button')) return;
      isMouseDown = true;
      dragStartX = e.clientX;
      dragDeltaX = 0;
      lightboxEl.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
      if (!isMouseDown) return;
      dragDeltaX = e.clientX - dragStartX;
    });

    window.addEventListener('mouseup', () => {
      if (!isMouseDown) return;
      isMouseDown = false;
      lightboxEl.style.cursor = '';
      if (Math.abs(dragDeltaX) > 60) {
        lightboxNav(dragDeltaX < 0 ? 1 : -1);
      }
    });

    // Close on backdrop click
    lightboxEl.addEventListener('click', (e) => {
      if (e.target === lightboxEl) {
        closeLightbox();
      }
    });
  }

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    if (!isLightboxOpen) return;
    if (e.key === 'ArrowRight') lightboxNav(1);
    else if (e.key === 'ArrowLeft') lightboxNav(-1);
    else if (e.key === 'Escape') closeLightbox();
  });

  // --- Page / Navigation Switching ---
  function showPage(pageName) {
    if (pageName === 'projets') pageName = 'projects';
    const pages = document.querySelectorAll('.page-view');
    const targetPage = document.getElementById(`page-${pageName}`);
    if (!targetPage) return;

    pages.forEach((p) => p.classList.remove('active'));
    targetPage.classList.add('active');
    document.body.classList.toggle('page-is-intro', pageName === 'intro');

    // Update desktop nav
    document.querySelectorAll('.nav-link, .nav-pill, .nav-vlink').forEach((btn) => {
      const page = btn.getAttribute('data-page');
      if (page === pageName || (page === 'projects' && pageName === 'projets')) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Update mobile nav
    document.querySelectorAll('.m-nav-link, .m-nav-pill, .m-nav-vlink').forEach((btn) => {
      const page = btn.getAttribute('data-page');
      if (page === pageName || (page === 'projects' && pageName === 'projets')) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    closeMobileMenu();

    if (location.hash.slice(1) !== pageName) {
      location.hash = pageName;
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (pageName === 'projects' || pageName === 'projets') {
      requestAnimationFrame(() => {
        runMasonry();
        observeItems();
      });
    } else {
      requestAnimationFrame(() => {
        observeItems();
      });
    }
  }

  // --- Mobile Menu Toggle ---
  function toggleMobileMenu() {
    if (!burgerBtn || !mobileMenu) return;
    const isOpen = burgerBtn.classList.toggle('open');
    mobileMenu.classList.toggle('open', isOpen);
    burgerBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  }

  function closeMobileMenu() {
    if (!burgerBtn || !mobileMenu) return;
    burgerBtn.classList.remove('open');
    mobileMenu.classList.remove('open');
    burgerBtn.setAttribute('aria-expanded', 'false');
  }

  // --- Variable Font Hover Animation (matches 21st.dev m-variable-font-hover-1) ---
  function initVariableFontHover() {
    const links = document.querySelectorAll('.nav-vlink, .m-nav-vlink');
    links.forEach((link) => {
      const existingSpans = link.querySelectorAll('.v-letter');
      if (existingSpans.length === 0) {
        const text = link.textContent.trim();
        if (!text) return;
        link.innerHTML = '';
        const chars = Array.from(text);
        const count = chars.length;
        const center = (count - 1) / 2;
        const stagger = 0.03;
        chars.forEach((char, i) => {
          const span = document.createElement('span');
          span.className = 'v-letter';
          span.textContent = char;
          const dist = Math.abs(i - center);
          span.style.setProperty('--delay', `${(dist * stagger).toFixed(3)}s`);
          link.appendChild(span);
        });
      }
    });
  }

  // --- Floating Scroll-To-Top Button ---
  function initScrollTop() {
    if (!scrollTopBtn) return;

    window.addEventListener(
      'scroll',
      () => {
        scrollTopBtn.classList.toggle('visible', window.scrollY > 300);

        // Revert all hover-playing preview videos when scrolling
        document.querySelectorAll('.item.is-hovered').forEach((c) => {
          c.classList.remove('is-hovered');
          const v = c.querySelector('video');
          if (v) {
            v.pause();
            try {
              v.currentTime = 0;
            } catch (e) {}
          }
        });
      },
      { passive: true }
    );

    scrollTopBtn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // --- Media Context Protection (matches reference behavior) ---
  function guardMedia() {
    document.addEventListener('contextmenu', (e) => {
      if (e.target.closest('#projects-grid, #lightbox, .item')) {
        e.preventDefault();
      }
    });
    document.addEventListener('dragstart', (e) => {
      if (e.target.matches('img, video')) {
        e.preventDefault();
      }
    });
  }

  // --- Toast Notification ---
  function showToast(message) {
    let toast = document.querySelector('.toast-notice');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'toast-notice';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.classList.remove('show');
    }, 2400);
  }

  // --- Copy Email to Clipboard ---
  const CONTACT_EMAIL = 'rwcnx10n@gmail.com';

  function copyEmail(e, el) {
    if (e) e.preventDefault();
    const target = el || (e && e.currentTarget);
    if (!target) return;

    const email = target.getAttribute('data-email') || CONTACT_EMAIL;

    const onCopied = () => {
      target.classList.add('is-copied');
      clearTimeout(target._copyTimer);
      target._copyTimer = setTimeout(() => {
        target.classList.remove('is-copied');
      }, 1800);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(email).then(onCopied).catch(() => {
        window.location.href = 'mailto:' + email;
      });
    } else {
      window.location.href = 'mailto:' + email;
    }
  }

  // --- Trusted Marquee Infinite Motion (Fail-proof rAF driver) ---
  function initTrustedMarquee() {
    const marquee = document.querySelector('.trusted-marquee');
    const track = document.querySelector('.trusted-track');
    if (!marquee || !track) return;

    let isPaused = false;
    let x = 0;
    let lastTime = null;
    const speed = 36; // pixels par seconde

    marquee.addEventListener('mouseenter', () => { isPaused = true; });
    marquee.addEventListener('mouseleave', () => { isPaused = false; });
    marquee.addEventListener('focusin', () => { isPaused = true; });
    marquee.addEventListener('focusout', () => { isPaused = false; });

    function tick(now) {
      if (lastTime === null) {
        lastTime = now;
      }
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;

      // Uniquement si la section intro est active
      const introPage = document.getElementById('page-intro');
      const isIntroActive = !introPage || introPage.classList.contains('active');

      if (isIntroActive) {
        const halfWidth = track.scrollWidth / 2;
        if (!isPaused && halfWidth > 50) {
          x -= speed * dt;
          while (x <= -halfWidth) {
            x += halfWidth;
          }
          track.style.transform = `translate3d(${x.toFixed(2)}px, 0, 0)`;
        }
      }

      requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }

  // --- Initialization ---
  document.addEventListener('DOMContentLoaded', () => {
    // 1. Setup Controls
    if (burgerBtn) {
      burgerBtn.addEventListener('click', toggleMobileMenu);
    }

    // Attach click listeners to all nav buttons
    document.querySelectorAll('[data-page]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const page = btn.getAttribute('data-page');
        showPage(page);
      });
    });

    // Handle external shop link clicks
    document.querySelectorAll('#nav-btn-shop, #m-nav-btn-shop, #cta-shop').forEach((link) => {
      link.addEventListener('click', (e) => {
        closeMobileMenu();
        const href = link.getAttribute('href');
        // If placeholder URL or hash, show a friendly toast notice
        if (!href || href === '#' || href.includes('shop.robinwattier.com')) {
          e.preventDefault();
          showToast('Online shop coming soon!');
        }
      });
    });

    // Lightbox buttons
    const lbClose = document.getElementById('lb-close');
    const lbPrev = document.getElementById('lb-prev');
    const lbNext = document.getElementById('lb-next');

    if (lbClose) lbClose.addEventListener('click', closeLightbox);
    if (lbPrev) lbPrev.addEventListener('click', () => lightboxNav(-1));
    if (lbNext) lbNext.addEventListener('click', () => lightboxNav(1));

    initLightboxGestures();
    initScrollTop();
    initVariableFontHover();
    initTrustedMarquee();
    guardMedia();

    // Footer year update
    const yearEl = document.getElementById('footer-year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    // 2. Load Gallery Assets
    let items = Array.isArray(window.PORTFOLIO_ITEMS) ? window.PORTFOLIO_ITEMS : [];
    buildGrid(items);

    // 3. Handle Hash Routing (defaults to #intro)
    let initialHash = location.hash.slice(1);
    if (initialHash === 'projets') initialHash = 'projects';
    if (initialHash && document.getElementById(`page-${initialHash}`)) {
      showPage(initialHash);
    } else {
      showPage('intro');
    }

    window.addEventListener('hashchange', () => {
      let page = location.hash.slice(1);
      if (page === 'projets') page = 'projects';
      if (!page) page = 'intro';
      if (page && document.getElementById(`page-${page}`)) {
        showPage(page);
      }
    });

    // Setup copy email channel click listeners
    document.querySelectorAll('[data-copy="email"]').forEach((channel) => {
      channel.addEventListener('click', (e) => copyEmail(e, channel));
    });
  });

  // Global functions for inline access if needed
  window.copyEmail = copyEmail;
  window.portfolioApp = {
    showPage,
    openLightbox,
    closeLightbox,
    lightboxNav,
    showToast,
    copyEmail,
  };
})();
