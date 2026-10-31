/* Progressive enhancement: no hidden content and no dependency on Firebase. */
export function initEditorialMotion(){
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let dispose = () => {};
  let entered = false;
  function configure(){
    dispose();
    dispose = () => {};
    if(!reduced.matches){
      dispose = mountMotion(!entered);
      entered = true;
    }
  }
  reduced.addEventListener('change', configure);
  configure();
}

function mountMotion(playEntrance){
  const controller = new AbortController();
  const { signal } = controller;
  const animations = new Set();
  const seen = new WeakSet();
  const observed = new Set();
  const board = document.querySelector('.arena-board');
  const field = document.createElement('div');
  field.className = 'ambient-field';
  field.setAttribute('aria-hidden', 'true');
  for(let index = 0; index < 2; index++){
    const track = document.createElement('div');
    track.className = 'ambient-track';
    const runner = document.createElement('span');
    runner.className = 'field-runner';
    track.appendChild(runner);
    field.appendChild(track);
  }
  document.body.prepend(field);
  let scrollFrame = 0;
  let pointerFrame = 0;
  let pointer = null;

  function animate(element, frames, delay = 0){
    if(!element.animate) return;
    const animation = element.animate(frames, {
      duration: 760, delay, easing: 'cubic-bezier(.2,.75,.25,1)', fill: 'backwards'
    });
    animations.add(animation);
    animation.finished.then(() => animations.delete(animation), () => animations.delete(animation));
  }

  const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if(!entry.isIntersecting) return;
      observer.unobserve(entry.target);
      observed.delete(entry.target);
      const element = entry.target;
      const siblings = [...(element.parentElement?.children || [])];
      const delay = Math.min(siblings.indexOf(element), 3) * 75;
      animate(element, [{ opacity: 0, transform: 'translateY(22px)' }, { opacity: 1, transform: 'translateY(0)' }], delay);
    });
  }, { threshold: .06 }) : null;

  function observeElements(){
    observed.forEach(element => {
      if(!element.isConnected){
        observer?.unobserve(element);
        observed.delete(element);
      }
    });
    document.querySelectorAll('.section-head, main .card, main .empty-state, .league-strip > div, .community-band > div').forEach(element => {
      if(seen.has(element)) return;
      seen.add(element);
      if(observer){
        observed.add(element);
        observer.observe(element);
      }
    });
  }
  observeElements();
  if(playEntrance){
    document.querySelectorAll('.arena-copy > *').forEach((element, index) => {
      animate(element, [{ opacity: element.tagName === 'H1' ? 1 : 0, transform: 'translateY(20px)' }, { opacity: 1, transform: 'translateY(0)' }], index * 85);
    });
    if(board) animate(board, [{ opacity: 0 }, { opacity: 1 }], 180);
  }

  // Watch only content lists: asynchronous cards receive the same entrance.
  const mutations = new MutationObserver(observeElements);
  document.querySelectorAll('main .grid, [data-role="schedule-list"], [data-role="tournaments-list"], [data-role="leaderboard-table"]').forEach(element => {
    mutations.observe(element, { childList: true, subtree: true });
  });

  const progress = document.createElement('div');
  progress.className = 'page-progress';
  progress.setAttribute('aria-hidden', 'true');
  document.body.appendChild(progress);
  function updateScroll(){
    scrollFrame = 0;
    const distance = document.documentElement.scrollHeight - innerHeight;
    progress.style.setProperty('--read-progress', distance > 0 ? Math.max(0, Math.min(1, scrollY / distance)) : 0);
  }
  function requestScroll(){
    if(!scrollFrame) scrollFrame = requestAnimationFrame(updateScroll);
  }
  window.addEventListener('scroll', requestScroll, { passive: true, signal });
  window.addEventListener('resize', requestScroll, { passive: true, signal });
  const resizeObserver = 'ResizeObserver' in window ? new ResizeObserver(requestScroll) : null;
  resizeObserver?.observe(document.documentElement);
  updateScroll();

  function resetBoard(){
    pointer = null;
    if(pointerFrame) cancelAnimationFrame(pointerFrame);
    pointerFrame = 0;
    ['--tilt-x', '--tilt-y', '--pointer-x', '--pointer-y'].forEach(name => board?.style.removeProperty(name));
  }
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  finePointer.addEventListener('change', resetBoard, { signal });
  if(board){
    board.addEventListener('pointermove', event => {
      if(!finePointer.matches || event.pointerType === 'touch') return;
      const rect = board.getBoundingClientRect();
      pointer = { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
      if(pointerFrame) return;
      pointerFrame = requestAnimationFrame(() => {
        pointerFrame = 0;
        if(!pointer) return;
        board.style.setProperty('--tilt-x', `${(0.5 - pointer.y) * 5}deg`);
        board.style.setProperty('--tilt-y', `${(pointer.x - 0.5) * 6}deg`);
        board.style.setProperty('--pointer-x', `${pointer.x * 100}%`);
        board.style.setProperty('--pointer-y', `${pointer.y * 100}%`);
      });
    }, { passive: true, signal });
    board.addEventListener('pointerleave', resetBoard, { signal });
    board.addEventListener('pointercancel', resetBoard, { signal });
  }

  const boardObserver = board && 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    board.dataset.motionVisible = String(entries[0].isIntersecting);
  }) : null;
  if(boardObserver) boardObserver.observe(board);
  function syncVisibility(){
    document.body.classList.toggle('effects-paused', document.hidden);
    animations.forEach(animation => document.hidden ? animation.pause() : animation.play());
    if(document.hidden) resetBoard();
  }
  document.addEventListener('visibilitychange', syncVisibility, { signal });
  syncVisibility();

  return () => {
    controller.abort();
    observer?.disconnect();
    observed.clear();
    boardObserver?.disconnect();
    resizeObserver?.disconnect();
    mutations.disconnect();
    animations.forEach(animation => animation.cancel());
    animations.clear();
    cancelAnimationFrame(scrollFrame);
    resetBoard();
    progress.remove();
    field.remove();
    board?.removeAttribute('data-motion-visible');
    document.body.classList.remove('effects-paused');
  };
}
