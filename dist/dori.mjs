import {GOALS} from './core.mjs';

// The same native SVG is used in the application and the standalone preview.
// No images, emoji, model calls, document parsing, or remote requests are used.
export function doriSvg() {
  return `<svg class="dori-character" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 230" role="img" aria-label="청록색 크로스백을 메고 서류를 정리하는 펭귄 도리">
    <title>크로스백을 멘 펭귄 도리</title>
    <ellipse class="dori-shadow" cx="126" cy="208" rx="71" ry="9" fill="#e3ebf3"/>
    <g class="dori-paper-stack" fill="#fff" stroke="#9cafc3" stroke-width="2.2" stroke-linejoin="round">
      <path d="m185 190 38-3 8 7-38 3Z"/><path d="m185 184 38-3 8 7-38 3Z"/><path d="m185 178 38-3 8 7-38 3Z"/>
      <path d="m195 182 16-1" stroke="#32aca5"/>
    </g>
    <g class="dori-figure">
      <ellipse cx="91" cy="196" rx="19" ry="9" fill="#f5ad50" stroke="#d88b37" stroke-width="2.4" transform="rotate(-8 91 196)"/>
      <ellipse cx="132" cy="196" rx="19" ry="9" fill="#f5ad50" stroke="#d88b37" stroke-width="2.4" transform="rotate(8 132 196)"/>
      <path d="M64 115c-19 8-24 34-15 42 7 6 21-14 27-29" fill="#254459" stroke="#193548" stroke-width="3"/>
      <path d="M112 35c-35 0-56 33-58 80-3 50 18 82 58 82s62-32 58-82c-3-47-24-80-58-80Z" fill="#254459" stroke="#193548" stroke-width="3.5"/>
      <path d="M111 73c-9-17-35-11-39 13-4 16-1 28 6 36-8 9-13 24-11 38 3 23 20 34 45 34s42-11 45-34c2-14-3-29-11-38 7-8 10-20 6-36-4-24-31-30-41-13Z" fill="#fbfcfa"/>
      <g class="dori-strap" fill="none" stroke-linecap="round">
        <path d="M76 125 157 164" stroke="#16867f" stroke-width="12"/>
        <path d="M76 125 157 164" stroke="#5ed4c9" stroke-width="5"/>
        <path d="m91 132 8 4" stroke="#d6f9f2" stroke-width="2.4"/>
      </g>
      <g class="dori-face">
        <g class="dori-eyes" fill="#203a4b"><ellipse cx="93" cy="91" rx="4.3" ry="5.4"/><ellipse cx="129" cy="91" rx="4.3" ry="5.4"/><circle cx="94" cy="89.4" r="1.1" fill="#fff"/><circle cx="130" cy="89.4" r="1.1" fill="#fff"/></g>
        <path class="dori-beak" d="M104 103q8-6 16 0l-8 8Z" fill="#f5ad50" stroke="#df963e" stroke-width="1.8" stroke-linejoin="round"/>
        <ellipse cx="82" cy="105" rx="6.4" ry="3" fill="#efbbb0" opacity=".75"/><ellipse cx="140" cy="105" rx="6.4" ry="3" fill="#efbbb0" opacity=".75"/>
      </g>
      <g class="dori-document">
        <rect x="151" y="127" width="31" height="43" rx="4" fill="#fff" stroke="#7390a8" stroke-width="2.3"/>
        <path d="M157 137h17m-17 6h17m-17 6h11" fill="none" stroke="#a4b7cb" stroke-width="2" stroke-linecap="round"/>
        <path d="m161 157 3 3 6-7" fill="none" stroke="#22a99e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      </g>
      <g class="dori-bag">
        <rect x="140" y="143" width="46" height="40" rx="11" fill="#30b8ac" stroke="#147e78" stroke-width="3"/>
        <path class="dori-bag-flap" d="M141 148c0-5 4-8 10-8h24c6 0 10 3 10 8v9c-13 7-30 7-44 0Z" fill="#67d8cd" stroke="#147e78" stroke-width="2.8"/>
        <rect x="159" y="155" width="8" height="11" rx="3" fill="#e3fff6" stroke="#147e78" stroke-width="1.6"/>
        <path d="M149 174h26" stroke="#198c82" stroke-width="2" stroke-linecap="round"/>
      </g>
      <path class="dori-wing" d="M149 121c7-5 16 2 19 14 3 11-1 20-7 20-7 1-8-12-15-20" fill="#254459" stroke="#193548" stroke-width="3" stroke-linecap="round"/>
    </g>
  </svg>`;
}

// A simplified face keeps Dori legible at favicon and navigation sizes.
export function doriMarkSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="도리 펭귄 얼굴"><title>도리 펭귄 얼굴</title><rect width="64" height="64" rx="15" fill="#e3f3ef"/><path d="M32 7C17 7 8 19 8 37v9c0 8 10 12 24 12s24-4 24-12v-9C56 19 47 7 32 7Z" fill="#254459" stroke="#193548" stroke-width="2"/><path d="M32 24c-6-12-17-8-19 4-2 7-1 11 3 16-2 3-3 7-1 10 4 3 10 4 17 4s13-1 17-4c2-3 1-7-1-10 4-5 5-9 3-16-2-12-13-16-19-4Z" fill="#fbfcfa"/><ellipse cx="23" cy="33" rx="2.8" ry="3.5" fill="#203a4b"/><ellipse cx="41" cy="33" rx="2.8" ry="3.5" fill="#203a4b"/><path d="M26 43q6-4 12 0l-6 6Z" fill="#f5ad50" stroke="#df963e" stroke-width="1.2" stroke-linejoin="round"/><ellipse cx="17" cy="43" rx="3.5" ry="1.8" fill="#efbbb0"/><ellipse cx="47" cy="43" rx="3.5" ry="1.8" fill="#efbbb0"/></svg>`;
}

export function doriView(goal = 'return', {preview = false, still = false, ready = false} = {}) {
  const action = GOALS[goal] || GOALS.return;
  return `<section class="dori-loading ${preview ? 'dori-preview' : 'dori-work'}" data-mode="${preview ? 'preview' : 'work'}" data-ready="${ready}" role="status" aria-live="polite" aria-atomic="true">
    <div class="dori-scene ${still ? 'is-still' : 'is-sorting'}" data-motion="${still ? 'still' : 'animated'}">${doriSvg()}</div>
    <span class="dori-label">도리 · ${preview ? '캐릭터 미리보기' : '규칙 기반 데모'}</span>
    <h3>${preview ? '도리가 서류를 꺼내 정리해요' : ready ? `${action} 문의 틀이 준비됐어요` : `도리가 ${action} 문의 서류를 정리하고 있어요`}</h3>
    <p>${preview ? '움직임만 미리 봅니다. 사건 상태는 바뀌지 않습니다.' : ready ? '도리의 정리 동작을 잠깐 보여드린 뒤 검토 화면으로 이동해요.' : '확인한 정보로 규칙 기반 데모 문의 틀을 준비하고 있어요.'}</p>
    ${preview ? '' : '<button class="btn mini" data-action="cancel-preparation">준비 취소</button>'}
  </section>`;
}

export const PREPARATION_DELAY_MS = 2500;

// Work and the minimum character display run together. onReady truthfully marks
// finished work while its illustration remains visible. Only normal success
// waits; failure/cancellation clear timers and invalidate late async results.
export function createPreparationController({schedule = setTimeout, unschedule = clearTimeout} = {}) {
  let job = null;
  return {
    get running() { return job !== null; },
    start({work, onStart = () => {}, onReady = () => {}, onSuccess = () => {}, onError = () => {}, onCancel = () => {}, delay = PREPARATION_DELAY_MS}) {
      if (job) return false;
      const current = {timers: new Set(), onCancel, ready: false, elapsed: false, value: undefined};
      job = current;
      const clear = () => { for (const timer of current.timers) unschedule(timer); current.timers.clear(); };
      const fail = error => { if (job !== current) return; job = null; clear(); onError(error); };
      const finish = () => {
        if (job !== current || !current.ready || !current.elapsed) return;
        job = null; clear();
        try { onSuccess(current.value); } catch (error) { onError(error); }
      };
      const ready = value => {
        if (job !== current) return;
        try { current.ready = true; current.value = value; onReady(value); finish(); } catch (error) { fail(error); }
      };
      const queue = (callback, timeout) => {
        const timer = schedule(() => { current.timers.delete(timer); if (job === current) callback(); }, timeout);
        current.timers.add(timer);
      };
      try {
        onStart();
        if (job !== current) return false;
        queue(() => { current.elapsed = true; finish(); }, Math.max(0, Number(delay) || 0));
        queue(() => {
          try { const value = work(); if (value && typeof value.then === 'function') Promise.resolve(value).then(ready, fail); else ready(value); }
          catch (error) { fail(error); }
        }, 0);
      } catch (error) {
        fail(error);
      }
      return true;
    },
    cancel(reason = 'cancelled') {
      if (!job) return false;
      const current = job;
      job = null;
      for (const timer of current.timers) unschedule(timer);
      current.timers.clear();
      current.onCancel(reason);
      return true;
    }
  };
}
