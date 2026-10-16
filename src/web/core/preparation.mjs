export const PREPARATION_DELAY_MS = 2500;

// Runs async work while a loading illustration stays visible for at least
// `delay` ms. Only one job at a time; cancel() drops a late result.
export function createPreparationController({schedule = setTimeout, unschedule = clearTimeout} = {}) {
  let job = null;

  return {
    get running() { return job !== null; },

    start({work, onSuccess = () => {}, onError = () => {}, onCancel = () => {}, delay = PREPARATION_DELAY_MS}) {
      if (job) return false;
      const current = {timers: new Set(), onCancel, ready: false, elapsed: false, value: undefined};
      job = current;
      const clear = () => { for (const timer of current.timers) unschedule(timer); current.timers.clear(); };
      const fail = error => {
        if (job !== current) return;
        job = null;
        clear();
        onError(error);
      };
      const finish = () => {
        if (job !== current || !current.ready || !current.elapsed) return;
        job = null;
        clear();
        try { onSuccess(current.value); } catch (error) { onError(error); }
      };
      const queue = (callback, timeout) => {
        const timer = schedule(() => { current.timers.delete(timer); if (job === current) callback(); }, timeout);
        current.timers.add(timer);
      };

      queue(() => { current.elapsed = true; finish(); }, Math.max(0, Number(delay) || 0));
      queue(() => {
        Promise.resolve().then(work).then(value => {
          if (job !== current) return;
          current.ready = true;
          current.value = value;
          finish();
        }, fail);
      }, 0);
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
    },
  };
}
