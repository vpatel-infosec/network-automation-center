/**
 * Small indirection that lets services emit Socket.IO events without importing
 * the socket module (avoids circular imports and keeps services testable).
 */
let io = null;

export function setIo(instance) {
  io = instance;
}

export function getIo() {
  return io;
}

/** Emit to a job-specific room (users looking at that job). */
export function emitJobUpdate(jobId, payload) {
  if (!io) return;
  io.to(`job:${jobId}`).emit('job:update', payload);
  io.emit('job:changed', { jobId: String(jobId), status: payload?.status });
}

/** Emit a general event (e.g. dashboard should refresh). */
export function emitBroadcast(event, payload) {
  if (!io) return;
  io.emit(event, payload);
}

export default { setIo, getIo, emitJobUpdate, emitBroadcast };
