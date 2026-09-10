(() => {
  'use strict';

  const projects = {
    'tank-battle': {
      name: '《钢铁校园：黄俊人保卫战》',
      type: 'CANVAS GAME · 个人项目｜AI辅助开发',
      summary: '一款以校园为主题的无尽生存坦克游戏，围绕反弹弹道、无差别伤害和战场成长构建核心体验。',
      problem: '在无需安装、无需第三方框架的条件下，完成具备清晰反馈、持续成长和原创身份标识的参赛游戏。',
      role: '本人负责玩法设定、功能取舍、地图与界面设计、测试验收及迭代；使用 AI 辅助实现 Canvas 渲染、敌方 AI、碰撞系统、存档与性能优化。',
      highlights: ['支持八向移动、鼠标炮塔瞄准与移动端控制', '实现钢板及边界反弹，并统一处理敌我与自伤规则', '包含激光、巡航导弹、爆裂弹、空对地导弹和范围嘲讽', '使用“黄、俊、人”字形地图、无尽波次、升级三选一与检查点存档'],
      tech: ['HTML5 Canvas', 'JavaScript', '游戏 AI', '碰撞检测', 'Web Audio', 'LocalStorage'],
      image: 'screenshots/tank-battle.webp',
      imageAlt: '《钢铁校园：黄俊人保卫战》实际游戏菜单截图',
      actions: [{ label: '在线体验', href: 'game/index.html', external: false }]
    },
    'resume-site': {
      name: '个人简历网站',
      type: 'RESPONSIVE WEB · 个人项目｜AI辅助开发',
      summary: '一个零框架、可离线浏览的响应式个人作品集，兼顾内容可信度、交互体验和打印交付。',
      problem: '让浏览者快速理解个人定位、代表作品与技术能力，同时保持低加载成本和易维护性。',
      role: '本人负责信息整理、栏目规划、视觉方向、交互需求、素材选择和测试验收；使用 AI 辅助完成响应式布局、项目数据结构、无障碍交互与性能优化。',
      highlights: ['项目卡片与弹窗共享集中数据，避免内容漂移', '支持键盘操作、焦点管理和减少动画偏好', '使用 WebP、图片尺寸声明和懒加载优化体验', '提供 A4 打印样式，可直接导出 PDF 简历'],
      tech: ['HTML5', 'CSS3', 'JavaScript', 'Responsive Design', 'Accessibility', 'Print CSS'],
      image: 'screenshots/resume-site.webp?v=20260831',
      imageAlt: '黄俊人个人简历网站截图',
      actions: [{ label: 'GitHub', href: 'https://github.com/HJR258', external: true }]
    },
    'ai-chat': {
      name: 'AI 聊天助手',
      type: 'LLM APPLICATION · 独立实践',
      summary: '面向桌面使用场景的对话应用实践，聚焦模型接入、多轮上下文与可配置交互体验。',
      problem: '将大模型 API 转化为具备清晰界面、连续会话和本地设置管理的可用应用。',
      role: '负责 Python 应用结构、对话流程、状态管理、主题设置和历史记录设计。',
      highlights: ['实现多轮对话和会话状态维护', '集中管理模型参数与本地设置', '设计适合长时间阅读的桌面级界面', '保留清晰的模块边界，便于继续扩展'],
      tech: ['Python', 'Streamlit', 'LLM API', 'Prompt Engineering', '状态管理'],
      image: 'screenshots/ai-chat.webp',
      imageAlt: 'AI 聊天助手应用截图',
      actions: []
    }
  };

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const body = document.body;
  const header = document.getElementById('siteHeader');
  const scrollProgress = document.getElementById('scrollProgress');
  const hero = document.querySelector('.hero');
  const heroVisual = document.getElementById('heroVisual');
  const imageTrail = document.getElementById('imageTrail');
  const fluidCanvas = document.getElementById('fluidCanvas');
  const fluidToggle = document.getElementById('fluidFxToggle');

  const boot = document.getElementById('boot');
  const bootPercent = document.getElementById('bootPercent');
  const bootBar = document.getElementById('bootBar');
  let bootValue = 0;
  const finishBoot = () => {
    bootValue = 100;
    bootPercent.textContent = '100';
    bootBar.style.width = '100%';
    window.setTimeout(() => boot.classList.add('done'), prefersReducedMotion ? 0 : 260);
  };
  if (prefersReducedMotion) {
    finishBoot();
  } else {
    const bootTimer = window.setInterval(() => {
      bootValue = Math.min(96, bootValue + Math.ceil(Math.random() * 9));
      bootPercent.textContent = String(bootValue).padStart(3, '0');
      bootBar.style.width = `${bootValue}%`;
      if (bootValue >= 96) window.clearInterval(bootTimer);
    }, 48);
    window.addEventListener('load', () => {
      window.clearInterval(bootTimer);
      finishBoot();
    }, { once: true });
    window.setTimeout(finishBoot, 1800);
  }

  const updateScroll = () => {
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const ratio = Math.min(1, Math.max(0, window.scrollY / max));
    scrollProgress.style.height = `${ratio * 100}%`;
    header.classList.toggle('scrolled', window.scrollY > 30);
  };
  updateScroll();
  let scrollFrame = 0;
  const scheduleScrollUpdate = () => {
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0;
      updateScroll();
    });
  };
  window.addEventListener('scroll', scheduleScrollUpdate, { passive: true });
  window.addEventListener('resize', scheduleScrollUpdate, { passive: true });

  const menuButton = document.getElementById('menuButton');
  const menuPanel = document.getElementById('menuPanel');
  const setMenu = (open) => {
    menuButton.setAttribute('aria-expanded', String(open));
    menuPanel.hidden = !open;
    body.classList.toggle('menu-open', open);
    if (open) menuPanel.querySelector('a')?.focus();
    else menuButton.focus({ preventScroll: true });
  };
  menuButton.addEventListener('click', () => setMenu(menuPanel.hidden));
  menuPanel.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => setMenu(false)));

  const fluidStorageKey = 'hjr-fluid-fx-v1';
  let fluidController = null;
  let fluidLoadPromise = null;
  let fluidModeLabel = 'AUTO';
  let storedFluidPreference = null;
  try { storedFluidPreference = localStorage.getItem(fluidStorageKey); } catch { storedFluidPreference = null; }
  let fluidEnabled = storedFluidPreference !== 'off' && !prefersReducedMotion;

  const updateFluidToggle = (mode = fluidEnabled ? 'AUTO' : 'OFF') => {
    if (!fluidToggle) return;
    fluidToggle.setAttribute('aria-pressed', String(fluidEnabled));
    fluidToggle.textContent = `FLUID FX / ${mode}`;
  };

  const loadFluidEffect = () => {
    if (!fluidEnabled || !fluidCanvas) return Promise.resolve(null);
    if (fluidController) {
      fluidController.setEnabled(true);
      updateFluidToggle(fluidModeLabel);
      return Promise.resolve(fluidController);
    }
    if (fluidLoadPromise) return fluidLoadPromise;
    performance.mark?.('fluid-load-start');
    fluidLoadPromise = new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'fluid.js';
      script.async = true;
      script.addEventListener('load', () => {
        try {
          fluidController = window.HJRFluid.createFluidEffect({
            canvas: document.getElementById('fluidCanvas'),
            onStatus: ({ renderer, profile, fps }) => {
              fluidModeLabel = renderer === 'LITE' ? 'LITE' : 'GPU';
              updateFluidToggle(fluidModeLabel);
              const activeCanvas = document.getElementById('fluidCanvas');
              if (activeCanvas) {
                activeCanvas.dataset.fluidProfile = profile;
                activeCanvas.dataset.fluidFps = String(fps);
              }
            }
          });
          fluidController.setEnabled(fluidEnabled);
          performance.mark?.('fluid-load-end');
          performance.measure?.('fluid-lazy-load', 'fluid-load-start', 'fluid-load-end');
          const activeCanvas = document.getElementById('fluidCanvas');
          const measure = performance.getEntriesByName?.('fluid-lazy-load').at?.(-1);
          if (activeCanvas && measure) activeCanvas.dataset.fluidLoadMs = String(Math.round(measure.duration));
          resolve(fluidController);
        } catch (error) {
          console.warn('Fluid effect could not start.', error);
          updateFluidToggle('UNAVAILABLE');
          resolve(null);
        }
      }, { once: true });
      script.addEventListener('error', () => {
        updateFluidToggle('UNAVAILABLE');
        resolve(null);
      }, { once: true });
      document.head.append(script);
    });
    return fluidLoadPromise;
  };

  const scheduleFluidLoad = () => {
    if (!fluidEnabled) return;
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => loadFluidEffect(), { timeout: finePointer ? 1100 : 1800 });
    } else {
      window.setTimeout(loadFluidEffect, finePointer ? 320 : 760);
    }
  };

  updateFluidToggle();
  if (document.readyState === 'complete') scheduleFluidLoad();
  else window.addEventListener('load', scheduleFluidLoad, { once: true });
  fluidToggle?.addEventListener('click', () => {
    fluidEnabled = !fluidEnabled;
    try { localStorage.setItem(fluidStorageKey, fluidEnabled ? 'on' : 'off'); } catch { /* Storage can be unavailable in private file mode. */ }
    updateFluidToggle(fluidEnabled ? 'LOADING' : 'OFF');
    if (fluidEnabled) loadFluidEffect();
    else fluidController?.setEnabled(false);
  });

  if (finePointer && !prefersReducedMotion) {
    const cursor = document.querySelector('.cursor');
    let cursorX = -100;
    let cursorY = -100;
    let targetX = -100;
    let targetY = -100;
    window.addEventListener('pointermove', (event) => {
      targetX = event.clientX;
      targetY = event.clientY;
      if (hero && event.clientY <= hero.getBoundingClientRect().bottom) {
        const x = event.clientX / window.innerWidth;
        const y = event.clientY / window.innerHeight;
        hero.style.setProperty('--mouse-x', `${x * 100}%`);
        hero.style.setProperty('--mouse-y', `${y * 100}%`);
        heroVisual.style.setProperty('--shift-x', `${(x - .5) * 16}px`);
        heroVisual.style.setProperty('--shift-y', `${(y - .5) * 12}px`);
      }
    }, { passive: true });
    const cursorFrame = () => {
      cursorX += (targetX - cursorX) * .22;
      cursorY += (targetY - cursorY) * .22;
      cursor.style.transform = `translate3d(${cursorX}px, ${cursorY}px, 0)`;
      requestAnimationFrame(cursorFrame);
    };
    cursorFrame();
    document.querySelectorAll('[data-cursor]').forEach((element) => {
      const labels = { view: 'VIEW', open: 'OPEN', link: 'GO' };
      element.addEventListener('pointerenter', () => {
        cursor.classList.add('active');
        cursor.dataset.label = labels[element.dataset.cursor] || 'OPEN';
      });
      element.addEventListener('pointerleave', () => {
        cursor.classList.remove('active');
        cursor.dataset.label = '';
      });
    });
    document.querySelectorAll('.magnetic').forEach((element) => {
      element.addEventListener('pointermove', (event) => {
        const rect = element.getBoundingClientRect();
        const x = event.clientX - rect.left - rect.width / 2;
        const y = event.clientY - rect.top - rect.height / 2;
        element.style.transform = `translate(${x * .08}px, ${y * .12}px)`;
      });
      element.addEventListener('pointerleave', () => { element.style.transform = ''; });
    });
  }

  if (finePointer && !prefersReducedMotion && imageTrail) {
    const trailSources = (imageTrail.dataset.trailImages || '').split('|').filter(Boolean);
    const trailPoolSize = 12;
    const trailPool = [];
    let poolIndex = 0;
    let sourceIndex = 0;
    let trailFrame = 0;
    let latestPoint = null;
    let lastPoint = null;
    let lastSpawnTime = 0;

    trailSources.forEach((source) => {
      const image = new Image();
      image.src = source;
    });

    for (let index = 0; index < trailPoolSize; index += 1) {
      const item = document.createElement('figure');
      const image = document.createElement('img');
      item.className = 'image-trail__item';
      item.dataset.index = `HJR / ${String(index + 1).padStart(2, '0')}`;
      image.alt = '';
      image.decoding = 'async';
      item.append(image);
      imageTrail.append(item);
      trailPool.push({ item, image, animation: null });
    }

    const spawnTrailItem = (point, time) => {
      if (!trailSources.length || body.classList.contains('menu-open') || body.classList.contains('modal-open')) return;
      if (lastPoint) {
        const distance = Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y);
        if (distance < 42 || time - lastSpawnTime < 72) return;
      }

      const slot = trailPool[poolIndex];
      const source = trailSources[sourceIndex];
      const rotation = (Math.random() - .5) * 20;
      const driftX = (point.x - (lastPoint?.x ?? point.x)) * .42;
      const driftY = (point.y - (lastPoint?.y ?? point.y)) * .42;
      const offset = (value) => `calc(-50% ${value < 0 ? '-' : '+'} ${Math.abs(value)}px)`;
      slot.animation?.cancel();
      slot.image.src = source;
      slot.item.style.left = `${point.x}px`;
      slot.item.style.top = `${point.y}px`;
      slot.item.style.zIndex = String(10 + poolIndex);
      slot.animation = slot.item.animate([
        { opacity: 0, transform: `translate3d(-50%,-50%,0) rotate(${rotation - 3}deg) scale(.45)` },
        { opacity: .96, transform: `translate3d(-50%,-50%,0) rotate(${rotation}deg) scale(1.08)`, offset: .16 },
        { opacity: .9, transform: `translate3d(${offset(driftX)},${offset(driftY)},0) rotate(${rotation}deg) scale(1)`, offset: .58 },
        { opacity: 0, transform: `translate3d(${offset(driftX * 1.35)},${offset(driftY * 1.35 - 12)},0) rotate(${rotation + 2}deg) scale(.72)` }
      ], { duration: 760, easing: 'cubic-bezier(.2,.78,.2,1)', fill: 'forwards' });

      poolIndex = (poolIndex + 1) % trailPoolSize;
      sourceIndex = (sourceIndex + 1) % trailSources.length;
      lastPoint = point;
      lastSpawnTime = time;
    };

    const renderTrail = (time) => {
      trailFrame = 0;
      if (latestPoint) spawnTrailItem(latestPoint, time);
    };

    window.addEventListener('pointermove', (event) => {
      const trailZone = event.target instanceof Element ? event.target.closest('[data-trail-zone]') : null;
      if (!trailZone) {
        latestPoint = null;
        lastPoint = null;
        return;
      }
      latestPoint = { x: event.clientX, y: event.clientY };
      if (!trailFrame) trailFrame = requestAnimationFrame(renderTrail);
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', () => {
      latestPoint = null;
      lastPoint = null;
    });
    window.addEventListener('blur', () => {
      latestPoint = null;
      lastPoint = null;
    });
  }

  const revealCards = document.querySelectorAll('.reveal-card');
  if ('IntersectionObserver' in window && !prefersReducedMotion) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: .12, rootMargin: '0px 0px -8% 0px' });
    revealCards.forEach((card) => observer.observe(card));
  } else {
    revealCards.forEach((card) => card.classList.add('in-view'));
  }

  const hoverPreview = document.getElementById('hoverMediaPreview');
  const hoverPreviewImage = document.getElementById('hoverMediaPreviewImage');
  const hoverPreviewTitle = document.getElementById('hoverMediaPreviewTitle');
  const hoverPreviewMeta = document.getElementById('hoverMediaPreviewMeta');
  const previewTriggers = [...document.querySelectorAll('[data-preview-src]')];

  previewTriggers.forEach((trigger) => {
    const preload = new Image();
    preload.src = trigger.dataset.previewSrc;
  });

  let activePreviewTrigger = null;
  const hideHoverPreview = () => {
    hoverPreview?.classList.remove('visible');
    activePreviewTrigger = null;
  };

  if (finePointer && hoverPreview && hoverPreviewImage) {
    let pointerX = -1;
    let pointerY = -1;
    let previewFrame = 0;
    let keyboardPreviewTrigger = null;
    let previewHeight = hoverPreview.offsetHeight || 300;

    const positionHoverPreview = (clientX, clientY) => {
      const width = Math.min(380, window.innerWidth - 32);
      const height = previewHeight;
      const margin = 18;
      const gap = 24;
      let x = clientX - width / 2;
      let y = clientY - height - gap;
      x = Math.max(margin, Math.min(window.innerWidth - width - margin, x));
      if (y < margin) y = Math.min(window.innerHeight - height - margin, clientY + gap);
      hoverPreview.style.setProperty('--preview-x', `${Math.round(x)}px`);
      hoverPreview.style.setProperty('--preview-y', `${Math.round(y)}px`);
    };

    const showHoverPreview = (trigger, clientX, clientY) => {
      if (activePreviewTrigger !== trigger) {
        activePreviewTrigger = trigger;
        hoverPreviewImage.src = trigger.dataset.previewSrc;
        hoverPreviewTitle.textContent = trigger.dataset.previewTitle || '';
        hoverPreviewMeta.textContent = trigger.dataset.previewMeta || '';
      }
      positionHoverPreview(clientX, clientY);
      hoverPreview.classList.add('visible');
    };

    const triggerAtPointer = () => {
      if (pointerX < 0 || pointerY < 0 || pointerX > window.innerWidth || pointerY > window.innerHeight) return null;
      return document.elementFromPoint(pointerX, pointerY)?.closest('[data-preview-src]') || null;
    };

    const renderHoverPreview = () => {
      previewFrame = 0;
      if (activeModal) {
        hideHoverPreview();
        return;
      }
      const trigger = keyboardPreviewTrigger || triggerAtPointer();
      if (!trigger) {
        hideHoverPreview();
        return;
      }
      if (keyboardPreviewTrigger) {
        const rect = trigger.getBoundingClientRect();
        showHoverPreview(trigger, Math.min(window.innerWidth - 30, rect.right - 20), rect.top + rect.height / 2);
      } else {
        showHoverPreview(trigger, pointerX, pointerY);
      }
    };

    const scheduleHoverPreview = () => {
      if (previewFrame) return;
      previewFrame = requestAnimationFrame(renderHoverPreview);
    };

    window.addEventListener('pointermove', (event) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      keyboardPreviewTrigger = null;
      scheduleHoverPreview();
    }, { passive: true });
    window.addEventListener('wheel', (event) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      keyboardPreviewTrigger = null;
      scheduleHoverPreview();
    }, { passive: true });
    window.addEventListener('scroll', scheduleHoverPreview, { passive: true });
    window.addEventListener('resize', scheduleHoverPreview, { passive: true });
    window.addEventListener('blur', hideHoverPreview);
    hoverPreviewImage.addEventListener('load', () => {
      previewHeight = hoverPreview.offsetHeight || 300;
      scheduleHoverPreview();
    });

    previewTriggers.forEach((trigger) => {
      trigger.addEventListener('pointerenter', (event) => {
        pointerX = event.clientX;
        pointerY = event.clientY;
        scheduleHoverPreview();
      });
      trigger.addEventListener('pointerleave', scheduleHoverPreview);
      trigger.addEventListener('focus', () => {
        keyboardPreviewTrigger = trigger;
        scheduleHoverPreview();
      });
      trigger.addEventListener('blur', () => {
        keyboardPreviewTrigger = null;
        scheduleHoverPreview();
      });
    });
  }

  const pageRoots = [document.querySelector('main'), document.querySelector('.site-header'), document.querySelector('.footer')].filter(Boolean);
  let activeModal = null;
  let modalTrigger = null;
  const focusableSelector = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

  const openModal = (shell, trigger) => {
    hideHoverPreview();
    modalTrigger = trigger || document.activeElement;
    activeModal = shell;
    shell.hidden = false;
    body.classList.add('modal-open');
    pageRoots.forEach((root) => { root.inert = true; });
    shell.querySelector('.modal-close')?.focus();
  };

  const closeModal = (shell = activeModal) => {
    if (!shell) return;
    shell.hidden = true;
    body.classList.remove('modal-open');
    pageRoots.forEach((root) => { root.inert = false; });
    activeModal = null;
    modalTrigger?.focus({ preventScroll: true });
    modalTrigger = null;
  };

  const trapFocus = (event) => {
    if (!activeModal || event.key !== 'Tab') return;
    const focusable = [...activeModal.querySelectorAll(focusableSelector)].filter((element) => !element.hidden && element.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const projectModal = document.getElementById('projectModal');
  const projectMedia = document.getElementById('projectModalMedia');
  const projectType = document.getElementById('projectModalType');
  const projectTitle = document.getElementById('projectModalTitle');
  const projectSummary = document.getElementById('projectModalSummary');
  const projectProblem = document.getElementById('projectModalProblem');
  const projectRole = document.getElementById('projectModalRole');
  const projectHighlights = document.getElementById('projectModalHighlights');
  const projectTech = document.getElementById('projectModalTech');
  const projectActions = document.getElementById('projectModalActions');

  const showProject = (id, trigger) => {
    const project = projects[id];
    if (!project) return;
    projectMedia.replaceChildren();
    const image = new Image();
    image.src = project.image;
    image.alt = project.imageAlt;
    image.decoding = 'async';
    projectMedia.append(image);
    projectType.textContent = project.type;
    projectTitle.textContent = project.name;
    projectSummary.textContent = project.summary;
    projectProblem.textContent = project.problem;
    projectRole.textContent = project.role;
    projectHighlights.replaceChildren(...project.highlights.map((item) => {
      const li = document.createElement('li');
      li.textContent = item;
      return li;
    }));
    projectTech.replaceChildren(...project.tech.map((item) => {
      const span = document.createElement('span');
      span.textContent = item;
      return span;
    }));
    projectActions.replaceChildren(...project.actions.map((action) => {
      const link = document.createElement('a');
      link.href = action.href;
      link.textContent = `${action.label} ↗`;
      if (action.external) {
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      }
      return link;
    }));
    openModal(projectModal, trigger);
  };

  document.querySelectorAll('.project-index-trigger').forEach((button) => {
    const row = button.closest('[data-project]');
    button.addEventListener('click', () => showProject(row?.dataset.project, button));
  });

  const certificateModal = document.getElementById('certificateModal');
  const certificateImage = document.getElementById('certificateModalImage');
  const certificateTitle = document.getElementById('certificateModalTitle');
  document.querySelectorAll('.certificate-index-trigger').forEach((button) => {
    button.addEventListener('click', () => {
      certificateImage.src = button.dataset.certificate;
      certificateImage.alt = button.dataset.title;
      certificateTitle.textContent = button.dataset.title;
      openModal(certificateModal, button);
    });
  });

  document.querySelectorAll('[data-close]').forEach((element) => element.addEventListener('click', () => closeModal(element.closest('.modal-shell'))));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (activeModal) closeModal();
      else if (!menuPanel.hidden) setMenu(false);
    }
    trapFocus(event);
  });

  document.querySelectorAll('[data-print]').forEach((button) => button.addEventListener('click', () => window.print()));

  document.querySelectorAll('img').forEach((image) => {
    image.addEventListener('error', () => {
      image.hidden = true;
      const fallback = document.createElement('span');
      fallback.className = 'image-fallback';
      fallback.textContent = image.alt || '图片暂时无法加载';
      image.insertAdjacentElement('afterend', fallback);
    }, { once: true });
  });
})();
