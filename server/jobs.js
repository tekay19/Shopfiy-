const { randomUUID } = require('node:crypto');
const { EventEmitter } = require('node:events');

function createJobStore() {
  const eventsByJob = new Map();
  const emitters = new Map();
  const doneJobs = new Set();

  function startJob(runFn) {
    const jobId = randomUUID();
    eventsByJob.set(jobId, []);
    const emitter = new EventEmitter();
    emitters.set(jobId, emitter);

    function emit(event) {
      eventsByJob.get(jobId).push(event);
      emitter.emit('event', event);
      if (event.step === 'done') doneJobs.add(jobId);
    }

    runFn(emit).catch((err) => {
      emit({ step: 'done', status: 'error', message: err.message });
    });

    return jobId;
  }

  function getEvents(jobId) {
    return eventsByJob.get(jobId) || [];
  }

  function subscribe(jobId, listener) {
    const emitter = emitters.get(jobId);
    if (!emitter) return () => {};
    emitter.on('event', listener);
    return () => emitter.off('event', listener);
  }

  function isDone(jobId) {
    return doneJobs.has(jobId);
  }

  function jobExists(jobId) {
    return eventsByJob.has(jobId);
  }

  return { startJob, getEvents, subscribe, isDone, jobExists };
}

module.exports = { createJobStore };
